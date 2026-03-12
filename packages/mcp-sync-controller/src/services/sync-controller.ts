import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { getToolCollection, embeddingProvider } from "./search.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);
const REGISTRY = process.env.REGISTRY || "http://127.0.0.1:8080";
const WATCH_DIR = process.env.SERVERS_DIR || "/config/servers.d";
const SECRETS_FILE = process.env.SECRETS_FILE || "/config/secrets.enc";

const META_TOOLS = new Set(["agenticflow__discover_tools", "agenticflow__call_tool", "agenticflow__refresh_tool_index"]);

let isSyncing = false;
const configCache = new Map<string, string>(); // name -> stringified TEMPLATE config (pre-resolution)

export function resetSyncState() {
    isSyncing = false;
    configCache.clear();
}

/**
 * Resolves ${VAR} and {{VAR}} placeholders in a server config's env block.
 */
export function resolveEnvVars(config: any, env: Record<string, string | undefined> = process.env as any): any {
    if (!config.env || typeof config.env !== "object") return config;

    const resolvedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.env)) {
        resolvedEnv[key] = String(value).replace(
            /\$\{([A-Z0-9_]+)\}|\{\{([A-Z0-9_]+)\}\}/gi,
            (match, g1, g2) => {
                const varName = g1 ?? g2;
                const resolved = env[varName];
                if (resolved === undefined) {
                    logger.warn(`Secret '${varName}' not found in environment for server env key '${key}'`, "sync-controller");
                    return match;
                }
                return resolved;
            }
        );
    }
    return { ...config, env: resolvedEnv };
}

export async function syncState() {
    if (isSyncing) {
        logger.info("Sync already in progress, skipping...", "sync-controller");
        return;
    }
    isSyncing = true;
    logger.info("Starting synchronization cycle...", "sync-controller");

    try {
        const res = await fetch(`${REGISTRY}/api/v0/servers`);
        if (!res.ok) throw new Error(`Failed to fetch registry state: ${res.status}`);
        const currentServersList = await res.json() as Array<{ name: string }>;
        const currentServers = new Set(currentServersList.map(s => s.name));

        if (configCache.size === 0) {
            logger.info("Initial sync cycle: enforcing current registry exposure states...", "sync-controller");
            await enforceExistingRegistryState(currentServers);
        }

        const files = fs.existsSync(WATCH_DIR)
            ? fs.readdirSync(WATCH_DIR).filter((f: string) => f.endsWith(".json") && !f.toLowerCase().includes("example"))
            : [];

        const desiredServers = new Map<string, any>();
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(WATCH_DIR, file), "utf-8");
                const config = JSON.parse(content);
                if (config.name) {
                    desiredServers.set(config.name, config);
                }
            } catch (e) {
                logger.warn(`Failed to parse ${file}`, "sync-controller", { error: String(e) });
            }
        }

        let registryChanged = false;
        for (const name of currentServers) {
            if (!desiredServers.has(name) && name !== "agenticflow") {
                logger.info(`Deregistering removed server: ${name}`, "sync-controller");
                try {
                    await execFileAsync("mcpjungle", ["deregister", name, "--registry", REGISTRY]);
                    configCache.set(name, ""); // marker for deleted
                    registryChanged = true;
                } catch (e) {
                    logger.error(`Failed to deregister ${name}`, "sync-controller", { error: String(e) });
                }
            }
        }

        const agenticflowConfig = desiredServers.get("agenticflow");
        if (agenticflowConfig) {
            const registered = await registerOrUpdateServer("agenticflow", agenticflowConfig, currentServers);
            if (registered) registryChanged = true;
            await enforceExposureState("agenticflow", true);
        }

        for (const [name, config] of desiredServers.entries()) {
            if (name === "agenticflow") continue;
            const registered = await registerOrUpdateServer(name, config, currentServers);
            if (registered) registryChanged = true;
            await enforceExposureState(name, config.expose === true);
        }

        if (registryChanged) {
            logger.info("Changes detected. Refreshing semantic tool index...", "sync-controller");
            await new Promise(r => setTimeout(r, 2000));
            for (const [name, config] of desiredServers.entries()) {
                 await enforceExposureState(name, name === "agenticflow" ? true : config.expose === true);
            }
            await refreshIndex();
        }

        logger.info("Synchronization complete.", "sync-controller");
    } catch (err) {
        logger.error("Synchronization failed", "sync-controller", { error: String(err) });
    } finally {
        isSyncing = false;
    }
}

async function registerOrUpdateServer(name: string, config: any, currentServers: Set<string>): Promise<boolean> {
    const templateString = JSON.stringify(config);
    const isUnchanged = configCache.get(name) === templateString && currentServers.has(name);

    if (isUnchanged) {
        logger.debug(`Server ${name} config unchanged, skipping re-registration`, "sync-controller");
        return false;
    }

    try {
        if (currentServers.has(name)) {
            logger.info(`Config changed or missing in registry. Updating existing server: ${name}`, "sync-controller");
            try {
                const delRes = await fetch(`${REGISTRY}/api/v0/servers/${name}`, {
                    method: "DELETE"
                });
            } catch (e) { }
        } else {
            logger.info(`Registering new server: ${name}`, "sync-controller");
        }

        const resolvedConfig = resolveEnvVars(config, process.env as any);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const postRes = await fetch(`${REGISTRY}/api/v0/servers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resolvedConfig),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (postRes.ok) {
            configCache.set(name, templateString);
            logger.info(`Successfully (re)registered ${name}`, "sync-controller");
            return true;
        } else {
            const errText = await postRes.text();
            logger.error(`Failed to register ${name}: ${errText}`, "sync-controller");
        }
    } catch (e) {
        logger.error(`Error during registration of ${name}`, "sync-controller", { error: String(e) });
    }
    return false;
}

async function enforceExposureState(name: string, shouldExpose: boolean) {
    try {
        if (!shouldExpose) {
            logger.debug(`Ensuring server is HIDDEN: ${name}`, "sync-controller");
            await execFileAsync("mcpjungle", ["disable", "server", name, "--registry", REGISTRY]);
        } else {
            logger.info(`Ensuring server is EXPOSED: ${name}`, "sync-controller");
            await execFileAsync("mcpjungle", ["enable", "server", name, "--registry", REGISTRY]);
        }
    } catch (e) {
        logger.error(`Failed to enforce exposure state for ${name}`, "sync-controller", { error: String(e) });
    }
}

async function enforceExistingRegistryState(currentServers: Set<string>) {
    for (const name of currentServers) {
        if (name === "agenticflow") {
            await enforceExposureState(name, true);
        } else {
            await enforceExposureState(name, false);
        }
    }
}

async function refreshIndex() {
    try {
        const collection = await getToolCollection();
        const res = await fetch(`${REGISTRY}/api/v0/tools`);
        if (!res.ok) {
            throw new Error(`Failed to fetch tools from registry: ${res.statusText}`);
        }
        const tools = await res.json() as Array<{ name: string, description: string }>;

        const count = await collection.count();
        if (count > 0) {
            const existing = await collection.get({ limit: count });
            await collection.delete({ ids: existing.ids });
        }

        let indexed = 0;
        for (const tool of tools) {
            if (META_TOOLS.has(tool.name)) continue;

            const textToEmbed = `${tool.name}: ${tool.description}`;
            const embedding = await embeddingProvider.generate(textToEmbed);
            await collection.upsert({
                ids: [tool.name],
                embeddings: [embedding],
                documents: [tool.description || "No description provided"],
                metadatas: [{ name: tool.name }],
            });
            indexed++;
        }
        logger.info(`Indexed ${indexed} tools successfully.`, "sync-controller");
    } catch (e) {
        logger.error("Failed to refresh index", "sync-controller", { error: String(e) });
    }
}

export function startSyncController() {
    logger.info(`Initializing Sync Controller on ${WATCH_DIR}`, "sync-controller");

    syncState().catch(() => { });

    let timeout: NodeJS.Timeout | null = null;
    const triggerSync = (reason?: string) => {
        if (timeout) clearTimeout(timeout);
        if (reason) logger.info(`Sync triggered: ${reason}`, "sync-controller");
        timeout = setTimeout(() => {
            syncState();
        }, 2000);
    };

    const configWatcher = chokidar.watch(WATCH_DIR, {
        persistent: true,
        ignoreInitial: true,
        depth: 0
    });

    configWatcher
        .on("add", () => triggerSync("new server config added"))
        .on("change", () => triggerSync("server config changed"))
        .on("unlink", () => triggerSync("server config removed"));

    if (fs.existsSync(path.dirname(SECRETS_FILE))) {
        const secretsWatcher = chokidar.watch(SECRETS_FILE, {
            persistent: true,
            ignoreInitial: true,
        });

        secretsWatcher.on("change", () => {
            logger.info("secrets.enc changed — clearing config cache for hot-reload", "sync-controller");
            configCache.clear();
            triggerSync("secrets.enc updated");
        });

        logger.info(`Watching secrets file for hot-reload: ${SECRETS_FILE}`, "sync-controller");
    }
}

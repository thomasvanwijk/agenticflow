import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getCollection } from "./chroma.js";
import { generateEmbedding } from "../providers/index.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);
const REGISTRY = process.env.REGISTRY || "http://127.0.0.1:8080";
const WATCH_DIR = process.env.SERVERS_DIR || "/config/servers.d";
const SECRETS_FILE = process.env.SECRETS_FILE || "/config/secrets.enc";

// HIDDEN_SERVERS is now replaced by a "hidden by default" logic.
// Any server that is not "agenticflow" and doesn't have "expose": true in its config will be hidden.

const META_TOOLS = new Set(["agenticflow__discover_tools", "agenticflow__call_tool", "agenticflow__refresh_tool_index"]);

let isSyncing = false;
const configCache = new Map<string, string>(); // name -> stringified TEMPLATE config (pre-resolution)

export function resetSyncState() {
    isSyncing = false;
    configCache.clear();
}

/**
 * Resolves ${VAR} and {{VAR}} placeholders in a server config's env block.
 * Resolution is performed against the provided env map (defaults to process.env).
 * Unresolvable placeholders are left as-is so they are visible in logs.
 * The original config object is never mutated.
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
                    return match; // Leave placeholder as-is
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
        // 1. Get registry state first
        const res = await fetch(`${REGISTRY}/api/v0/servers`);
        if (!res.ok) throw new Error(`Failed to fetch registry state: ${res.status}`);
        const currentServersList = await res.json() as Array<{ name: string }>;
        const currentServers = new Set(currentServersList.map(s => s.name));

        // 2. Perform a one-time startup enforcement pass to close the restart race window
        // If configCache is empty, it means we just booted or secrets changed.
        if (configCache.size === 0) {
            logger.info("Initial sync cycle: enforcing current registry exposure states...", "sync-controller");
            await enforceExistingRegistryState(currentServers);
        }

        // 3. Get filesystem state (template configs with ${VAR} placeholders)
        const files = fs.existsSync(WATCH_DIR)
            ? fs.readdirSync(WATCH_DIR).filter(f => f.endsWith(".json") && !f.toLowerCase().includes("example"))
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

        // 4. Delete orphaned servers
        let registryChanged = false;
        for (const name of currentServers) {
            if (!desiredServers.has(name) && name !== "agenticflow") {
                logger.info(`Deregistering removed server: ${name}`, "sync-controller");
                try {
                    await execFileAsync("/usr/local/bin/mcpjungle", ["deregister", name, "--registry", REGISTRY]);
                    configCache.delete(name);
                    registryChanged = true;
                } catch (e) {
                    logger.error(`Failed to deregister ${name}`, "sync-controller", { error: String(e) });
                }
            }
        }

        // 5. Register or Update servers with explicit ordering

        // 5.1 Handle agenticflow server first — ALWAYS force-enabled
        const agenticflowConfig = desiredServers.get("agenticflow");
        if (agenticflowConfig) {
            const registered = await registerOrUpdateServer("agenticflow", agenticflowConfig, currentServers);
            if (registered) registryChanged = true;
            // Always force-enable agenticflow so it is the ONLY thing visible at boot
            await enforceExposureState("agenticflow", true);
        }

        // 5.2 Handle all other servers sequentially
        const handledServers = new Set<string>(["agenticflow"]);
        for (const [name, config] of desiredServers.entries()) {
            if (name === "agenticflow") continue;
            
            const registered = await registerOrUpdateServer(name, config, currentServers);
            if (registered) registryChanged = true;
            
            // Immediately (re)enforce exposure state. 
            // We do this EVERY cycle to ensure Postgres-transient state is eventually consistent.
            await enforceExposureState(name, config.expose === true);
            handledServers.add(name);
        }

        // 6. Update semantic index if things changed
        if (registryChanged) {
            logger.info("Changes detected. Refreshing semantic tool index...", "sync-controller");
            // Small delay to allow mcpjungle to fully initialize the tools
            await new Promise(r => setTimeout(r, 2000));
            await refreshIndex();
        }

        logger.info("Synchronization complete.", "sync-controller");
    } catch (err) {
        logger.error("Synchronization failed", "sync-controller", { error: String(err) });
    } finally {
        isSyncing = false;
    }
}

/**
 * Register or update a single server. 
 * Uses TEMPLATE config (pre-resolution) for change detection to handle secret hot-reloads.
 */
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
            // We no longer explicitly deregister here to avoid creating an exposure window.
            // MCPJungle handles the update atomically via the POST endpoint.
        } else {
            logger.info(`Registering new server: ${name}`, "sync-controller");
        }

        // Resolve ${VAR} placeholders in-memory from process.env.
        const resolvedConfig = resolveEnvVars(config, process.env as any);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 300s timeout

        const postRes = await fetch(`${REGISTRY}/api/v0/servers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resolvedConfig),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (postRes.ok) {
            // Cache the TEMPLATE (not the resolved config)
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

/**
 * CLI bridge to MCPJungle enable/disable server commands.
 */
async function enforceExposureState(name: string, shouldExpose: boolean) {
    try {
        if (!shouldExpose) {
            logger.debug(`Ensuring server is HIDDEN: ${name}`, "sync-controller");
            await execFileAsync("/usr/local/bin/mcpjungle", ["disable", "server", name, "--registry", REGISTRY]);
        } else {
            logger.info(`Ensuring server is EXPOSED: ${name}`, "sync-controller");
            await execFileAsync("/usr/local/bin/mcpjungle", ["enable", "server", name, "--registry", REGISTRY]);
        }
    } catch (e) {
        logger.error(`Failed to enforce exposure state for ${name}`, "sync-controller", { error: String(e) });
    }
}

/**
 * Enforces a conservative default state on all servers currently in the registry.
 * Called at boot before the filesystem sync loop.
 */
async function enforceExistingRegistryState(currentServers: Set<string>) {
    for (const name of currentServers) {
        if (name === "agenticflow") {
            await enforceExposureState(name, true);
        } else {
            // Conservative: hide anything in registry that we haven't processed yet
            await enforceExposureState(name, false);
        }
    }
}

async function refreshIndex() {
    // ... unchanged
    try {
        const collection = await getCollection("mcp_tools");
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
            const embedding = await generateEmbedding(textToEmbed);
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

    // Perform an immediate sync to enforce states on startup
    syncState().catch(() => { });

    let timeout: NodeJS.Timeout | null = null;

    const triggerSync = (reason?: string) => {
        if (timeout) clearTimeout(timeout);
        if (reason) logger.info(`Sync triggered: ${reason}`, "sync-controller");
        timeout = setTimeout(() => {
            syncState();
        }, 2000); // 2s debounce
    };

    // Watch for config file changes (new/updated/removed MCP servers)
    const configWatcher = chokidar.watch(WATCH_DIR, {
        persistent: true,
        ignoreInitial: true,
        depth: 0
    });

    configWatcher
        .on("add", () => triggerSync("new server config added"))
        .on("change", () => triggerSync("server config changed"))
        .on("unlink", () => triggerSync("server config removed"));

    // Watch for secrets.enc changes (hot-reload credentials).
    // When secrets change, clear the config cache so all servers are re-registered
    // with freshly resolved credentials — no container restart needed.
    if (fs.existsSync(path.dirname(SECRETS_FILE))) {
        const secretsWatcher = chokidar.watch(SECRETS_FILE, {
            persistent: true,
            ignoreInitial: true,
        });

        secretsWatcher.on("change", () => {
            logger.info("secrets.enc changed — clearing config cache for hot-reload", "sync-controller");
            configCache.clear(); // Force all servers to re-register with fresh secrets
            triggerSync("secrets.enc updated");
        });

        logger.info(`Watching secrets file for hot-reload: ${SECRETS_FILE}`, "sync-controller");
    }
}
import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getCollection } from "./chroma.js";
import { generateEmbedding } from "../providers/index.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);
const REGISTRY = "http://127.0.0.1:8080";
const WATCH_DIR = process.env.SERVERS_DIR || "/config/servers.d";

const HIDDEN_SERVERS = ["obsidian", "atlassian"];

export async function syncState() {
    logger.info("Starting synchronization cycle...", "sync-controller");

    try {
        // 1. Get filesystem state
        const files = fs.existsSync(WATCH_DIR) 
            ? fs.readdirSync(WATCH_DIR).filter(f => f.endsWith(".json") && !f.includes("example"))
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

        // 2. Get registry state
        const res = await fetch(`${REGISTRY}/api/v0/servers`);
        if (!res.ok) throw new Error(`Failed to fetch registry state: ${res.status}`);
        const currentServersList = await res.json() as Array<{name: string}>;
        const currentServers = new Set(currentServersList.map(s => s.name));

        // 3. Delete orphaned servers
        let registryChanged = false;
        for (const name of currentServers) {
            if (!desiredServers.has(name)) {
                logger.info(`Deregistering removed server: ${name}`, "sync-controller");
                try {
                    await execFileAsync("mcpjungle", ["deregister", name, "--registry", REGISTRY]);
                    registryChanged = true;
                } catch (e) {
                    logger.error(`Failed to deregister ${name}`, "sync-controller", { error: String(e) });
                }
            }
        }

        // 4. Register new servers
        for (const [name, config] of desiredServers.entries()) {
            if (!currentServers.has(name)) {
                logger.info(`Registering new server: ${name}`, "sync-controller");
                try {
                    const postRes = await fetch(`${REGISTRY}/api/v0/servers`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(config)
                    });
                    
                    if (postRes.ok) {
                        registryChanged = true;
                        if (HIDDEN_SERVERS.includes(name)) {
                            logger.info(`Hiding server: ${name}`, "sync-controller");
                            await execFileAsync("mcpjungle", ["disable", "server", name, "--registry", REGISTRY]);
                        }
                    } else {
                        const errText = await postRes.text();
                        logger.error(`Failed to register ${name}: ${errText}`, "sync-controller");
                    }
                } catch (e) {
                    logger.error(`Error during registration of ${name}`, "sync-controller", { error: String(e) });
                }
            }
        }

        // Enforce hidden state for existing servers just in case
        for (const name of currentServers) {
            if (desiredServers.has(name) && HIDDEN_SERVERS.includes(name)) {
                await execFileAsync("mcpjungle", ["disable", "server", name, "--registry", REGISTRY]).catch(e => {
                    logger.error(`Failed to enforce hidden state for ${name}`, "sync-controller", { error: String(e) });
                });
            }
        }

        // 5. Update semantic index if things changed
        if (registryChanged) {
            logger.info("Changes detected. Refreshing semantic tool index...", "sync-controller");
            // Small delay to allow mcpjungle to fully initialize the tools
            await new Promise(r => setTimeout(r, 2000));
            await refreshIndex();
        }
        
        logger.info("Synchronization complete.", "sync-controller");
    } catch (err) {
        logger.error("Synchronization failed", "sync-controller", { error: String(err) });
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
        const tools = await res.json() as Array<{name: string, description: string}>;

        const count = await collection.count();
        if (count > 0) {
            const existing = await collection.get({ limit: count });
            await collection.delete({ ids: existing.ids });
        }

        let indexed = 0;
        for (const tool of tools) {
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
    
    // Perform an immediate synchronous run to enforce states on startup
    syncState().catch(() => {});
    
    let timeout: NodeJS.Timeout | null = null;
    
    const triggerSync = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            syncState();
        }, 2000); // 2s debounce
    };

    const watcher = chokidar.watch(WATCH_DIR, {
        persistent: true,
        ignoreInitial: true, 
        depth: 0
    });

    watcher
        .on('add', triggerSync)
        .on('change', triggerSync)
        .on('unlink', triggerSync);
}
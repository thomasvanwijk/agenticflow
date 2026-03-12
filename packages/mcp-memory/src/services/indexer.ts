import fs from "fs";
import path from "path";
import os from "os";
import chokidar from "chokidar";
import { VAULT_PATH } from "../config.js";
import { readNote, walkVault } from "./vault.js";
import { getMemoryCollection, embeddingProvider } from "./search.js";
import { logger } from "../utils/logger.js";

export async function indexVault(force = false) {
    const collection = await getMemoryCollection();
    const files = walkVault(VAULT_PATH);

    if (!files.length) {
        if (!fs.existsSync(VAULT_PATH)) {
            throw new Error(`Vault directory not found at ${VAULT_PATH}. Please check your volume configuration.`);
        }
        return { indexed: 0, skipped: 0, total: 0 };
    }

    let indexed = 0;
    let skipped = 0;

    for (const filePath of files) {
        const relPath = path.relative(VAULT_PATH, filePath);
        const { content, data } = readNote(filePath);
        if (!content.trim()) { skipped++; continue; }

        const stat = fs.statSync(filePath);
        const id = relPath.replace(/\\/g, "/");

        if (!force) {
            const existing = await collection.get({ ids: [id] });
            if (existing.ids.length > 0) {
                const meta = existing.metadatas?.[0] as Record<string, unknown> | undefined;
                if (meta && meta.mtime === Math.floor(stat.mtimeMs)) { skipped++; continue; }
            }
        }

        try {
            const embedding = await embeddingProvider.generate(content);
            await collection.upsert({
                ids: [id],
                embeddings: [embedding],
                documents: [content.slice(0, 8000)],
                metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
            });
            indexed++;
        } catch (fileErr) {
            logger.warn("Skipping file during index", { path: relPath, error: (fileErr as Error).message });
            skipped++;
        }
    }

    return { indexed, skipped, total: files.length };
}

export async function startAutoIndexer() {
    try {
        const isLowHardware = os.totalmem() < 4 * 1024 * 1024 * 1024 || os.cpus().length <= 2;
        logger.info("Auto-indexer starting", { hardwareProfile: isLowHardware ? 'Low' : 'Standard' });

        const collection = await getMemoryCollection();

        const watcher = chokidar.watch(path.join(VAULT_PATH, "**/*.md"), {
            ignored: [/(^|[/\\])\../, "**/node_modules/**"],
            persistent: true,
            ignoreInitial: true,
            usePolling: false,
            depth: isLowHardware ? 5 : 99,
            awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 500 }
        });

        const indexFile = async (filePath: string, action: string) => {
            try {
                const relPath = path.relative(VAULT_PATH, filePath);
                const { content, data } = readNote(filePath);
                if (!content.trim()) return;

                const stat = fs.statSync(filePath);
                const id = relPath.replace(/\\/g, "/");

                if (action === 'add') {
                    const existing = await collection.get({ ids: [id] });
                    if (existing.ids.length > 0) {
                        const meta = existing.metadatas?.[0] as Record<string, unknown> | undefined;
                        if (meta && meta.mtime === Math.floor(stat.mtimeMs)) return;
                    }
                }

                const embedding = await embeddingProvider.generate(content);
                await collection.upsert({
                    ids: [id],
                    embeddings: [embedding],
                    documents: [content.slice(0, 8000)],
                    metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
                });
                logger.info(`Auto-${action}ed file`, { id });
            } catch (err) {
                logger.error(`Failed to auto-${action} file`, { path: filePath, error: (err as Error).message });
            }
        };

        watcher.on('add', (path: string) => indexFile(path, 'add'));
        watcher.on('change', (path: string) => indexFile(path, 'update'));
        watcher.on('unlink', async (filePath: string) => {
            try {
                const relPath = path.relative(VAULT_PATH, filePath);
                const id = relPath.replace(/\\/g, "/");
                await collection.delete({ ids: [id] });
                logger.info("Auto-removed file", { id });
            } catch (err) { }
        });

    } catch (err) {
        logger.error("Failed to start auto-indexer", { error: (err as Error).message });
    }
}

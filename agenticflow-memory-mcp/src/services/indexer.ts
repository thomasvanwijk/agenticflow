import fs from "fs";
import path from "path";
import os from "os";
import chokidar from "chokidar";
import { VAULT_PATH } from "../config.js";
import { readNote, walkVault } from "./vault.js";
import { getCollection } from "./chroma.js";
import { generateEmbedding } from "../providers/index.js";

export async function indexVault(force = false) {
    const collection = await getCollection();
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
            const embedding = await generateEmbedding(content);
            await collection.upsert({
                ids: [id],
                embeddings: [embedding],
                documents: [content.slice(0, 8000)],
                metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
            });
            indexed++;
        } catch (fileErr) {
            process.stderr.write(`Skipping ${relPath}: ${(fileErr as Error).message}\n`);
            skipped++;
        }
    }

    return { indexed, skipped, total: files.length };
}

export async function startAutoIndexer() {
    try {
        const isLowHardware = os.totalmem() < 4 * 1024 * 1024 * 1024 || os.cpus().length <= 2;
        process.stderr.write(`[agenticflow] Auto-indexer starting. Hardware profile: ${isLowHardware ? 'Low (tuned for Chromebox)' : 'Standard'}\n`);

        const collection = await getCollection();

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

                const embedding = await generateEmbedding(content);
                await collection.upsert({
                    ids: [id],
                    embeddings: [embedding],
                    documents: [content.slice(0, 8000)],
                    metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
                });
                process.stderr.write(`[agenticflow] Auto-${action}ed: ${id}\n`);
            } catch (err) {
                process.stderr.write(`[agenticflow] Failed to auto-${action} ${filePath}: ${(err as Error).message}\n`);
            }
        };

        watcher.on('add', (path) => indexFile(path, 'add'));
        watcher.on('change', (path) => indexFile(path, 'updat'));
        watcher.on('unlink', async (filePath) => {
            try {
                const relPath = path.relative(VAULT_PATH, filePath);
                const id = relPath.replace(/\\/g, "/");
                await collection.delete({ ids: [id] });
                process.stderr.write(`[agenticflow] Auto-removed: ${id}\n`);
            } catch (err) { }
        });

    } catch (err) {
        process.stderr.write(`[agenticflow] Failed to start auto-indexer: ${(err as Error).message}\n`);
    }
}

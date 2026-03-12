import { ChromaClient, Collection } from "chromadb";
import express from "express";

export interface ChromaConfig {
    host: string;
    port: number;
}

const noOpEmbeddingFunction = {
    generate: async (): Promise<number[][]> => {
        throw new Error("Chroma internal generate() called. Supply embeddings manually during upsert.");
    },
};

export class SemanticSearchCore {
    private client: ChromaClient;

    constructor(config: ChromaConfig) {
        const protocol = config.port === 443 ? "https" : "http";
        this.client = new ChromaClient({ path: `${protocol}://${config.host}:${config.port}` });
    }

    async getCollection(name: string): Promise<Collection> {
        return this.client.getOrCreateCollection({
            name,
            embeddingFunction: noOpEmbeddingFunction,
        });
    }

    async listCollections() {
        return this.client.listCollections();
    }

    async deleteCollection(name: string) {
        return this.client.deleteCollection({ name });
    }
    
    // REST API Wrapper for managing collections globally
    createRestApi(port: number) {
        const app = express();
        app.use(express.json());

        app.get("/api/collections", async (req, res) => {
            try {
                const collections = await this.listCollections();
                res.json(collections);
            } catch (err) {
                res.status(500).json({ error: String(err) });
            }
        });

        app.get("/api/collections/:name", async (req, res) => {
            try {
                const collection = await this.getCollection(req.params.name);
                const count = await collection.count();
                res.json({ name: req.params.name, count });
            } catch (err) {
                res.status(500).json({ error: String(err) });
            }
        });

        app.delete("/api/collections/:name", async (req, res) => {
            try {
                await this.deleteCollection(req.params.name);
                res.json({ success: true, deleted: req.params.name });
            } catch (err) {
                res.status(500).json({ error: String(err) });
            }
        });

        app.post("/api/collections/:name/clear", async (req, res) => {
            try {
                const collection = await this.getCollection(req.params.name);
                const count = await collection.count();
                if (count > 0) {
                    const existing = await collection.get({ limit: count });
                    if (existing.ids.length > 0) {
                        await collection.delete({ ids: existing.ids });
                    }
                }
                res.json({ success: true, cleared: req.params.name });
            } catch (err) {
                res.status(500).json({ error: String(err) });
            }
        });

        return new Promise<void>((resolve) => {
            app.listen(port, () => {
                console.log(`[SemanticSearchCore] REST API listening on port ${port}`);
                resolve();
            });
        });
    }
}

export * from "@agenticflow/mcp-embedding-providers";

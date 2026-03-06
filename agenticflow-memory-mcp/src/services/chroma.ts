import { ChromaClient, Collection } from "chromadb";
import { CHROMA_HOST, CHROMA_PORT, EMBEDDING_PROVIDER } from "../config.js";

// No-op embedding function for ChromaDB registration — we always provide external embeddings
export const noOpEmbeddingFunction = {
    generate: async (): Promise<number[][]> => {
        throw new Error("Chroma internal generate() called. Use generateEmbedding() instead.");
    },
};

export async function getCollection(name?: string): Promise<Collection> {
    const baseName = name ?? "obsidian_vault";
    const collectionName = `${baseName}_${EMBEDDING_PROVIDER}`;
    const client = new ChromaClient({ host: CHROMA_HOST, port: parseInt(CHROMA_PORT), ssl: false });
    return client.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: noOpEmbeddingFunction,
    });
}

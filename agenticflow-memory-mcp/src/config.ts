import fs from "fs";
import path from "path";

export const VAULT_PATH = process.env.VAULT_PATH || "/vault";
export const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
export const CHROMA_PORT = process.env.CHROMA_PORT || "8000";
export const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "ollama";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/jina-embeddings-v2-small-en";
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export function validateConfig() {
    if (!fs.existsSync(VAULT_PATH)) {
        process.stderr.write(`[agenticflow] CRITICAL: VAULT_PATH does not exist: ${VAULT_PATH}\n`);
        process.stderr.write(`Please ensure your vault directory is correctly mounted to ${VAULT_PATH} in docker-compose.yaml\n`);
    }
}

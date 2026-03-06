import fs from "fs";
import path from "path";
import { logger } from "./utils/logger.js";

export const VAULT_PATH = process.env.VAULT_PATH || "/vault";
export const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
export const CHROMA_PORT = process.env.CHROMA_PORT || "8000";
export const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "ollama";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/jina-embeddings-v2-small-en";
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const LOG_LEVEL = process.env.LOG_LEVEL || "INFO";

export function validateConfig() {
    if (!fs.existsSync(VAULT_PATH)) {
        logger.error("VAULT_PATH does not exist", { path: VAULT_PATH });
        logger.info("Please ensure your vault directory is correctly mounted in docker-compose.yaml");
    }
}

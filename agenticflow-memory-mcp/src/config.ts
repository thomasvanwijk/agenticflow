import fs from "fs";
import { z } from "zod";
import { logger } from "./utils/logger.js";

const configSchema = z.object({
    VAULT_PATH: z.string().default("/vault"),
    CHROMA_HOST: z.string().default("localhost"),
    CHROMA_PORT: z.string().default("8000"),
    EMBEDDING_PROVIDER: z.enum(["ollama", "openai", "local"]).default("ollama"),
    EMBEDDING_MODEL: z.string().default("Xenova/jina-embeddings-v2-small-en"),
    OLLAMA_BASE_URL: z.string().url().default("http://host.docker.internal:11434"),
    OPENAI_API_KEY: z.string().optional().default(""),
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
    process.stderr.write(`[agenticflow] Configuration Error: ${parsed.error.message}\n`);
    process.exit(1);
}

export const {
    VAULT_PATH,
    CHROMA_HOST,
    CHROMA_PORT,
    EMBEDDING_PROVIDER,
    EMBEDDING_MODEL,
    OLLAMA_BASE_URL,
    OPENAI_API_KEY,
    LOG_LEVEL,
} = parsed.data;

export function validateConfig() {
    if (!fs.existsSync(VAULT_PATH)) {
        logger.error("VAULT_PATH does not exist", { path: VAULT_PATH });
        logger.info("Please ensure your vault directory is correctly mounted in docker-compose.yaml");
    }
}

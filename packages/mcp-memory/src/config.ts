import fs from "fs";
import { z } from "zod";
import { logger } from "./utils/logger.js";

const configSchema = z.object({
    VAULT_PATH: z.string().default("/vault"),
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
    ENABLE_OBSIDIAN_FEATURES: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
    AI_ATTRIBUTION_CALLOUT_TYPE: z.string().default("ai"),
    AI_ATTRIBUTION_INCLUDE_MODEL: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(true),
    AI_ATTRIBUTION_INCLUDE_DATE: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(true),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
    process.stderr.write(`[mcp-memory] Configuration Error: ${parsed.error.message}\n`);
    process.exit(1);
}

export const {
    VAULT_PATH,
    LOG_LEVEL,
    ENABLE_OBSIDIAN_FEATURES,
    AI_ATTRIBUTION_CALLOUT_TYPE,
    AI_ATTRIBUTION_INCLUDE_MODEL,
    AI_ATTRIBUTION_INCLUDE_DATE,
} = parsed.data;

export function validateConfig() {
    if (!fs.existsSync(VAULT_PATH)) {
        logger.error("VAULT_PATH does not exist", { path: VAULT_PATH });
    }
    logger.info("Memory settings", "config_startup", { 
        obsidian_features: ENABLE_OBSIDIAN_FEATURES
    });
}

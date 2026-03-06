import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

// Load existing env for the CLI process context
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath, quiet: true });

const configSchema = z.object({
    ALGORITHM: z.string().default("aes-256-gcm"),
    SALT: z.string().default("agenticflow-salt"),
    ENV_FILE: z.string().default(envPath),
    DEFAULT_SECRETS_FILE: z.string().default(path.resolve(process.cwd(), "config/secrets.enc")),
    CONFIG_DIR: z.string().default(path.resolve(process.cwd(), "config")),
    HOST_PORT: z.string().default("18080"),
    AGENTICFLOW_DEBUG: z.preprocess(
        (v) => v === "1" || v === "true",
        z.boolean().default(false)
    ),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
    process.stderr.write(`[agenticflow-cli] Configuration Error: ${parsed.error.message}\n`);
    process.exit(1);
}

export const {
    ALGORITHM,
    SALT,
    ENV_FILE,
    DEFAULT_SECRETS_FILE,
    CONFIG_DIR,
    AGENTICFLOW_DEBUG,
} = parsed.data;

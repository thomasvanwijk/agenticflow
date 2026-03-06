import path from "path";
import dotenv from "dotenv";

// Load existing env for the CLI process context
(dotenv.config as any)({ path: path.resolve(process.cwd(), ".env"), quiet: true });

export const ALGORITHM = "aes-256-gcm";
export const SALT = "agenticflow-salt";
export const DEFAULT_SECRETS_FILE = path.resolve(process.cwd(), "config/secrets.enc");
export const ENV_FILE = path.resolve(process.cwd(), ".env");
export const CONFIG_DIR = path.resolve(process.cwd(), "config");

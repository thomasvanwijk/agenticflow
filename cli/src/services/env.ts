import fs from "fs";
import dotenv from "dotenv";
import { ENV_FILE } from "../config.js";

/**
 * Service to manage the .env file lifecycle.
 */
class EnvService {
    /**
     * Load and parse the .env file.
     */
    load(): Record<string, string> {
        if (!fs.existsSync(ENV_FILE)) return {};
        const content = fs.readFileSync(ENV_FILE, "utf8");
        return dotenv.parse(content);
    }

    /**
     * Write environment variables to the .env file.
     * Handles quoting for values containing special characters.
     */
    save(vars: Record<string, string | number | boolean>) {
        const lines = Object.entries(vars)
            .filter(([k]) => k !== "AGENTICFLOW_MASTER_PASSWORD")
            .map(([k, v]) => {
                const strVal = String(v);
                // Quote if value contains $ or spaces
                if (strVal.includes("$") || strVal.includes(" ")) {
                    return `${k}='${strVal}'`;
                }
                return `${k}=${strVal}`;
            });
        fs.writeFileSync(ENV_FILE, lines.join("\n"), "utf8");
    }

    /**
     * Merge new variables into the existing .env file.
     */
    update(newVars: Record<string, string | number | boolean>) {
        const existing = this.load();
        const merged = { ...existing, ...newVars };
        this.save(merged);
    }
}

export const envService = new EnvService();

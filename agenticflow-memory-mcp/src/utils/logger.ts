import { LOG_LEVEL } from "../config.js";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

class Logger {
    private level: number;

    constructor() {
        this.level = LEVELS[(LOG_LEVEL as LogLevel) || "INFO"] ?? LEVELS.INFO;
    }

    private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
        if (LEVELS[level] < this.level) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...meta,
        };

        // MCP stdio transport requires that we log to stderr to avoid corrupting the JSON-RPC stream on stdout
        process.stderr.write(JSON.stringify(entry) + "\n");
    }

    debug(message: string, meta?: Record<string, unknown>) {
        this.log("DEBUG", message, meta);
    }

    info(message: string, meta?: Record<string, unknown>) {
        this.log("INFO", message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>) {
        this.log("WARN", message, meta);
    }

    error(message: string, meta?: Record<string, unknown>) {
        this.log("ERROR", message, meta);
    }
}

export const logger = new Logger();
export default logger;

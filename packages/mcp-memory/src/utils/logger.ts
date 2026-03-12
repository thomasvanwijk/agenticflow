type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

class Logger {
    private level: number;
    private service: string;

    constructor(service = "mcp-memory") {
        this.level = LEVELS[(process.env.LOG_LEVEL as LogLevel) || "INFO"] ?? LEVELS.INFO;
        this.service = service;
    }

    private log(level: LogLevel, message: string, eventOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>) {
        if (LEVELS[level] < this.level) return;

        let event: string | undefined;
        let finalMeta: Record<string, unknown> | undefined;

        if (typeof eventOrMeta === "string") {
            event = eventOrMeta;
            finalMeta = meta;
        } else {
            finalMeta = eventOrMeta;
        }

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            event,
            message,
            ...finalMeta,
        };

        process.stderr.write(JSON.stringify(entry) + "\n");
    }

    debug(message: string, eventOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>) {
        this.log("DEBUG", message, eventOrMeta, meta);
    }

    info(message: string, eventOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>) {
        this.log("INFO", message, eventOrMeta, meta);
    }

    warn(message: string, eventOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>) {
        this.log("WARN", message, eventOrMeta, meta);
    }

    error(message: string, eventOrMeta?: string | Record<string, unknown>, meta?: Record<string, unknown>) {
        this.log("ERROR", message, eventOrMeta, meta);
    }
}

export const logger = new Logger();
export default logger;

export function toolError(toolName: string, error: unknown, tip?: string) {
    const err = error as Error;
    const message = err.message || String(error);

    logger.error(`Tool ${toolName} failed`, "tool_error", {
        tool: toolName,
        error: message,
        stack: err.stack
    });

    let text = `Tool '${toolName}' failed: ${message}`;
    if (tip) {
        text += `\n\nTip: ${tip}`;
    }

    return {
        content: [{ type: "text" as const, text }],
        isError: true,
    };
}

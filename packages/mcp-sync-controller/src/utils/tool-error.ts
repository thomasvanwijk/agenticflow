import { logger } from "./logger.js";

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

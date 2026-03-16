import { execSync } from "child_process";
import { AGENTICFLOW_DEBUG, BASE_PATH } from "../config.js";

/**
 * Detect the available docker compose command.
 * Prefers 'docker compose' (v2), falls back to 'docker-compose' (v1).
 */
export function getDockerComposeCommand(): string {
    try {
        execSync("docker compose version", { stdio: "ignore" });
        return "docker compose";
    } catch {
        try {
            execSync("docker-compose version", { stdio: "ignore" });
            return "docker-compose";
        } catch {
            throw new Error("Docker Compose is not installed (tried 'docker compose' and 'docker-compose').");
        }
    }
}

/**
 * Run a generic shell command.
 */
export function runShell(command: string, silent = false): boolean {
    try {
        execSync(command, { stdio: silent ? "ignore" : "inherit", cwd: BASE_PATH });
        return true;
    } catch (err) {
        handleError(err as Error, `Command failed: ${command}`);
        return false;
    }
}

/**
 * Run a command and return its stdout.
 */
export function runShellWithOutput(command: string): string {
    try {
        return execSync(command, { stdio: "pipe", cwd: BASE_PATH }).toString().trim();
    } catch (err) {
        handleError(err as Error, `Command failed: ${command}`);
        return "";
    }
}

/**
 * Run a Docker Compose command with proper abstraction.
 */
export function runDockerCompose(args: string, silent = false): boolean {
    const composeCmd = getDockerComposeCommand();
    const fullCommand = `${composeCmd} ${args}`;
    return runShell(fullCommand, silent);
}

/**
 * Global error handler that respects AGENTICFLOW_DEBUG.
 */
export function handleError(err: Error, context?: string) {
    if (context) {
        process.stderr.write(`[agenticflow] Error: ${context}\n`);
    }

    if (AGENTICFLOW_DEBUG) {
        process.stderr.write(`[DEBUG] Stack trace: ${err.stack}\n`);
    } else {
        process.stderr.write(`[agenticflow] Details: ${err.message}\n`);
    }
}

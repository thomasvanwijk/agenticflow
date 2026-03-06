import { execSync } from "child_process";

export function runShell(command: string, silent = false): boolean {
    try {
        execSync(command, { stdio: silent ? "ignore" : "inherit" });
        return true;
    } catch {
        return false;
    }
}

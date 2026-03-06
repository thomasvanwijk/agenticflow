import ora from "ora";
import { runShell } from "../utils/shell.js";

export async function waitForGateway(hostPort: string) {
    const gatewayUrl = `http://localhost:${hostPort}/api/v0/tools`;
    const waitSpinner = ora("Waiting for MCPJungle registry to become healthy...").start();
    let attempts = 0;
    while (true) {
        if (runShell(`curl -s --max-time 5 "${gatewayUrl}" | grep -q "semantic_search"`, true)) {
            break;
        }
        attempts++;
        if (attempts > 60) {
            waitSpinner.fail("Timed out waiting for gateway. Check 'docker logs agenticflow-gateway' for errors.");
            process.exit(1);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    waitSpinner.succeed("Gateway is healthy and tools are registered.");
}

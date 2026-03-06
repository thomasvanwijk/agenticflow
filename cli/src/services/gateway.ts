import ora from "ora";
import { execSync } from "child_process";

export async function waitForGateway(hostPort: string) {
    const gatewayUrl = `http://localhost:${hostPort}/api/v0/tools`;
    const waitSpinner = ora("Waiting for MCPJungle registry to become healthy...").start();
    let attempts = 0;
    while (true) {
        try {
            const out = execSync(`curl -s --max-time 5 "${gatewayUrl}"`, { stdio: "pipe" }).toString();
            const json = JSON.parse(out);
            if (Array.isArray(json) && json.some((t: any) => t.name?.includes("semantic_search"))) {
                break;
            }
        } catch { }
        attempts++;
        if (attempts > 60) {
            waitSpinner.fail("Timed out waiting for gateway. Check 'docker logs agenticflow-gateway' for errors.");
            process.exit(1);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    waitSpinner.succeed("Gateway is healthy and tools are registered.");
}

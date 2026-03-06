import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import ora from "ora";
import { ENV_FILE, CONFIG_DIR } from "../config.js";
import { runShell } from "../utils/shell.js";
import { waitForGateway } from "../services/gateway.js";
import { execSync } from "child_process";

export async function embeddingAction() {
    console.log("\n🧠 Embedding Provider Configuration\n");

    let envVars: Record<string, string> = {};
    if (fs.existsSync(ENV_FILE)) {
        envVars = dotenv.parse(fs.readFileSync(ENV_FILE));
    }

    const { provider } = await inquirer.prompt([
        {
            type: "list",
            name: "provider",
            message: "Select provider:",
            choices: ["local", "ollama", "openai"],
            default: envVars.EMBEDDING_PROVIDER || "local"
        }
    ]);

    envVars.EMBEDDING_PROVIDER = provider;
    if (provider === "local") envVars.EMBEDDING_MODEL = "Xenova/jina-embeddings-v2-small-en";

    const envContent = Object.entries(envVars).map(([k, v]) => (typeof v === "string" && v.includes("$") ? `${k}='${v}'` : `${k}=${v}`)).join("\n");
    fs.writeFileSync(ENV_FILE, envContent, "utf8");

    const memoryJsonPath = path.join(CONFIG_DIR, "agenticflow.json");
    if (fs.existsSync(memoryJsonPath)) {
        const config = JSON.parse(fs.readFileSync(memoryJsonPath, "utf8"));
        config.env = config.env || {};
        config.env.EMBEDDING_PROVIDER = provider;
        if (provider === "local") config.env.EMBEDDING_MODEL = "Xenova/jina-embeddings-v2-small-en";
        fs.writeFileSync(memoryJsonPath, JSON.stringify(config, null, 4));
    }

    ora().succeed(`Switched to ${provider}.`);

    const { doIndex } = await inquirer.prompt([{ type: "confirm", name: "doIndex", message: "Re-index now?", default: true }]);
    if (doIndex) {
        runShell("docker compose restart agenticflow-gateway", true);
        await waitForGateway(envVars.HOST_PORT || "18080");
        try {
            execSync("docker exec agenticflow-gateway mcpjungle invoke agenticflow__index_vault", { stdio: "ignore" });
            execSync("docker exec agenticflow-gateway mcpjungle invoke agenticflow__refresh_tool_index", { stdio: "ignore" });
            ora().succeed("Indexed.");
        } catch { ora().fail("Indexing failed."); }
    }
}

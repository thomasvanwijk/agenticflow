import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import ora from "ora";
import { CONFIG_DIR, PROJECT_NAME } from "../config.js";
import { runDockerCompose, runShell, handleError } from "../utils/shell.js";
import { waitForGateway } from "../services/gateway.js";
import { envService } from "../services/env.js";

export async function embeddingAction() {
    console.log("\n🧠 Embedding Provider Configuration\n");

    const envVars = envService.load();

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

    envService.save(envVars);

    const coreJsonPath = path.join(CONFIG_DIR, "servers.d", `${PROJECT_NAME}.json`);
    const memoryJsonPath = path.join(CONFIG_DIR, "servers.d", "memory.json");
    const obsidianJsonPath = path.join(CONFIG_DIR, "servers.d", "obsidian.json");
    const oldPath = path.join(CONFIG_DIR, "agenticflow.json");
    
    const targetPaths = [coreJsonPath, memoryJsonPath, obsidianJsonPath, oldPath].filter(p => fs.existsSync(p));

    for (const targetPath of targetPaths) {
        try {
            const config = JSON.parse(fs.readFileSync(targetPath, "utf8"));
            // Only update if it looks like a memory/core config
            if (config.env && (config.env.EMBEDDING_PROVIDER || config.name === "memory" || config.name === "obsidian" || config.name === PROJECT_NAME)) {
                config.env = config.env || {};
                config.env.EMBEDDING_PROVIDER = provider;
                if (provider === "local") config.env.EMBEDDING_MODEL = "Xenova/jina-embeddings-v2-small-en";
                fs.writeFileSync(targetPath, JSON.stringify(config, null, 4));
            }
        } catch (err) {
            handleError(err as Error, `Failed to update ${targetPath}`);
        }
    }

    ora().succeed(`Switched to ${provider}.`);

    const { doIndex } = await inquirer.prompt([{ type: "confirm", name: "doIndex", message: "Re-index now?", default: true }]);
    if (doIndex) {
        runDockerCompose("restart gateway", true);
        await waitForGateway(envVars.PROXY_PORT || "18080");

        const indexSuccess = runDockerCompose("exec gateway mcpjungle invoke memory_index_vault", true);
        const refreshSuccess = runDockerCompose(`exec gateway mcpjungle invoke ${PROJECT_NAME}_refresh_tool_index`, true);

        if (indexSuccess && refreshSuccess) {
            ora().succeed("Indexed.");
        } else {
            ora().fail("Indexing failed.");
        }
    }
}

import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import ora from "ora";
import bcrypt from "bcryptjs";
import { ENV_FILE, DEFAULT_SECRETS_FILE, CONFIG_DIR } from "../config.js";
import { runShell, runDockerCompose, handleError } from "../utils/shell.js";
import { generatePassword } from "../utils/crypto.js";
import { loadSecrets, saveSecrets } from "../services/secrets.js";
import { waitForGateway } from "../services/gateway.js";
import { envService } from "../services/env.js";

export async function setupAction(options: any) {
    console.log("\n🚀 Welcome to Agenticflow Setup!\n");

    const setupAll = options.all || (!options.gateway && !options.cli);
    const setupCli = setupAll || options.cli;
    const setupGateway = setupAll || options.gateway;

    if (setupCli) {
        console.log("Setting up CLI...");
        try {
            const isRoot = fs.existsSync(path.resolve(process.cwd(), "cli", "package.json"));
            const cliDir = isRoot ? path.resolve(process.cwd(), "cli") : process.cwd();
            if (fs.existsSync(path.join(cliDir, "package.json"))) {
                runShell("npm install && npm run build && npm link", true);
                ora().succeed("CLI installed and linked successfully.");
            } else {
                ora().info("Not running from source repository, skipping CLI link.");
            }
        } catch (err) {
            handleError(err as Error, "CLI setup failed");
            ora().fail(`Failed to setup CLI: ${(err as Error).message}`);
        }
    }

    if (!setupGateway) {
        console.log("\n✅ Setup complete.");
        return;
    }

    // Prerequisites
    const spinner = ora("Checking prerequisites (Docker, Node, npm)...").start();
    if (!runShell("docker --version", true) || !runShell("node --version", true) || !runShell("npm --version", true)) {
        spinner.fail("Missing prerequisites. Please ensure Docker, Node.js, and npm are installed.");
        process.exit(1);
    }
    spinner.succeed("Prerequisites met.");

    // Check existing
    if (fs.existsSync(ENV_FILE) || fs.existsSync(DEFAULT_SECRETS_FILE)) {
        const { overwrite } = options.vaultPath ? { overwrite: true } : await inquirer.prompt([
            {
                type: "list",
                name: "overwrite",
                message: "🚨 Agenticflow appears to be already configured. What would you like to do?",
                choices: [
                    { name: "Cancel and exit setup (Run 'agenticflow up' to start the cluster)", value: false },
                    { name: "Reconfigure everything (This will overwrite existing configurations)", value: true }
                ]
            }
        ]);
        if (!overwrite) {
            process.exit(0);
        }
    }

    // Environment Config
    console.log("\n--- Let's configure your environment ---");
    let envVars: Record<string, string> = { HOST_PORT: "18080" };
    const existingEnv = envService.load();
    envVars = { ...envVars, ...existingEnv };

    const envAnswers = options.vaultPath ? {
        VAULT_PATH: options.vaultPath,
        EMBEDDING_PROVIDER: options.embedding || "local"
    } : await inquirer.prompt([
        {
            type: "input",
            name: "VAULT_PATH",
            message: "Absolute path to your Obsidian Vault directory:",
            default: envVars.VAULT_PATH || "/absolute/path/to/vault",
            validate: (input) => fs.existsSync(input) ? true : "Directory does not exist."
        },
        {
            type: "list",
            name: "EMBEDDING_PROVIDER",
            message: "Which embedding provider?",
            choices: ["local", "ollama", "openai"],
            default: envVars.EMBEDDING_PROVIDER || "local"
        }
    ]);

    envVars.VAULT_PATH = envAnswers.VAULT_PATH;
    envVars.EMBEDDING_PROVIDER = envAnswers.EMBEDDING_PROVIDER;

    if (!envVars.POSTGRES_PASSWORD || envVars.POSTGRES_PASSWORD === "changeme") {
        envVars.POSTGRES_PASSWORD = generatePassword(24);
    }

    if (!envVars.AGENTICFLOW_MASTER_PASSWORD) {
        if (options.masterPassword) {
            envVars.AGENTICFLOW_MASTER_PASSWORD = options.masterPassword;
        } else {
            const { master } = await inquirer.prompt([{ type: "password", name: "master", message: "Create Master Password:", mask: "*" }]);
            envVars.AGENTICFLOW_MASTER_PASSWORD = master;
        }
        process.env.AGENTICFLOW_MASTER_PASSWORD = envVars.AGENTICFLOW_MASTER_PASSWORD;
    }

    envService.save(envVars);

    // Config bootstrap
    const serversDir = path.join(CONFIG_DIR, "servers.d");
    if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true });

    // Handle agenticflow.json move/creation
    const memoryJson = path.join(serversDir, "agenticflow.json");
    const memoryExample = path.join(CONFIG_DIR, "agenticflow.example.json");

    // Also check if it exists in the OLD location and move it if so
    const oldMemoryJson = path.join(CONFIG_DIR, "agenticflow.json");
    if (fs.existsSync(oldMemoryJson) && !fs.existsSync(memoryJson)) {
        fs.renameSync(oldMemoryJson, memoryJson);
        ora().info("Moved agenticflow.json to servers.d/");
    } else if (!fs.existsSync(memoryJson) && fs.existsSync(memoryExample)) {
        fs.copyFileSync(memoryExample, memoryJson);
    }

    // Move example files to servers.d if they are there
    const exampleFiles = ["agenticflow.example.json", "atlassian.example.json"];
    for (const f of exampleFiles) {
        const src = path.join(CONFIG_DIR, f);
        const dst = path.join(serversDir, f);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
            fs.renameSync(src, dst);
        }
    }

    // Atlassian
    const { setupAtlassian } = options.skipAtlassian ? { setupAtlassian: false } : await inquirer.prompt([
        { type: "confirm", name: "setupAtlassian", message: "Configure Atlassian?", default: false }
    ]);
    if (setupAtlassian) {
        const atlassianAnswers = await inquirer.prompt([
            { type: "input", name: "ATLASSIAN_BASE_URL", message: "Base URL:" },
            { type: "input", name: "ATLASSIAN_EMAIL", message: "Email:" },
            { type: "password", name: "ATLASSIAN_API_TOKEN", message: "Token:", mask: "*" }
        ]);
        const pwd = envVars.AGENTICFLOW_MASTER_PASSWORD;
        const secrets = loadSecrets(DEFAULT_SECRETS_FILE, pwd);
        Object.assign(secrets, atlassianAnswers);
        saveSecrets(DEFAULT_SECRETS_FILE, secrets, pwd);
    }

    // Remote Access
    const { setupRemote } = options.skipRemote ? { setupRemote: false } : await inquirer.prompt([
        { type: "confirm", name: "setupRemote", message: "Enable Remote Access?", default: false }
    ]);
    if (setupRemote) {
        const { customPwd } = await inquirer.prompt([{ type: "password", name: "customPwd", message: "Remote password:", mask: "*" }]);
        const remotePwd = customPwd || generatePassword(24);
        envVars.AGENTICFLOW_REMOTE_USER = "agenticflow";
        envVars.AGENTICFLOW_REMOTE_PASSWORD_HASH = bcrypt.hashSync(remotePwd, 10);
        envService.save(envVars);
        ora().succeed(`Remote Access enabled for user 'agenticflow'. Password: ${remotePwd}`);
    }

    // Bootstrap Docker
    console.log("\n--- Starting Docker ---");
    runDockerCompose("up -d --build", false);

    await waitForGateway(envVars.HOST_PORT || "18080");

    // Indexing
    if (options.index !== false) {
        const { doIndex } = await inquirer.prompt([{ type: "confirm", name: "doIndex", message: "Index now?", default: true }]);
        if (doIndex) {
            const indexSuccess = runShell("docker exec agenticflow-gateway mcpjungle invoke agenticflow__index_vault", true);
            const refreshSuccess = runShell("docker exec agenticflow-gateway mcpjungle invoke agenticflow__refresh_tool_index", true);
            if (indexSuccess && refreshSuccess) {
                ora().succeed("Indexed.");
            } else {
                ora().fail("Indexing failed.");
            }
        }
    }

    console.log("\n🎉 Setup Complete!");
}

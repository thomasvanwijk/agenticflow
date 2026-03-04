#!/usr/bin/env node

import fs from "fs";
import crypto from "crypto";
import path from "path";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { execSync, spawn } from "child_process";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

// Load existing env for the CLI process context
// Passing quiet: true suppress dotenvx/dotenv advertising tips
(dotenv.config as any)({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const ALGORITHM = "aes-256-gcm";
const DEFAULT_SECRETS_FILE = path.resolve(process.cwd(), "config/secrets.enc");
const ENV_FILE = path.resolve(process.cwd(), ".env");

// --- Crypto & Secret Helpers ---

function getKey(password: string): Buffer {
    return crypto.scryptSync(password, "agenticflow-salt", 32);
}

function encrypt(text: string, password: string): { iv: string; content: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const key = getKey(password);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { iv: iv.toString("hex"), content: encrypted, tag: cipher.getAuthTag().toString("hex") };
}

function decrypt(hash: { iv: string; content: string; tag: string }, password: string): string {
    const iv = Buffer.from(hash.iv, "hex");
    const tag = Buffer.from(hash.tag, "hex");
    const key = getKey(password);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(hash.content, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

function loadSecrets(filePath: string, password?: string): Record<string, string> {
    if (!fs.existsSync(filePath)) return {};
    const fileContent = fs.readFileSync(filePath, "utf8");
    if (!fileContent.trim()) return {};
    if (!password) throw new Error("Master password is required to decrypt secrets.");
    try {
        const encryptedData = JSON.parse(fileContent);
        return JSON.parse(decrypt(encryptedData, password));
    } catch {
        throw new Error("Failed to decrypt secrets. Incorrect master password or corrupted file.");
    }
}

function saveSecrets(filePath: string, secrets: Record<string, string>, password?: string) {
    if (!password) throw new Error("Master password is required to save secrets.");
    const encryptedData = encrypt(JSON.stringify(secrets, null, 2), password);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2), "utf8");
}

async function getMasterPassword(): Promise<string> {
    if (process.env.AGENTICFLOW_MASTER_PASSWORD) return process.env.AGENTICFLOW_MASTER_PASSWORD;
    const { password } = await inquirer.prompt([{ type: "password", name: "password", message: "Enter Master Password:", mask: "*" }]);
    return password;
}

function generatePassword(length = 32) {
    return crypto.randomBytes(length).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, length);
}

function runShell(command: string, silent = false): boolean {
    try {
        execSync(command, { stdio: silent ? "ignore" : "inherit" });
        return true;
    } catch {
        return false;
    }
}

// --- CLI Setup ---

const program = new Command();
program.name("agenticflow").description("Agenticflow Management CLI").version("1.0.0");

// --- Top Level Commands ---

program
    .command("setup")
    .description("Guided installation wizard for a fresh Agenticflow instance")
    .action(async () => {
        console.log("\n🚀 Welcome to Agenticflow Setup!\n");

        // Step 1: Prerequisites
        const spinner = ora("Checking prerequisites (Docker, Node, npm)...").start();
        if (!runShell("docker --version", true) || !runShell("node --version", true) || !runShell("npm --version", true)) {
            spinner.fail("Missing prerequisites. Please ensure Docker, Node.js, and npm are installed.");
            process.exit(1);
        }
        spinner.succeed("Prerequisites met.");

        // Step 1.5: Check for existing configuration
        if (fs.existsSync(ENV_FILE) || fs.existsSync(DEFAULT_SECRETS_FILE)) {
            const { overwrite } = await inquirer.prompt([
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
                console.log("Setup aborted. Your existing configuration is safe.");
                process.exit(0);
            }
        }

        // Step 2: Environment Configuration (.env)
        console.log("\n--- Let's configure your environment ---");
        let envVars: Record<string, string> = { HOST_PORT: "18080" };
        if (fs.existsSync(ENV_FILE)) {
            const parsed = dotenv.parse(fs.readFileSync(ENV_FILE));
            envVars = { ...envVars, ...parsed };
        }

        const envAnswers = await inquirer.prompt([
            {
                type: "input",
                name: "VAULT_PATH",
                message: "Absolute path to your Obsidian Vault directory:",
                default: envVars.VAULT_PATH || path.resolve(process.env.HOME || "", "Documents/Obsidian"),
                validate: (input) => fs.existsSync(input) ? true : "Directory does not exist. Please enter a valid path."
            },
            {
                type: "list",
                name: "EMBEDDING_PROVIDER",
                message: "Which embedding provider do you want to use?",
                choices: ["ollama", "openai"],
                default: envVars.EMBEDDING_PROVIDER || "ollama"
            }
        ]);

        envVars.VAULT_PATH = envAnswers.VAULT_PATH;
        envVars.EMBEDDING_PROVIDER = envAnswers.EMBEDDING_PROVIDER;

        // --- Ollama Installation Check ---
        if (envVars.EMBEDDING_PROVIDER === "ollama") {
            const hasOllama = runShell("ollama --version", true);
            if (!hasOllama) {
                console.log("\n⚠️ Ollama is not installed on this system.");
                const { installOllama } = await inquirer.prompt([
                    {
                        type: "list",
                        name: "installOllama",
                        message: "Would you like to install Ollama automatically?",
                        choices: [
                            { name: "Yes, install automatically (Linux/macOS)", value: true },
                            { name: "No, I will install it manually later", value: false }
                        ]
                    }
                ]);

                if (installOllama) {
                    if (process.platform === "win32") {
                        console.log("Automatic installation is not supported on Windows. Please download Ollama from https://ollama.com/download");
                    } else {
                        console.log("Running Ollama installation script...");
                        try {
                            execSync("curl -fsSL https://ollama.com/install.sh | sh", { stdio: "inherit" });
                            ora().succeed("Ollama installed successfully.");
                        } catch (err) {
                            console.error("Failed to install Ollama automatically. You may need to install it manually from https://ollama.com/download");
                        }
                    }
                } else {
                    console.log("Please remember to install and start Ollama manually. Download from: https://ollama.com/download");
                }
            }
        }

        if (!envVars.POSTGRES_PASSWORD || envVars.POSTGRES_PASSWORD === "changeme") {
            envVars.POSTGRES_PASSWORD = generatePassword(24);
        }

        // Master Password Generation/Prompt
        if (!envVars.AGENTICFLOW_MASTER_PASSWORD) {
            console.log("\nAgenticflow uses an encrypted vault for integrations (like Jira).");
            const { master } = await inquirer.prompt([
                { type: "password", name: "master", message: "Create a Master Password for the vault:", mask: "*" }
            ]);
            envVars.AGENTICFLOW_MASTER_PASSWORD = master;
            process.env.AGENTICFLOW_MASTER_PASSWORD = master; // For this session
        } else {
            process.env.AGENTICFLOW_MASTER_PASSWORD = envVars.AGENTICFLOW_MASTER_PASSWORD;
        }

        const envContent = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n");
        fs.writeFileSync(ENV_FILE, envContent, "utf8");
        ora().succeed(".env configured and saved.");

        // Step 3: Secrets Integration
        const { setupAtlassian } = await inquirer.prompt([
            { type: "confirm", name: "setupAtlassian", message: "Would you like to configure Atlassian (Jira/Confluence) integration now?", default: false }
        ]);

        if (setupAtlassian) {
            const atlassianAnswers = await inquirer.prompt([
                { type: "input", name: "ATLASSIAN_BASE_URL", message: "Base URL (e.g. https://tmjira.atlassian.net):" },
                { type: "input", name: "ATLASSIAN_EMAIL", message: "Email associated with API Token:" },
                { type: "password", name: "ATLASSIAN_API_TOKEN", message: "Jira API Token:", mask: "*" }
            ]);
            const pwd = process.env.AGENTICFLOW_MASTER_PASSWORD;
            const secrets = loadSecrets(DEFAULT_SECRETS_FILE, pwd);
            secrets.ATLASSIAN_BASE_URL = atlassianAnswers.ATLASSIAN_BASE_URL;
            secrets.ATLASSIAN_EMAIL = atlassianAnswers.ATLASSIAN_EMAIL;
            secrets.ATLASSIAN_API_TOKEN = atlassianAnswers.ATLASSIAN_API_TOKEN;
            saveSecrets(DEFAULT_SECRETS_FILE, secrets, pwd);
            ora().succeed("Atlassian credentials encrypted and saved.");
        }

        // Step 3.5: Remote Access
        console.log("\n--- Remote Access ---");
        const { setupRemote } = await inquirer.prompt([
            { type: "confirm", name: "setupRemote", message: "Enable secure Remote Access (requires authentication)?", default: false }
        ]);

        let remotePwd = "";
        if (setupRemote) {
            console.log("⚠️ You must expose this proxy via an HTTPS tunnel (e.g. Cloudflare Tunnels) or Tailscale HTTPS. Exposing it over plain HTTP is insecure.");
            remotePwd = generatePassword(24);
            const hashed = bcrypt.hashSync(remotePwd, 10);
            envVars.AGENTICFLOW_REMOTE_USER = "agenticflow";
            envVars.AGENTICFLOW_REMOTE_PASSWORD_HASH = hashed;

            const updatedEnvContent = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n");
            fs.writeFileSync(ENV_FILE, updatedEnvContent, "utf8");
            ora().succeed(`Remote Access enabled. Generated user: agenticflow`);
        }

        // Step 4: Bootstrap
        console.log("\n--- Bootstrapping the System ---");
        const buildSpinner = ora("Starting Agenticflow Gateway (building Docker images)...").start();
        if (!runShell("docker compose up -d --build", true)) {
            buildSpinner.fail("Failed to start Docker containers. Check Docker daemon.");
            process.exit(1);
        }
        buildSpinner.succeed("Docker containers started.");

        const waitSpinner = ora("Waiting for MCPJungle registry to become healthy...").start();
        while (true) {
            try {
                const out = execSync("docker exec agenticflow-gateway mcpjungle list tools", { stdio: "pipe" }).toString();
                if (out.includes("agenticflow__semantic_search")) {
                    break;
                }
            } catch { }
            await new Promise(r => setTimeout(r, 2000));
        }
        waitSpinner.succeed("Gateway is healthy and tools are registered.");

        // Step 5: Indexing
        const { doIndex } = await inquirer.prompt([
            { type: "confirm", name: "doIndex", message: "Would you like to semantic index your Obsidian vault now? (Takes a few seconds)", default: true }
        ]);

        if (doIndex) {
            const idxSpinner = ora("Indexing vault...").start();
            try {
                execSync("docker exec agenticflow-gateway mcpjungle invoke agenticflow__index_vault", { stdio: "ignore" });
                idxSpinner.succeed("Vault successfully indexed!");
            } catch {
                idxSpinner.fail("Indexing failed. You can run it manually later via the MCP tool.");
            }
        }

        console.log("\n🎉 Setup Complete! 🎉\n");

        if (setupRemote) {
            console.log(`IMPORTANT: Your Remote Access Password is: ${remotePwd}`);
            console.log(`Save this password! It will not be shown again.\n`);
            console.log(`To connect from a remote Claude Desktop over an HTTPS tunnel, add this to claude_desktop_config.json:\n`);
            console.log(JSON.stringify({
                "mcpServers": {
                    "agenticflow-remote": {
                        "command": "npx",
                        "args": ["-y", "@mcp-builder/mcp-remote", `https://agenticflow:${remotePwd}@YOUR_TUNNEL_DOMAIN.com/mcp`]
                    }
                }
            }, null, 2));
        } else {
            console.log("To connect from your local Claude Desktop, add this to claude_desktop_config.json:\n");
            console.log(JSON.stringify({
                "mcpServers": {
                    "agenticflow": {
                        "command": "docker",
                        "args": ["exec", "-i", "agenticflow-gateway", "mcpjungle", "stdio", "--server", "agenticflow"]
                    }
                }
            }, null, 2));
        }
        console.log("\n");
    });

program
    .command("up")
    .description("Start the Agenticflow Docker cluster")
    .action(() => {
        const spinner = ora("Starting Agenticflow...").start();
        if (runShell("docker compose up -d --remove-orphans", true)) {
            spinner.succeed("Agenticflow is running.");
        } else {
            spinner.fail("Failed to start Agenticflow.");
        }
    });

program
    .command("down")
    .description("Stop the Agenticflow Docker cluster")
    .action(() => {
        const spinner = ora("Stopping Agenticflow...").start();
        if (runShell("docker compose down", true)) {
            spinner.succeed("Agenticflow stopped.");
        } else {
            spinner.fail("Failed to stop Agenticflow.");
        }
    });

// --- Secrets Sub-commands ---

const secretsCmd = program.command("secrets").description("Manage encrypted secrets");

secretsCmd
    .command("set <key> [value]")
    .description("Set a secret key-value pair")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .action(async (key, value, options) => {
        let secretValue = value;
        if (!secretValue) {
            const a = await inquirer.prompt([{ type: "password", name: "s", message: `Enter value for ${key}:`, mask: "*" }]);
            secretValue = a.s;
        }
        const pwd = await getMasterPassword();
        const secrets = loadSecrets(options.file, pwd);
        secrets[key] = secretValue;
        saveSecrets(options.file, secrets, pwd);
        console.log(`Secret '${key}' saved successfully.`);
    });

secretsCmd
    .command("get <key>")
    .description("Get a secret value")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .action(async (key, options) => {
        const pwd = await getMasterPassword();
        const secrets = loadSecrets(options.file, pwd);
        if (key in secrets) console.log(secrets[key]);
        else { console.error(`Secret '${key}' not found.`); process.exit(1); }
    });

secretsCmd
    .command("list")
    .description("List all secret keys")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .action(async (options) => {
        const pwd = await getMasterPassword();
        const secrets = loadSecrets(options.file, pwd);
        const keys = Object.keys(secrets);
        if (keys.length === 0) console.log("No secrets stored.");
        else { console.log("Stored secrets:"); keys.forEach(k => console.log(` - ${k}`)); }
    });

secretsCmd
    .command("inject")
    .description("Inject secrets into configuration templates")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .option("-t, --templates <dir>", "Directory containing example configs", path.resolve(process.cwd(), "config"))
    .option("-o, --output <dir>", "Directory to write injected configs", path.resolve(process.cwd(), "config"))
    .action(async (options) => {
        const pwd = await getMasterPassword();
        const secrets = loadSecrets(options.file, pwd);
        const files = fs.readdirSync(options.templates);
        let injectedCount = 0;
        for (const file of files) {
            if (!file.includes(".example.")) continue;
            const content = fs.readFileSync(path.join(options.templates, file), "utf8");
            const injectedContent = content.replace(/\$\{([A-Z0-9_]+)\}|\{\{([A-Z0-9_]+)\}\}/gi, (m, g1, g2) => {
                const k = g1 || g2;
                if (k in secrets) return secrets[k];
                if (process.env[k] !== undefined) return process.env[k] as string;
                return m;
            });
            fs.writeFileSync(path.join(options.output, file.replace(".example.", ".")), injectedContent, "utf8");
            console.log(`Injected secrets into ${file.replace(".example.", ".")}`);
            injectedCount++;
        }
        console.log(`Injection complete. Processed ${injectedCount} template(s).`);
    });

program.parse(process.argv);

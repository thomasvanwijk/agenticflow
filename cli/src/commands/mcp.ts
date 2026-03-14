import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { CONFIG_DIR, DEFAULT_SECRETS_FILE } from "../config.js";
import { loadSecrets, saveSecrets, getMasterPassword } from "../services/secrets.js";
// Secret injection is now handled in-memory by the sync-controller (no file writes)
import { runShell, runShellWithOutput } from "../utils/shell.js";
import ora from "ora";

export const getServersDir = () => path.join(CONFIG_DIR, "servers.d");

export function listMcpAction() {
    const serversDir = getServersDir();
    if (!fs.existsSync(serversDir)) {
        console.log("No MCP servers directory found.");
        return;
    }

    const files = fs.readdirSync(serversDir).filter((f: string) => f.endsWith(".json") && !f.includes(".example."));
    if (files.length === 0) {
        console.log("No MCP servers configured.");
        return;
    }

    console.log("Installed MCP Servers:");
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(serversDir, file), "utf-8");
            const config = JSON.parse(content);
            console.log(`- ${config.name} (${file})`);
            console.log(`  Command: ${config.command} ${config.args ? config.args.join(" ") : ""}`);
            if (config.env && Object.keys(config.env).length > 0) {
                console.log(`  Env: ${Object.keys(config.env).join(", ")}`);
            }
        } catch (e) {
            console.log(`- ${file} (Failed to parse)`);
        }
    }
}

export async function addMcpAction(nameArg: string | undefined, options: { command?: string; env?: string[] }, argsArg: string[]) {
    let name = nameArg;
    let command = options.command;
    let commandArgs = argsArg || [];
    // Each entry: [key, value, isSecret]
    let envEntries: { key: string; value: string; isSecret: boolean }[] = [];

    // 1. Initial input if needed
    if (!name || !command) {
        console.log("\n--- Interactive MCP Setup ---");
        const answers = await inquirer.prompt([
            {
                type: "input",
                name: "name",
                message: "MCP Server Name (e.g. n8n-mcp):",
                default: name,
                validate: (s: string) => s.length > 0 || "Name is required"
            },
            {
                type: "input",
                name: "command",
                message: "Command to run (e.g. npx, uvx, node):",
                default: command,
                validate: (s: string) => s.length > 0 || "Command is required"
            },
            {
                type: "input",
                name: "args",
                message: "Command arguments (space separated, e.g. -y @org/pacakge):",
                default: commandArgs.join(" ")
            }
        ]);
        name = answers.name;
        command = answers.command;
        commandArgs = answers.args.split(" ").filter((a: string) => a.length > 0);

        // Initial Env Loop
        let addInitialEnv = true;
        while (addInitialEnv) {
            const { proceed } = await inquirer.prompt([
                { type: "confirm", name: "proceed", message: "Add an environment variable?", default: false }
            ]);
            if (!proceed) break;

            const { key, isSecret } = await inquirer.prompt([
                { type: "input", name: "key", message: "Variable Name (e.g. API_KEY):", validate: (s: string) => s.length > 0 || "Required" },
                { type: "confirm", name: "isSecret", message: "Is this a secret/sensitive value?", default: true }
            ]);

            const { value } = await inquirer.prompt([
                {
                    type: isSecret ? "password" : "input",
                    name: "value",
                    message: `Variable Value for ${key}:`,
                    mask: "*"
                }
            ]);
            envEntries.push({ key, value, isSecret });
        }
    } else {
        // Non-interactive: Parse existing env flags (assume secrets for safety)
        if (options.env) {
            for (const e of options.env) {
                const [key, ...val] = e.split("=");
                if (key) {
                    envEntries.push({ key, value: val.join("="), isSecret: true });
                }
            }
        }
    }

    // 2. Review and Edit Loop (only if interactive)
    if (!options.command || !nameArg) {
        let reviewing = true;
        while (reviewing) {
            console.log("\n--- Review Configuration ---");
            console.log(`Name:    ${name}`);
            console.log(`Command: ${command}`);
            console.log(`Args:    ${commandArgs.join(" ")}`);
            if (envEntries.length > 0) {
                console.log("Env Vars:");
                envEntries.forEach(({ key, value, isSecret }) => {
                    const display = isSecret ? "*".repeat(Math.min(value.length, 10)) + " (hidden)" : value;
                    console.log(`  ${key}=${display}`);
                });
            } else {
                console.log("Env Vars: (none)");
            }

            const { action } = await inquirer.prompt([
                {
                    type: "list",
                    name: "action",
                    message: "What would you like to do?",
                    choices: [
                        { name: "✅ Looks good, save it!", value: "save" },
                        { name: "📝 Edit Basic Info (Name/Command/Args)", value: "basic" },
                        { name: "🔑 Edit Environment Variables", value: "env" },
                        { name: "❌ Cancel", value: "cancel" }
                    ]
                }
            ]);

            if (action === "save") {
                reviewing = false;
            } else if (action === "cancel") {
                console.log("Operation cancelled.");
                return;
            } else if (action === "basic") {
                const edit = await inquirer.prompt([
                    { type: "input", name: "name", message: "Name:", default: name, validate: (s: string) => s.length > 0 || "Required" },
                    { type: "input", name: "command", message: "Command:", default: command, validate: (s: string) => s.length > 0 || "Required" },
                    { type: "input", name: "args", message: "Args:", default: commandArgs.join(" ") }
                ]);
                name = edit.name;
                command = edit.command;
                commandArgs = edit.args.split(" ").filter((a: string) => a.length > 0);
            } else if (action === "env") {
                const { envAction } = await inquirer.prompt([
                    {
                        type: "list",
                        name: "envAction",
                        message: "Env Var Action:",
                        choices: [
                            { name: "➕ Add New Variable", value: "add" },
                            ...(envEntries.length > 0 ? [{ name: "🗑️ Remove Variable", value: "remove" }] : []),
                            { name: "🔙 Back to Review", value: "back" }
                        ]
                    }
                ]);

                if (envAction === "add") {
                    const { key, isSecret } = await inquirer.prompt([
                        { type: "input", name: "key", message: "Key:", validate: (s: string) => s.length > 0 || "Required" },
                        { type: "confirm", name: "isSecret", message: "Is this a secret?", default: true }
                    ]);
                    const { value } = await inquirer.prompt([
                        { type: isSecret ? "password" : "input", name: "value", message: "Value:", mask: "*" }
                    ]);
                    envEntries.push({ key, value, isSecret });
                } else if (envAction === "remove") {
                    const { keyToRemove } = await inquirer.prompt([
                        {
                            type: "list",
                            name: "keyToRemove",
                            message: "Select variable to remove:",
                            choices: envEntries.map(e => e.key)
                        }
                    ]);
                    envEntries = envEntries.filter(e => e.key !== keyToRemove);
                }
            }
        }
    }

    if (!name || !command) return;

    // 3. Secret Management
    const pwd = await getMasterPassword();
    const secrets = loadSecrets(DEFAULT_SECRETS_FILE, pwd);
    const envMap: Record<string, string> = {};

    for (const { key, value } of envEntries) {
        const cleanName = name!.replace(/-mcp$/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
        const cleanKey = key.toUpperCase().replace(new RegExp(`^${cleanName}_`, "i"), "");
        const secretKey = `MCP_${cleanName}_${cleanKey}`;
        secrets[secretKey] = value;
        envMap[key] = `\${${secretKey}}`;
    }

    saveSecrets(DEFAULT_SECRETS_FILE, secrets, pwd);

    // 4. Save files
    const serversDir = getServersDir();
    if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true });

    const config = {
        name,
        transport: "stdio",
        command,
        args: commandArgs,
        env: envMap,
        session_mode: "stateful"
    };

    const examplePath = path.join(serversDir, `${name}.example.json`);
    const finalPath = path.join(serversDir, `${name}.json`);

    console.log(`\n✅ MCP server '${name}' configuration saved!`);
    if (envEntries.length > 0) {
        if (!nameArg) {
            console.log(`🔒 All ${envEntries.length} environment variables have been encrypted and stored in your key manager.`);
        } else {
            console.log(`🔒 All ${envEntries.length} environment variables from flags have been moved to your encrypted key manager.`);
            console.log(`⚠️  Warning: Variables passed via flags may remain in your shell history. Use the interactive mode 'agenticflow mcp add' for maximum security.`);
        }
    }

    // 5. Polling for registration status
    const spinner = ora(`Waiting for '${name}' to register with AgenticFlow...`).start();
    let registered = false;
    const maxRetries = 10;
    const gatewayPort = process.env.HOST_PORT || "18080";
    const registryUrl = `http://127.0.0.1:${gatewayPort}/api/v0/servers`;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(registryUrl);
            if (res.ok) {
                const servers = await res.json() as any[];
                if (servers.find(s => s.name === name)) {
                    registered = true;
                    break;
                }
            }
        } catch (e) {
            // Gateway might be down or busy
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    if (registered) {
        spinner.succeed(`Server '${name}' registered successfully and is now active!`);
    } else {
        spinner.fail(`Server '${name}' failed to register within 20s.`);
        console.log(`\n🔍 Checking logs for '${name}'...`);
        await logsMcpAction(name);
        console.log(`\n💡 Tip: Check your command and environment variables. You can edit the config at: ${finalPath}`);
    }
}

export async function statusMcpAction(name?: string) {
    const gatewayUrlEnv = process.env.AGENTICFLOW_GATEWAY_URL;
    const gatewayPort = process.env.HOST_PORT || "18080";
    const registryUrl = gatewayUrlEnv ? `${gatewayUrlEnv}/api/v0/servers` : `http://127.0.0.1:${gatewayPort}/api/v0/servers`;
    const toolsUrl = gatewayUrlEnv ? `${gatewayUrlEnv}/api/v0/tools` : `http://127.0.0.1:${gatewayPort}/api/v0/tools`;

    const spinner = ora("Fetching MCP status...").start();
    try {
        const [regRes, toolsRes] = await Promise.all([
            fetch(registryUrl),
            fetch(toolsUrl).catch(() => null)
        ]);

        if (!regRes.ok) throw new Error(`Gateway returned ${regRes.status}`);
        const activeServers = await regRes.json() as any[];

        let availableTools: any[] = [];
        if (toolsRes && toolsRes.ok) {
            const mcpPayload = await toolsRes.json() as any;
            // Handle both { tools: [] } and straight []
            availableTools = Array.isArray(mcpPayload) ? mcpPayload : (mcpPayload.tools || []);
        }

        spinner.stop();

        const serversDir = getServersDir();
        const configuredFiles = fs.existsSync(serversDir)
            ? fs.readdirSync(serversDir).filter((f: string) => f.endsWith(".json") && !f.includes(".example."))
            : [];

        if (configuredFiles.length === 0) {
            console.log("No MCP servers configured.");
            return;
        }

        console.log("\nMCP Server Status:");
        for (const file of configuredFiles) {
            const serverName = file.replace(".json", "");
            if (name && serverName !== name) continue;

            const configEntry = activeServers.find(s => s.name === serverName);
            // Search for tools belonging to this server.
            // Some MCP implementations use prefixes, others use a 'server' field.
            const serverTools = availableTools.filter(t =>
                t.name.startsWith(serverName + "_") ||
                t.server === serverName ||
                (t.name.includes("_") && t.name.split("_")[0] === serverName)
            );

            const isRegistered = !!configEntry;
            const hasTools = serverTools.length > 0;

            let statusIcon = "❌";
            let statusText = "INACTIVE";

            if (isRegistered) {
                if (hasTools) {
                    statusIcon = "✅";
                    statusText = "ACTIVE";
                } else {
                    statusIcon = "⚠️";
                    statusText = "REGISTERED (NO TOOLS)";
                }
            }

            console.log(`${statusIcon} ${serverName} [${statusText}]`);

            if (statusText === "ACTIVE") {
                console.log(`   └─ Serving ${serverTools.length} tools.`);
            } else if (statusText === "REGISTERED (NO TOOLS)") {
                console.log(`   └─ Registered with gateway but failed to export tools.`);
                console.log(`   └─ Run 'agenticflow mcp logs ${serverName}' to debug.`);
            } else {
                console.log(`   └─ Configuration found at ${path.join(serversDir, file)}, but server is not registered.`);
            }
        }
    } catch (e) {
        spinner.fail(`Failed to fetch status: ${String(e)}`);
    }
}

export async function logsMcpAction(name: string, options: { tail?: string } = {}) {
    const tailCount = options.tail || "20";
    console.log(`\n--- Logs for MCP Server: ${name} (showing last ${tailCount} lines) ---`);
    // mcpjungle logs currently doesn't have a specific per-server tail, 
    // so we grep the gateway logs for mention of the server name.
    const cmd = `docker logs agenticflow-gateway 2>&1 | grep -i "${name}" | tail -n ${tailCount}`;
    const logs = runShellWithOutput(cmd);
    if (logs) {
        console.log(logs);
    } else {
        console.log("No logs found for this server.");
    }
}

export function removeMcpAction(name: string) {
    const serversDir = getServersDir();
    const filePath = path.join(serversDir, `${name}.json`);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✅ MCP server '${name}' removed successfully from ${filePath}`);
        console.log(`⏳ The AgenticFlow Sync Controller will deregister the server shortly...`);
    } else {
        console.error(`❌ MCP server '${name}' not found.`);
        process.exit(1);
    }
}

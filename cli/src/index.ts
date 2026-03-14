#!/usr/bin/env node

import { Command } from "commander";
import { setupAction } from "./commands/setup.js";
import { upAction, downAction, uninstallAction } from "./commands/lifecycle.js";
import { embeddingAction } from "./commands/embedding.js";
import { setSecretAction, getSecretAction, listSecretsAction, exportSecretsAction } from "./commands/secrets.js";
import { addMcpAction, listMcpAction, removeMcpAction } from "./commands/mcp.js";
import { DEFAULT_SECRETS_FILE, PROJECT_NAME } from "./config.js";

const program = new Command();
program.name(PROJECT_NAME).description(`${PROJECT_NAME} Management CLI`).version("1.1.0");

program
    .option("--env <env>", "Target environment context (e.g. main, feature)")
    .option("--workspace <path>", "Target workspace directory");

program
    .command("setup")
    .description("Guided installation wizard")
    .option("--rebuild", "Force rebuild")
    .option("--all", "Setup everything")
    .option("--gateway", "Setup gateway only")
    .option("--cli", "Setup CLI only")
    .option("--vault-path <path>", "Vault path")
    .option("--embedding <provider>", "Provider")
    .option("--master-password <password>", "Password")
    .option("--skip-atlassian", "Skip Atlassian")
    .option("--skip-remote", "Skip remote")
    .option("--no-index", "Skip index")
    .action(setupAction);

program.command("up").description("Start cluster").action(upAction);
program.command("down").description("Stop cluster").action(downAction);

program
    .command("embedding")
    .description("Configure embedding provider")
    .action(embeddingAction);

const mcpCmd = program.command("mcp").description("Manage additional MCP servers");
mcpCmd.command("list").description("List installed MCP servers").action(listMcpAction);
mcpCmd
    .command("add [name] [args...]")
    .description("Add a new MCP server")
    .option("-c, --command <cmd>", "Command to execute (e.g. npx, uvx)")
    .option("-e, --env <env...>", "Environment variables (e.g. -e API_KEY=123)")
    .action(async (name, args, options) => await addMcpAction(name, options, args));
mcpCmd.command("remove <name>").description("Remove an MCP server").action(removeMcpAction);
mcpCmd.command("status [name]").description("Check status of MCP servers").action(async (name) => {
    const { statusMcpAction } = await import("./commands/mcp.js");
    await statusMcpAction(name);
});
mcpCmd
    .command("logs <name>")
    .description("View logs for a specific MCP server")
    .option("-t, --tail <n>", "number of lines to show", "20")
    .action(async (name, options) => {
        const { logsMcpAction } = await import("./commands/mcp.js");
        await logsMcpAction(name, options);
    });

const secretsCmd = program.command("secrets").description("Manage secrets");
secretsCmd.command("set <key> [value]").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).option("-m, --mcp <name>", "Scope to a specific MCP server").action(setSecretAction);
secretsCmd.command("get <key>").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).option("-m, --mcp <name>", "Scope to a specific MCP server").action(getSecretAction);
secretsCmd.command("list").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).option("-m, --mcp <name>", "Scope to a specific MCP server").action(listSecretsAction);
secretsCmd
    .command("export")
    .description("Decrypt secrets.enc and emit shell export statements to stdout (used by gateway entrypoint)")
    .option("-f, --file <path>", "Secrets file", DEFAULT_SECRETS_FILE)
    .action(exportSecretsAction);

program
    .command("uninstall")
    .description("Remove Agenticflow")
    .option("--all", "Uninstall all")
    .option("--gateway", "Uninstall gateway")
    .option("--cli", "Uninstall CLI")
    .option("-f, --force", "Force")
    .action(uninstallAction);

program.parse();

#!/usr/bin/env node

import { Command } from "commander";
import { setupAction } from "./commands/setup.js";
import { upAction, downAction, uninstallAction } from "./commands/lifecycle.js";
import { embeddingAction } from "./commands/embedding.js";
import { setSecretAction, getSecretAction, listSecretsAction, injectSecretsAction } from "./commands/secrets.js";
import { DEFAULT_SECRETS_FILE } from "./config.js";

const program = new Command();
program.name("agenticflow").description("Agenticflow Management CLI").version("1.1.0");

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

const secretsCmd = program.command("secrets").description("Manage secrets");
secretsCmd.command("set <key> [value]").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).action(setSecretAction);
secretsCmd.command("get <key>").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).action(getSecretAction);
secretsCmd.command("list").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).action(listSecretsAction);
secretsCmd.command("inject").option("-f, --file <path>", "File", DEFAULT_SECRETS_FILE).action(injectSecretsAction);

program
    .command("uninstall")
    .description("Remove Agenticflow")
    .option("--all", "Uninstall all")
    .option("--gateway", "Uninstall gateway")
    .option("--cli", "Uninstall CLI")
    .option("-f, --force", "Force")
    .action(uninstallAction);

program.parse();

import ora from "ora";
import { runDockerCompose, runShell, handleError } from "../utils/shell.js";
import fs from "fs";
import { ENV_FILE } from "../config.js";
import inquirer from "inquirer";
import { getMasterPassword } from "../services/secrets.js";

export async function upAction(options: any = {}, globalOptions: any = {}) {
    try {
        process.env.AGENTICFLOW_MASTER_PASSWORD = await getMasterPassword();
    } catch (err) {
        console.error("Failed to retrieve master password.");
        process.exit(1);
    }
    
    // Apply dynamic ports based on environment
    const env = globalOptions.env || "main";
    process.env.ENV_NAME = env;
    if (env === "test" || env === "infra" || env === "feature") {
        // Base port offsets for testing environments
        const portOffset = env === "test" ? 1 : env === "infra" ? 2 : env === "feature" ? 3 : 0;
        process.env.PROXY_PORT = String(18080 + portOffset);
        process.env.CHROMA_PORT = String(8000 + portOffset);
        process.env.POSTGRES_PORT = String(5432 + portOffset);
        console.log(`\n🚀 Running in parallel mode (${env}) - Ports offset by +${portOffset}`);
    }

    const spinner = ora("Starting Agenticflow...").start();
    const buildFlag = options.rebuild ? " --build" : "";
    if (runDockerCompose(`up -d --remove-orphans${buildFlag}`, true)) {
        spinner.succeed(`Agenticflow is running (env: ${env}).`);
    } else {
        spinner.fail("Failed to start Agenticflow.");
    }
}

export function downAction(options: any = {}, globalOptions: any = {}) {
    const env = globalOptions.env || "main";
    process.env.ENV_NAME = env;
    
    const spinner = ora(`Stopping Agenticflow (${env})...`).start();
    if (runDockerCompose("down", true)) {
        spinner.succeed(`Agenticflow stopped (${env}).`);
    } else {
        spinner.fail("Failed to stop Agenticflow.");
    }
}

export async function uninstallAction(options: any) {
    const uninstallAll = options.all || (!options.gateway && !options.cli);
    const uninstallGateway = uninstallAll || options.gateway;
    const uninstallCli = uninstallAll || options.cli;

    if (!options.force) {
        const { confirm } = await inquirer.prompt([
            { type: "confirm", name: "confirm", message: "⚠️ Are you sure you want to uninstall?", default: false }
        ]);
        if (!confirm) return;
    }

    const spinner = ora("Uninstalling...").start();
    try {
        if (uninstallGateway) {
            runDockerCompose("down -v --rmi local", true);
            if (fs.existsSync(ENV_FILE)) fs.unlinkSync(ENV_FILE);
        }
        if (uninstallCli) {
            runShell("npm uninstall -g agenticflow", true);
        }
        spinner.succeed("Uninstalled.");
    } catch (err) {
        handleError(err as Error, "Uninstall failed");
        spinner.fail(`Failed: ${(err as Error).message}`);
    }
}

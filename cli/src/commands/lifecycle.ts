import ora from "ora";
import { runDockerCompose, runShell, handleError } from "../utils/shell.js";
import fs from "fs";
import { ENV_FILE } from "../config.js";
import inquirer from "inquirer";
import { getMasterPassword } from "../services/secrets.js";

export async function upAction() {
    try {
        process.env.AGENTICFLOW_MASTER_PASSWORD = await getMasterPassword();
    } catch (err) {
        console.error("Failed to retrieve master password.");
        process.exit(1);
    }
    const spinner = ora("Starting Agenticflow...").start();
    if (runDockerCompose("up -d --remove-orphans", true)) {
        spinner.succeed("Agenticflow is running.");
    } else {
        spinner.fail("Failed to start Agenticflow.");
    }
}

export function downAction() {
    const spinner = ora("Stopping Agenticflow...").start();
    if (runDockerCompose("down", true)) {
        spinner.succeed("Agenticflow stopped.");
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

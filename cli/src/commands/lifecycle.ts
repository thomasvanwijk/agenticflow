import ora from "ora";
import { runShell } from "../utils/shell.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { ENV_FILE } from "../config.js";
import inquirer from "inquirer";

export function upAction() {
    const spinner = ora("Starting Agenticflow...").start();
    if (runShell("docker compose up -d --remove-orphans", true)) {
        spinner.succeed("Agenticflow is running.");
    } else {
        spinner.fail("Failed to start Agenticflow.");
    }
}

export function downAction() {
    const spinner = ora("Stopping Agenticflow...").start();
    if (runShell("docker compose down", true)) {
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
            runShell("docker compose down -v --rmi local", true);
            if (fs.existsSync(ENV_FILE)) fs.unlinkSync(ENV_FILE);
        }
        if (uninstallCli) {
            try { execSync("npm uninstall -g agenticflow", { stdio: "ignore" }); } catch { }
        }
        spinner.succeed("Uninstalled.");
    } catch (err) {
        spinner.fail(`Failed: ${(err as Error).message}`);
    }
}

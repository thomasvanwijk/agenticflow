import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { DEFAULT_SECRETS_FILE } from "../config.js";
import { loadSecrets, saveSecrets, getMasterPassword } from "../services/secrets.js";

/**
 * Helper to generate a consistent MCP secret key based on the naming convention:
 * MCP_<SERVERNAME>_<VARNAME>
 */
function getMcpSecretKey(mcpName: string, key: string): string {
    const cleanName = mcpName.replace(/-mcp$/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const cleanKey = key.toUpperCase().replace(new RegExp(`^${cleanName}_`, "i"), "");
    return `MCP_${cleanName}_${cleanKey}`;
}

export async function setSecretAction(key: string, value: string | undefined, options: any) {
    let targetKey = key;
    const mcpName = options.mcp;

    if (mcpName) {
        // Validation: Ensure the MCP is actually installed
        const { getServersDir } = await import("./mcp.js");
        const mcpPath = path.join(getServersDir(), `${mcpName}.json`);
        if (!fs.existsSync(mcpPath)) {
            console.error(`\n❌ Error: Variable could not be saved because MCP server '${mcpName}' is not installed.`);
            console.log(`💡 Tip: Check for typos or add the server first with: 'agenticflow mcp add ${mcpName}'\n`);
            return;
        }

        targetKey = getMcpSecretKey(mcpName, key);
        console.log(`Scoped to MCP '${mcpName}' → ${targetKey}`);
    }

    let secretValue = value;
    if (!secretValue) {
        const a = await inquirer.prompt([{ type: "password", name: "s", message: `Value for ${targetKey}:`, mask: "*" }]);
        secretValue = a.s;
    }

    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    secrets[targetKey] = secretValue!;
    saveSecrets(options.file || DEFAULT_SECRETS_FILE, secrets, pwd);
    console.log(`Secret '${targetKey}' saved.`);

    const { sync } = await inquirer.prompt([
        {
            type: "confirm",
            name: "sync",
            message: "Would you like to apply these changes to your running gateway now?\n  ℹ️  This triggers a live reload — no restart needed.",
            default: true
        }
    ]);

    if (sync) {
        await touchSecretsFile(options.file || DEFAULT_SECRETS_FILE);
    }
}

export async function getSecretAction(key: string, options: any) {
    let targetKey = key;
    if (options.mcp) {
        targetKey = getMcpSecretKey(options.mcp, key);
    }

    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    if (targetKey in secrets) {
        if (options.mcp) console.log(`${targetKey}=${secrets[targetKey]}`);
        else console.log(secrets[targetKey]);
    } else {
        console.error(`Secret '${targetKey}' not found.`);
    }
}

export async function listSecretsAction(options: any) {
    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    
    let keys = Object.keys(secrets);
    const mcpName = options.mcp;

    if (mcpName) {
        const prefix = getMcpSecretKey(mcpName, "").replace(/_$/, ""); // e.g. MCP_ATLASSIAN
        keys = keys.filter(k => k.startsWith(prefix + "_"));
        console.log(`Secrets for MCP '${mcpName}':`);
        keys.forEach(k => {
            const shortKey = k.replace(prefix + "_", "");
            console.log(` - ${shortKey} (${k})`);
        });
    } else {
        console.log("Global Secrets:");
        keys.forEach(k => console.log(` - ${k}`));
    }
}

/**
 * Decrypts secrets.enc and emits shell `export KEY='VALUE'` statements to stdout.
 * Consumed by the gateway entrypoint via:
 *   eval "$(agenticflow secrets export --file /path/to/secrets.enc)"
 */
export async function exportSecretsAction(options: any) {
    const pwd = process.env.AGENTICFLOW_MASTER_PASSWORD || await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    for (const [key, value] of Object.entries(secrets)) {
        const escaped = value.replace(/'/g, "'\\''");
        process.stdout.write(`export ${key}='${escaped}'\n`);
    }
}

/**
 * Touch secrets.enc to trigger the chokidar watcher in the sync-controller for hot-reload.
 */
async function touchSecretsFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        const now = new Date();
        fs.utimesSync(filePath, now, now);
        console.log("✅ Gateway notified. Updated secrets will be applied within a few seconds.");
    } else {
        console.warn("⚠️  secrets.enc not found — gateway could not be notified.");
    }
}

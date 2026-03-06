import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { DEFAULT_SECRETS_FILE, CONFIG_DIR } from "../config.js";
import { loadSecrets, saveSecrets, getMasterPassword } from "../services/secrets.js";

export async function setSecretAction(key: string, value: string | undefined, options: any) {
    let secretValue = value;
    if (!secretValue) {
        const a = await inquirer.prompt([{ type: "password", name: "s", message: `Value for ${key}:`, mask: "*" }]);
        secretValue = a.s;
    }
    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    secrets[key] = secretValue!;
    saveSecrets(options.file || DEFAULT_SECRETS_FILE, secrets, pwd);
    console.log(`Secret '${key}' saved.`);
}

export async function getSecretAction(key: string, options: any) {
    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    if (key in secrets) console.log(secrets[key]);
    else console.error(`Not found.`);
}

export async function listSecretsAction(options: any) {
    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);
    Object.keys(secrets).forEach(k => console.log(` - ${k}`));
}

export async function injectSecretsAction(options: any) {
    const pwd = await getMasterPassword();
    const secrets = loadSecrets(options.file || DEFAULT_SECRETS_FILE, pwd);

    // Scan both base config and servers.d for templates
    const searchDirs = [CONFIG_DIR, path.join(CONFIG_DIR, "servers.d")];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (!file.includes(".example.")) continue;

            const filePath = path.join(dir, file);
            const content = fs.readFileSync(filePath, "utf8");
            const injected = content.replace(/\$\{([A_Z0-9_]+)\}|\{\{([A_Z0-9_]+)\}\}/gi, (m, g1, g2) => secrets[g1 || g2] || process.env[g1 || g2] || m);

            const outPath = path.join(dir, file.replace(".example.", "."));
            fs.writeFileSync(outPath, injected);
            console.log(`Injected ${outPath}`);
        }
    }
}

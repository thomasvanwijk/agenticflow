#!/usr/bin/env node

import fs from "fs";
import crypto from "crypto";
import path from "path";
import { Command } from "commander";
import inquirer from "inquirer";

const ALGORITHM = "aes-256-gcm";
const DEFAULT_SECRETS_FILE = path.resolve(process.cwd(), "config/secrets.enc");

// Helper: Ensure we have a valid key from password
function getKey(password: string): Buffer {
    return crypto.scryptSync(password, "agenticflow-salt", 32);
}

// Encrypt payload
function encrypt(text: string, password: string): { iv: string; content: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const key = getKey(password);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString("hex"),
        content: encrypted,
        tag: tag.toString("hex"),
    };
}

// Decrypt payload
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

// Read and decrypt the secrets file
function loadSecrets(filePath: string, password?: string): Record<string, string> {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    if (!fileContent.trim()) {
        return {};
    }

    if (!password) {
        throw new Error("Master password is required to decrypt secrets.");
    }

    try {
        const encryptedData = JSON.parse(fileContent);
        const decryptedStr = decrypt(encryptedData, password);
        return JSON.parse(decryptedStr);
    } catch (e) {
        throw new Error("Failed to decrypt secrets. Incorrect master password or corrupted file.");
    }
}

// Encrypt and write the secrets file
function saveSecrets(filePath: string, secrets: Record<string, string>, password?: string) {
    if (!password) {
        throw new Error("Master password is required to save secrets.");
    }

    const plainText = JSON.stringify(secrets, null, 2);
    const encryptedData = encrypt(plainText, password);

    // Ensure dir exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2), "utf8");
}

async function getMasterPassword(): Promise<string> {
    // Check ENV first
    if (process.env.AGENTICFLOW_MASTER_PASSWORD) {
        return process.env.AGENTICFLOW_MASTER_PASSWORD;
    }

    // Otherwise prompt
    const { password } = await inquirer.prompt([
        {
            type: "password",
            name: "password",
            message: "Enter Master Password:",
            mask: "*",
        },
    ]);
    return password;
}

const program = new Command();

program
    .name("agenticflow-secrets")
    .description("Unified secret management for AgenticFlow")
    .version("1.0.0");

program
    .command("set <key> [value]")
    .description("Set a secret key-value pair")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .action(async (key, value, options) => {
        let secretValue = value;
        if (!secretValue) {
            const answers = await inquirer.prompt([
                {
                    type: "password",
                    name: "secret",
                    message: `Enter value for ${key}:`,
                    mask: "*",
                },
            ]);
            secretValue = answers.secret;
        }

        const password = await getMasterPassword();
        const secrets = loadSecrets(options.file, password);
        secrets[key] = secretValue;

        saveSecrets(options.file, secrets, password);
        console.log(`Secret '${key}' saved successfully.`);
    });

program
    .command("get <key>")
    .description("Get a secret value")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .action(async (key, options) => {
        const password = await getMasterPassword();
        const secrets = loadSecrets(options.file, password);

        if (key in secrets) {
            console.log(secrets[key]);
        } else {
            console.error(`Secret '${key}' not found.`);
            process.exit(1);
        }
    });

program
    .command("list")
    .description("List all secret keys")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .action(async (options) => {
        const password = await getMasterPassword();
        const secrets = loadSecrets(options.file, password);
        const keys = Object.keys(secrets);

        if (keys.length === 0) {
            console.log("No secrets stored.");
        } else {
            console.log("Stored secrets:");
            keys.forEach(k => console.log(` - ${k}`));
        }
    });

program
    .command("inject")
    .description("Inject secrets into configuration templates")
    .option("-f, --file <path>", "Path to secrets file", DEFAULT_SECRETS_FILE)
    .option("-t, --templates <dir>", "Directory containing example configs", path.resolve(process.cwd(), "config"))
    .option("-o, --output <dir>", "Directory to write injected configs", path.resolve(process.cwd(), "config"))
    .action(async (options) => {
        const password = await getMasterPassword();
        const secrets = loadSecrets(options.file, password);

        const files = fs.readdirSync(options.templates);
        let injectedCount = 0;

        for (const file of files) {
            if (!file.includes(".example.")) continue;

            const templatePath = path.join(options.templates, file);
            const content = fs.readFileSync(templatePath, "utf8");

            // Replace secrets: assume format like {{SECRET_KEY}} or ${SECRET_KEY}
            const injectedContent = content.replace(/\$\{([A-Z0-9_]+)\}|\{\{([A-Z0-9_]+)\}\}/gi, (match, g1, g2) => {
                const key = g1 || g2;
                if (key in secrets) {
                    return secrets[key];
                }
                // Check ENV variables as fallback
                if (process.env[key] !== undefined) {
                    return process.env[key] as string;
                }
                return match; // Leave untouched if not found
            });

            const outputPath = path.join(options.output, file.replace(".example.", "."));
            fs.writeFileSync(outputPath, injectedContent, "utf8");
            console.log(`Injected secrets into ${outputPath}`);
            injectedCount++;
        }

        console.log(`Injection complete. Processed ${injectedCount} template(s).`);
    });

program.parse(process.argv);

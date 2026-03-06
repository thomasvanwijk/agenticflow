import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { DEFAULT_SECRETS_FILE } from "../config.js";
import { decrypt, encrypt } from "../utils/crypto.js";

export function loadSecrets(filePath: string, password?: string): Record<string, string> {
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

export function saveSecrets(filePath: string, secrets: Record<string, string>, password?: string) {
    if (!password) throw new Error("Master password is required to save secrets.");
    const encryptedData = encrypt(JSON.stringify(secrets, null, 2), password);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2), "utf8");
}

export async function getMasterPassword(): Promise<string> {
    if (process.env.AGENTICFLOW_MASTER_PASSWORD) return process.env.AGENTICFLOW_MASTER_PASSWORD;
    const { password } = await inquirer.prompt([{ type: "password", name: "password", message: "Enter Master Password:", mask: "*" }]);
    return password;
}

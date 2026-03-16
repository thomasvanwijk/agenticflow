import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { Entry } from "@napi-rs/keyring";
import { DEFAULT_SECRETS_FILE } from "../config.js";
import { decrypt, encrypt } from "../utils/crypto.js";

const SERVICE_NAME = "agenticflow";
const ACCOUNT_NAME = "master-password";

export async function setMasterPasswordInKeychain(password: string): Promise<void> {
    try {
        const entry = new Entry(SERVICE_NAME, ACCOUNT_NAME);
        await entry.setPassword(password);
    } catch (e) {
        console.warn("\n⚠️  Warning: OS Keychain unavailable. Master password will not be persisted across CLI sessions.");
        if (process.platform === 'linux') {
            console.warn("   To fix this on Linux, you can install a secret service daemon like gnome-keyring:");
            console.warn("   Debian/Ubuntu: sudo apt-get install gnome-keyring libsecret-1-0");
            console.warn("   Arch/Manjaro: sudo pacman -S gnome-keyring libsecret");
        } else if (process.platform === 'win32') {
            console.warn("   To fix this on Windows, ensure the Credential Manager service is running.");
        } else if (process.platform === 'darwin') {
            console.warn("   To fix this on macOS, ensure your user has access to the login keychain.");
        }
        console.warn("");
    }
}

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
    // Priority 1: Environment variable (for CI/CD and Docker)
    if (process.env.AGENTICFLOW_MASTER_PASSWORD) {
        return process.env.AGENTICFLOW_MASTER_PASSWORD;
    }

    try {
        const entry = new Entry(SERVICE_NAME, ACCOUNT_NAME);
        const password = await entry.getPassword();
        if (password) return password;
    } catch (e) {
        // Key might not exist or keychain is unavailable, proceed to prompt
    }

    const { password } = await inquirer.prompt([{ type: "password", name: "password", message: "Enter Master Password:", mask: "*" }]);
    await setMasterPasswordInKeychain(password);
    return password;
}

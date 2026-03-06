import crypto from "crypto";
import { ALGORITHM, SALT } from "../config.js";

export function getKey(password: string): Buffer {
    return crypto.scryptSync(password, SALT, 32);
}

export function encrypt(text: string, password: string): { iv: string; content: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const key = getKey(password);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { iv: iv.toString("hex"), content: encrypted, tag: (cipher as any).getAuthTag().toString("hex") };
}

export function decrypt(hash: { iv: string; content: string; tag: string }, password: string): string {
    const iv = Buffer.from(hash.iv, "hex");
    const tag = Buffer.from(hash.tag, "hex");
    const key = getKey(password);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    (decipher as any).setAuthTag(tag);
    let decrypted = decipher.update(hash.content, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

export function generatePassword(length = 32) {
    return crypto.randomBytes(length).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, length);
}

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { NoteData } from "../types.js";

export function walkVault(dir: string, results: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue; // skip hidden dirs like .obsidian
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkVault(full, results);
        } else if (entry.name.endsWith(".md")) {
            results.push(full);
        }
    }
    return results;
}

export function readNote(filePath: string): NoteData {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    return { content: parsed.content, data: parsed.data, excerpt: (parsed as any).excerpt || "" };
}

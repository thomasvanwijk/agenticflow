import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { NoteData } from "../types.js";

export function walkVault(dir: string, results: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
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

export type FuzzyPathResult = 
    | { type: "exact" | "fuzzy"; path: string }
    | { type: "multiple"; options: string[] }
    | { type: "not_found" };

export function resolveFuzzyPath(vaultPath: string, requestedPath: string): FuzzyPathResult {
    const cleanPath = requestedPath.replace(/^\/+/, "");
    let exactPath = path.join(vaultPath, cleanPath);
    
    if (!exactPath.startsWith(vaultPath)) {
        return { type: "not_found" };
    }

    if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
        return { type: "exact", path: exactPath };
    }

    if (!cleanPath.endsWith(".md")) {
        const mdPath = exactPath + ".md";
        if (fs.existsSync(mdPath) && fs.statSync(mdPath).isFile()) {
            return { type: "exact", path: mdPath };
        }
    }

    const allFiles = walkVault(vaultPath);
    const searchTarget = cleanPath.endsWith(".md") ? cleanPath : cleanPath + ".md";
    
    const matches = allFiles.filter(f => {
        const relPath = f.slice(vaultPath.length).replace(/^\/+/, "");
        return relPath === searchTarget || relPath.endsWith(`/${searchTarget}`) || relPath.endsWith(`\\${searchTarget}`);
    });

    if (matches.length === 1) {
        return { type: "fuzzy", path: matches[0] };
    }

    if (matches.length > 1) {
        const options = matches.map(m => m.slice(vaultPath.length).replace(/^\/+/, ""));
        return { type: "multiple", options };
    }

    return { type: "not_found" };
}

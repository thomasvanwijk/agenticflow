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

export type FuzzyPathResult = 
    | { type: "exact" | "fuzzy"; path: string }
    | { type: "multiple"; options: string[] }
    | { type: "not_found" };

/**
 * Attempts to resolve a file path gracefully.
 * 1. Checks exact match.
 * 2. Checks exact match + ".md".
 * 3. Walks vault to find a file ending with the requested name.
 */
export function resolveFuzzyPath(vaultPath: string, requestedPath: string): FuzzyPathResult {
    // 1. Sanitize the requested path
    const cleanPath = requestedPath.replace(/^\/+/, ""); // remove leading slashes
    let exactPath = path.join(vaultPath, cleanPath);
    
    // Prevent path traversal
    if (!exactPath.startsWith(vaultPath)) {
        return { type: "not_found" };
    }

    // 2. Try exact
    if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
        return { type: "exact", path: exactPath };
    }

    // 3. Try exact + .md
    if (!cleanPath.endsWith(".md")) {
        const mdPath = exactPath + ".md";
        if (fs.existsSync(mdPath) && fs.statSync(mdPath).isFile()) {
            return { type: "exact", path: mdPath };
        }
    }

    // 4. Fuzzy search: walk the vault and look for matching suffix
    const allFiles = walkVault(vaultPath);
    // e.g. "project.md" or "project"
    const searchTarget = cleanPath.endsWith(".md") ? cleanPath : cleanPath + ".md";
    
    const matches = allFiles.filter(f => {
        const relPath = f.slice(vaultPath.length).replace(/^\/+/, "");
        // Match exact filename or filename as suffix of a path
        return relPath === searchTarget || relPath.endsWith(`/${searchTarget}`) || relPath.endsWith(`\\${searchTarget}`);
    });

    if (matches.length === 1) {
        return { type: "fuzzy", path: matches[0] };
    }

    if (matches.length > 1) {
        // Return relative paths as options for the LLM
        const options = matches.map(m => m.slice(vaultPath.length).replace(/^\/+/, ""));
        return { type: "multiple", options };
    }

    return { type: "not_found" };
}

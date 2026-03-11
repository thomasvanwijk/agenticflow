import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { resolveFuzzyPath } from "../src/services/vault.js";

// Mock the file system
vi.mock("fs");

describe("Vault Path Resolution", () => {
    const VAULT_PATH = "/mock/vault";

    beforeEach(() => {
        vi.resetAllMocks();
        
        // Mock fs.readdirSync to simulate walkVault behavior
        vi.mocked(fs.readdirSync).mockImplementation((dir: fs.PathLike) => {
            const dirStr = dir.toString();
            if (dirStr === VAULT_PATH) {
                return [
                    { name: "Projects", isDirectory: () => true, isFile: () => false },
                    { name: "root-note.md", isDirectory: () => false, isFile: () => true },
                    { name: ".obsidian", isDirectory: () => true, isFile: () => false }, 
                ] as any;
            }
            if (dirStr === path.join(VAULT_PATH, "Projects")) {
                return [
                    { name: "Active", isDirectory: () => true, isFile: () => false },
                    { name: "project.md", isDirectory: () => false, isFile: () => true },
                    { name: "ambiguous.md", isDirectory: () => false, isFile: () => true },
                ] as any;
            }
            if (dirStr === path.join(VAULT_PATH, "Projects", "Active")) {
                return [
                    { name: "architecture.md", isDirectory: () => false, isFile: () => true },
                    { name: "ambiguous.md", isDirectory: () => false, isFile: () => true },
                ] as any;
            }
            return [];
        });

        // Mock fs.existsSync and statSync for exact match checks
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            const pStr = p.toString().replace(/\\/g, '/');
            const validPaths = [
                path.join(VAULT_PATH, "root-note.md"),
                path.join(VAULT_PATH, "Projects/project.md"),
                path.join(VAULT_PATH, "Projects/Active/architecture.md"),
                path.join(VAULT_PATH, "Projects/ambiguous.md"),
                path.join(VAULT_PATH, "Projects/Active/ambiguous.md"),
            ].map(v => v.replace(/\\/g, '/'));
            return validPaths.includes(pStr);
        });

        vi.mocked(fs.statSync).mockImplementation(() => {
            return { isFile: () => true } as fs.Stats;
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should resolve an exact path", () => {
        const result = resolveFuzzyPath(VAULT_PATH, "Projects/project.md");
        expect(result.type).toBe("exact");
        if (result.type === "exact") {
            expect(result.path.replace(/\\/g, '/')).toContain("Projects/project.md");
        }
    });

    it("should resolve an exact path missing the .md extension", () => {
        const result = resolveFuzzyPath(VAULT_PATH, "Projects/project");
        expect(result.type).toBe("exact");
        if (result.type === "exact") {
            expect(result.path.replace(/\\/g, '/')).toContain("Projects/project.md");
        }
    });

    it("should perform a fuzzy search for a filename", () => {
        // "architecture.md" exists in "Projects/Active/"
        const result = resolveFuzzyPath(VAULT_PATH, "architecture.md");
        expect(result.type).toBe("fuzzy");
        if (result.type === "fuzzy") {
            expect(result.path.replace(/\\/g, '/')).toContain("Projects/Active/architecture.md");
        }
    });

    it("should perform a fuzzy search for a filename missing .md", () => {
        // "architecture" should find "Projects/Active/architecture.md"
        const result = resolveFuzzyPath(VAULT_PATH, "architecture");
        expect(result.type).toBe("fuzzy");
        if (result.type === "fuzzy") {
            expect(result.path.replace(/\\/g, '/')).toContain("Projects/Active/architecture.md");
        }
    });

    it("should return multiple options if filename is ambiguous", () => {
        const result = resolveFuzzyPath(VAULT_PATH, "ambiguous");
        expect(result.type).toBe("multiple");
        if (result.type === "multiple") {
            const normalized = result.options.map(o => o.replace(/\\/g, '/'));
            expect(normalized).toContain("Projects/ambiguous.md");
            expect(normalized).toContain("Projects/Active/ambiguous.md");
        }
    });

    it("should return not_found for non-existent files", () => {
        const result = resolveFuzzyPath(VAULT_PATH, "missing-file");
        expect(result).toEqual({ type: "not_found" });
    });

    it("should prevent path traversal attacks", () => {
        const result = resolveFuzzyPath(VAULT_PATH, "../../../etc/passwd");
        expect(result).toEqual({ type: "not_found" });
    });
});

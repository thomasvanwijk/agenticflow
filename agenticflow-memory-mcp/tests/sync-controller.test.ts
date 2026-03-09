import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncState } from "../src/services/sync-controller.js";
import fs from "fs";
import { execFile } from "child_process";

// Mock child_process.execFile
vi.mock("child_process", () => ({
    execFile: vi.fn((cmd, args, callback) => {
        if (callback) callback(null, "success", "");
    })
}));

// Mock chroma and providers
vi.mock("../src/services/chroma.js", () => ({
    getCollection: vi.fn().mockResolvedValue({
        count: vi.fn().mockResolvedValue(0),
        get: vi.fn().mockResolvedValue({ ids: [] }),
        delete: vi.fn(),
        upsert: vi.fn()
    })
}));

vi.mock("../src/providers/index.js", () => ({
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

describe("Sync Controller - State Reconciliation Engine", () => {
    let globalFetchMock: any;
    let existsSyncSpy: any;
    let readdirSyncSpy: any;
    let readFileSyncSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock global fetch
        globalFetchMock = vi.fn();
        global.fetch = globalFetchMock;
        
        // Default filesystem mock
        existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        readdirSyncSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue(["obsidian.json", "sqlite.json"] as any);
        readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
            if (path.includes("obsidian.json")) return JSON.stringify({ name: "obsidian" });
            if (path.includes("sqlite.json")) return JSON.stringify({ name: "sqlite" });
            return "{}";
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should identify additions and register new servers via API", async () => {
        // Registry only has obsidian, missing sqlite
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([{ name: "obsidian" }])
                });
            }
            if (url.endsWith("/api/v0/servers") && options?.method === "POST") {
                return Promise.resolve({ ok: true });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([])
                });
            }
            return Promise.resolve({ ok: true });
        });

        await syncState();

        // Should have posted sqlite to API
        expect(globalFetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/v0/servers"),
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ name: "sqlite" })
            })
        );
        
        // Should NOT have posted obsidian
        expect(globalFetchMock).not.toHaveBeenCalledWith(
            expect.stringContaining("/api/v0/servers"),
            expect.objectContaining({
                body: JSON.stringify({ name: "obsidian" })
            })
        );
    });

    it("should correctly identify deletions and deregister servers", async () => {
        // Filesystem has nothing
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue([]);

        // Registry has orphaned servers
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([{ name: "old-server" }])
                });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true });
        });

        await syncState();

        // Should deregister 'old-server' via mcpjungle deregister
        expect(execFile).toHaveBeenCalledWith(
            "mcpjungle",
            ["deregister", "old-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });

    it("should immediately hide specific servers like obsidian after registration", async () => {
        // Filesystem has obsidian
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["obsidian.json"]);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify({ name: "obsidian" }));

        // Registry is empty
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([])
                });
            }
            if (url.endsWith("/api/v0/servers") && options?.method === "POST") {
                return Promise.resolve({ ok: true });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true });
        });

        await syncState();

        // Registration should happen
        expect(globalFetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/v0/servers"),
            expect.objectContaining({ method: "POST" })
        );

        // Disabling logic should be triggered immediately
        expect(execFile).toHaveBeenCalledWith(
            "mcpjungle",
            ["disable", "server", "obsidian", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });
});

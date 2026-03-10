import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncState, resetSyncState } from "../src/services/sync-controller.js";
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
        resetSyncState();

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

        // Should also have posted obsidian (to ensure latest config)
        expect(globalFetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/v0/servers"),
            expect.objectContaining({
                method: "POST",
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
            "/usr/local/bin/mcpjungle",
            ["deregister", "old-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });

    it("should hide any server by default (except agenticflow)", async () => {
        // Filesystem has unknown-server
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["unknown.json"]);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify({ name: "unknown-server" }));

        // Registry is empty
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
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

        // Should have been registered
        expect(globalFetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/v0/servers"),
            expect.objectContaining({ method: "POST" })
        );

        // Should have been DISABLED by default
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["disable", "server", "unknown-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });

    it("should honor explicit expose: true flag", async () => {
        // Filesystem has exposed-server
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["exposed.json"]);
        (fs.readFileSync as any).mockReturnValue(JSON.stringify({ name: "exposed-server", expose: true }));

        // Registry is empty
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
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

        // Should have been ENABLED (exposed) via mcpjungle enable
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["enable", "server", "exposed-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );

        // Should NOT have been disabled
        expect(execFile).not.toHaveBeenCalledWith(
            "mcpjungle",
            ["disable", "server", "exposed-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });

    it("should never hide the agenticflow server itself", async () => {
        // Filesystem has agenticflow (which is usually skipped in the loop but handled in enforce loop)
        // Wait, the main loop specifically skips agenticflow: if (name === "agenticflow") continue;
        // But the enforce loop should also honor it.

        // Filesystem has obsidian (default hidden) and agenticflow
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["obsidian.json", "agenticflow.json"]);
        (fs.readFileSync as any).mockImplementation((path: any) => {
            if (path.includes("obsidian.json")) return JSON.stringify({ name: "obsidian" });
            if (path.includes("agenticflow.json")) return JSON.stringify({ name: "agenticflow" });
            return "{}";
        });

        // Registry has both
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([{ name: "obsidian" }, { name: "agenticflow" }])
                });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true });
        });

        await syncState();

        // Obsidian should be disabled
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["disable", "server", "obsidian", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );

        // Agenticflow should NEVER be disabled
        expect(execFile).not.toHaveBeenCalledWith(
            "mcpjungle",
            ["disable", "server", "agenticflow", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });
    it("should skip re-registration if config is unchanged", async () => {
        // Filesystem has unchanged-server
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["unchanged.json"]);
        const config = { name: "unchanged-server", expose: true };
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(config));

        // Registry has the server
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([config])
                });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true });
        });

        // 1. Initial sync (to populate cache)
        await syncState();
        
        // Should have registered once
        const postCalls = globalFetchMock.mock.calls.filter((call: any) => call[0].endsWith("/api/v0/servers") && call[1]?.method === "POST");
        expect(postCalls.length).toBe(1);
        vi.clearAllMocks();

        // 2. Second sync with same config
        // Mock registry return for second call
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([config])
                });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true });
        });

        await syncState();

        // Should NOT have registered again
        const postCallsSecond = globalFetchMock.mock.calls.filter((call: any) => call[0].endsWith("/api/v0/servers") && call[1]?.method === "POST");
        expect(postCallsSecond.length).toBe(0);
    });
});

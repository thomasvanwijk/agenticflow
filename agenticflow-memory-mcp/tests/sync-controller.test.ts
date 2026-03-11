import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncState, resetSyncState, resolveEnvVars } from "../src/services/sync-controller.js";
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

    it("should always process agenticflow first and force-enable it", async () => {
        // Filesystem has obsidian (default hidden) and agenticflow
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["obsidian.json", "agenticflow.json"]);
        (fs.readFileSync as any).mockImplementation((path: any) => {
            if (path.includes("obsidian.json")) return JSON.stringify({ name: "obsidian" });
            if (path.includes("agenticflow.json")) return JSON.stringify({ name: "agenticflow" });
            return "{}";
        });

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

        // 1. Verify agenticflow was registered
        const agenticflowPost = globalFetchMock.mock.calls.find((call: any) => 
            call[0].endsWith("/api/v0/servers") && 
            call[1]?.method === "POST" && 
            JSON.parse(call[1].body).name === "agenticflow"
        );
        expect(agenticflowPost).toBeDefined();

        // 2. Verify agenticflow was EXPLICITLY enabled
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["enable", "server", "agenticflow", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );

        // 3. Verify ordering: agenticflow processed before obsidian registration
        const agenticflowEnableIndex = (execFile as any).mock.calls.findIndex((call: any) => call[1][2] === "agenticflow");
        const obsidianPostIndex = globalFetchMock.mock.calls.findIndex((call: any) => 
            call[1]?.method === "POST" && JSON.parse(call[1].body).name === "obsidian"
        );
        expect(agenticflowEnableIndex).toBeLessThan(obsidianPostIndex);
    });

    it("should always re-enforce exposure state even if config is unchanged", async () => {
        // Filesystem has unchanged-server
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(["unchanged.json"]);
        const config = { name: "unchanged-server", expose: false };
        (fs.readFileSync as any).mockReturnValue(JSON.stringify(config));

        // Registry has the server
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([config]) });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true });
        });

        // 1. Initial sync (to populate cache)
        await syncState();
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["disable", "server", "unchanged-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
        vi.clearAllMocks();

        // 2. Second sync with same config
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([config]) });
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

        // BUT should STILL have disabled it (persistence reinforcement)
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["disable", "server", "unchanged-server", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });

    it("should perform startup exposure enforcement pass", async () => {
        // Registry has multiple servers, cache is empty
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([{ name: "server1" }, { name: "server2" }, { name: "agenticflow" }])
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        });

        // FS is empty for this test
        (fs.existsSync as any).mockReturnValue(false);

        await syncState();

        // Should have hidden all non-agenticflow servers at startup
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["disable", "server", "server1", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["disable", "server", "server2", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
        expect(execFile).toHaveBeenCalledWith(
            "/usr/local/bin/mcpjungle",
            ["enable", "server", "agenticflow", "--registry", "http://127.0.0.1:8080"],
            expect.any(Function)
        );
    });

    describe("In-Memory Secret Resolution", () => {
        it("should resolve ${VAR} and {{VAR}} placeholders from process.env", () => {
            const env = { 
                MY_API_KEY: "secret-token-123",
                OTHER_VAR: "other-value"
            };
            const config = {
                name: "test-server",
                env: {
                    API_KEY: "${MY_API_KEY}",
                    SETTING: "{{OTHER_VAR}}",
                    LITERAL: "just-text",
                    MISSING: "${MISSING_VAR}"
                }
            };
            
            const resolved = resolveEnvVars(config, env);
            
            expect(resolved.env.API_KEY).toBe("secret-token-123");
            expect(resolved.env.SETTING).toBe("other-value");
            expect(resolved.env.LITERAL).toBe("just-text");
            expect(resolved.env.MISSING).toBe("${MISSING_VAR}"); // Leaves as-is if missing
        });

        it("should POST resolved config to registry, but cache the template", async () => {
            // Mock environment
            process.env.MCP_TEST_KEY = "resolved-value";
            
            // Filesystem has template
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readdirSync as any).mockReturnValue(["test.json"]);
            const template = { 
                name: "test", 
                env: { KEY: "${MCP_TEST_KEY}" } 
            };
            (fs.readFileSync as any).mockReturnValue(JSON.stringify(template));

            // Registry is empty
            globalFetchMock.mockImplementation((url: string, options: any) => {
                if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
                }
                return Promise.resolve({ ok: true });
            });

            await syncState();

            // 1. Verify what was POSTed (should be RESOLVED)
            const postCall = globalFetchMock.mock.calls.find((call: any) => 
                call[0].endsWith("/api/v0/servers") && call[1]?.method === "POST"
            );
            const postedBody = JSON.parse(postCall[1].body);
            expect(postedBody.env.KEY).toBe("resolved-value");

            // 2. Verify cache (should be TEMPLATE)
            // Note: Since resetSyncState/syncState are in the same module, we can't directly 
            // check the cache map unless we exported it, but we can verify that a second 
            // call skip re-registration because the template matches.
            vi.clearAllMocks();
            
            // Re-mock to return the server this time
            globalFetchMock.mockImplementation((url: string, options: any) => {
                if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                    return Promise.resolve({ ok: true, json: () => Promise.resolve([{ name: "test" }]) });
                }
                return Promise.resolve({ ok: true });
            });

            await syncState();
            const secondPostCall = globalFetchMock.mock.calls.find((call: any) => 
                call[0].endsWith("/api/v0/servers") && call[1]?.method === "POST"
            );
            expect(secondPostCall).toBeUndefined(); // Skip due to cache match
        });
    });
});

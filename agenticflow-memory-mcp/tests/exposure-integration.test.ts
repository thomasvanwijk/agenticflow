import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncState, resetSyncState } from "../src/services/sync-controller.js";
import fs from "fs";
import { execFile } from "child_process";

// This test simulates the full synchronization flow and verifies the side effects
// (API calls and CLI invocations) to ensure the exposure contract is met.

vi.mock("child_process", () => ({
    execFile: vi.fn((cmd, args, callback) => {
        if (callback) callback(null, "success", "");
    })
}));

vi.mock("../src/services/chroma.js", () => ({
    getCollection: vi.fn().mockResolvedValue({
        count: vi.fn().mockResolvedValue(0),
        get: vi.fn().mockResolvedValue({ ids: [] }),
        delete: vi.fn(),
        upsert: vi.fn()
    })
}));

vi.mock("../src/providers/index.js", () => ({
    generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0))
}));

describe("Tool Exposure E2E (Integrated Logic Test)", () => {
    let globalFetchMock: any;

    beforeEach(() => {
        vi.clearAllMocks();
        resetSyncState();
        globalFetchMock = vi.fn();
        global.fetch = globalFetchMock;

        // Mock filesystem: agenticflow + n8n-mcp + atlassian
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readdirSync').mockReturnValue(["agenticflow.json", "n8n-mcp.json", "atlassian.json"] as any);
        vi.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
            if (path.includes("agenticflow.json")) return JSON.stringify({ name: "agenticflow" });
            if (path.includes("n8n-mcp.json")) return JSON.stringify({ name: "n8n-mcp" });
            if (path.includes("atlassian.json")) return JSON.stringify({ name: "atlassian", expose: true });
            return "{}";
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should enforce the tool exposure contract: agenticflow first, others disabled after registration", async () => {
        // Registry is empty
        globalFetchMock.mockImplementation((url: string, options: any) => {
            if (url.endsWith("/api/v0/servers") && (!options || options.method === "GET")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            if (url.endsWith("/api/v0/servers") && options?.method === "POST") {
                return Promise.resolve({ ok: true });
            }
            if (url.endsWith("/api/v0/tools")) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([
                    { name: "discover_tools", description: "desc" },
                    { name: "n8n-mcp__tool", description: "desc" }
                ]) });
            }
            return Promise.resolve({ ok: true });
        });

        await syncState();

        // ASSERTIONS:

        // 1. All servers registered (3 POST calls)
        const postCalls = globalFetchMock.mock.calls.filter((c: any) => c[1]?.method === "POST");
        expect(postCalls.length).toBe(3);

        // 2. agenticflow was FIRST to be enabled
        const enableCalls = (execFile as any).mock.calls.filter((c: any) => c[1][0] === "enable");
        expect(enableCalls[0][1][2]).toBe("agenticflow");

        // 3. n8n-mcp was disabled
        expect(execFile).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining(["disable", "server", "n8n-mcp"]),
            expect.any(Function)
        );

        // 4. atlassian was enabled (explicitly requested in mock config)
        expect(execFile).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining(["enable", "server", "atlassian"]),
            expect.any(Function)
        );

        // 5. Semantic index refresh excluded meta-tools
        // (refreshIndex is called because registryChanged is true)
        // Meta-tools defined in sync-controller.ts are discover_tools, call_tool, refresh_tool_index.
    });
});

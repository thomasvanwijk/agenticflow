import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// 1. Setup temp vault BEFORE any service imports
const tempVault = fs.mkdtempSync(path.join(os.tmpdir(), "agenticflow-test-"));
process.env.VAULT_PATH = tempVault;
process.env.EMBEDDING_PROVIDER = "local";

// Mock ChromaDB and Embedding Provider
vi.mock("chromadb", () => {
    const mockCollection = {
        get: vi.fn().mockResolvedValue({ ids: [] }),
        upsert: vi.fn().mockResolvedValue(true),
        query: vi.fn().mockResolvedValue({
            documents: [["Sample note content"]],
            metadatas: [[{ title: "Sample Note", path: "sample.md" }]],
            distances: [[0.1]]
        }),
        delete: vi.fn().mockResolvedValue(true),
    };

    // Proper constructor mock
    const ChromaClient = vi.fn().mockImplementation(function () {
        return {
            getOrCreateCollection: vi.fn().mockResolvedValue(mockCollection),
        };
    });

    return { ChromaClient };
});

vi.mock("../src/providers/index.js", () => ({
    generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0)),
}));

// Import service AFTER mocks
const { indexVault } = await import("../src/services/indexer.js");

describe("Memory MCP Integration", () => {
    afterEach(() => {
        // Clean the vault between tests but keep the directory
        const files = fs.readdirSync(tempVault);
        for (const file of files) {
            fs.rmSync(path.join(tempVault, file), { recursive: true, force: true });
        }
        vi.clearAllMocks();
    });

    afterAll(() => {
        fs.rmSync(tempVault, { recursive: true, force: true });
    });

    it("should index a vault and detect a new note", async () => {
        const notePath = path.join(tempVault, "test.md");
        fs.writeFileSync(notePath, "---\ntitle: Test Note\n---\nHello world content");

        const result = await indexVault(true);

        expect(result.indexed).toBe(1);
        expect(result.total).toBe(1);
    });

    it("should skip unchanged notes", async () => {
        const notePath = path.join(tempVault, "test.md");
        fs.writeFileSync(notePath, "static content");

        const { ChromaClient } = await import("chromadb");
        const client = new ChromaClient();
        const collection = await client.getOrCreateCollection({ name: 'any' });

        const mtime = Math.floor(fs.statSync(notePath).mtimeMs);
        (collection.get as any).mockResolvedValueOnce({
            ids: ["test.md"],
            metadatas: [{ mtime }]
        });

        const result = await indexVault(false);
        expect(result.indexed).toBe(0);
        expect(result.skipped).toBe(1);
    });
});

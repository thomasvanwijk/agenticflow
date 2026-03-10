import { execSync } from "child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "../../src/config.js";

const SERVERS_DIR = path.join(CONFIG_DIR, "servers.d");

describe("MCP List Command E2E", () => {
    const testFile = path.join(SERVERS_DIR, "test-server.json");
    const exampleFile = path.join(SERVERS_DIR, "test-server.example.json");

    beforeAll(() => {
        if (!fs.existsSync(SERVERS_DIR)) fs.mkdirSync(SERVERS_DIR, { recursive: true });
        fs.writeFileSync(testFile, JSON.stringify({ name: "test-server", command: "node", args: [] }));
        fs.writeFileSync(exampleFile, JSON.stringify({ name: "example-server", command: "node", args: [] }));
    });

    afterAll(() => {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        if (fs.existsSync(exampleFile)) fs.unlinkSync(exampleFile);
    });

    it("should only list active .json files and ignore .example.json files", () => {
        // We use the linked agenticflow command or call the built entrypoint
        const output = execSync('node ./dist/index.js mcp list').toString();

        expect(output).toContain("test-server");
        expect(output).not.toContain("example-server");
        expect(output).not.toContain("test-server.example.json");
    });
});

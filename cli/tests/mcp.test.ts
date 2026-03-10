import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { addMcpAction, listMcpAction, removeMcpAction, getServersDir } from "../src/commands/mcp.js";
import * as shell from "../src/utils/shell.js";
import * as secretsService from "../src/services/secrets.js";
import * as secretsCommand from "../src/commands/secrets.js";

vi.mock("fs");
vi.mock("../src/utils/shell.js");
vi.mock("../src/services/secrets.js");
vi.mock("../src/commands/secrets.js");

describe("MCP CLI Commands", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(shell.runShell).mockReturnValue(true);
        vi.mocked(secretsService.getMasterPassword).mockResolvedValue("test-password");
        vi.mocked(secretsService.loadSecrets).mockReturnValue({});
    });

    it("should list configured MCP servers", () => {
        vi.mocked(fs.readdirSync).mockReturnValue(["test.json" as any]);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            name: "test",
            command: "npx",
            args: ["-y", "test-pkg"],
            env: { API_KEY: "${MCP_TEST_API_KEY}" }
        }));

        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        listMcpAction();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("- test (test.json)"));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Command: npx -y test-pkg"));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Env: API_KEY"));
        consoleSpy.mockRestore();
    });

    it("should add a new MCP server with env variables (encryption-first)", async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);

        await addMcpAction("sqlite", { command: "uvx", env: ["DB_PATH=/tmp/test.db"] }, ["mcp-server-sqlite", "--db", "test.db"]);

        expect(secretsService.saveSecrets).toHaveBeenCalled();
        expect(secretsCommand.injectSecretsToFile).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();

        // Verify the template content (example.json)
        const [writtenPath, writtenContent] = vi.mocked(fs.writeFileSync).mock.calls[0];
        expect(writtenPath).toContain("sqlite.example.json");

        const config = JSON.parse(writtenContent as string);
        expect(config.name).toBe("sqlite");
        expect(config.command).toBe("uvx");
        expect(config.args).toEqual(["mcp-server-sqlite", "--db", "test.db"]);
        // Should contain the placeholder, not the value
        expect(config.env).toEqual({ DB_PATH: "${MCP_SQLITE_DB_PATH}" });

        // Verify secrets were saved
        const savedSecrets = vi.mocked(secretsService.saveSecrets).mock.calls[0][1];
        expect(savedSecrets).toEqual({ MCP_SQLITE_DB_PATH: "/tmp/test.db" });
    });

    it("should remove an existing MCP server", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });

        removeMcpAction("sqlite");

        expect(fs.unlinkSync).toHaveBeenCalled();
        const [deletedPath] = vi.mocked(fs.unlinkSync).mock.calls[0];
        expect(deletedPath).toContain("sqlite.json");

        consoleSpy.mockRestore();
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { addMcpAction, listMcpAction, removeMcpAction, getServersDir } from "../src/commands/mcp.js";

vi.mock("fs");

describe("MCP CLI Commands", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it("should list configured MCP servers", () => {
        vi.mocked(fs.readdirSync).mockReturnValue(["test.json" as any]);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            name: "test",
            command: "npx",
            args: ["-y", "test-pkg"],
            env: { API_KEY: "123" }
        }));

        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        listMcpAction();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("- test (test.json)"));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Command: npx -y test-pkg"));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Env: API_KEY"));
        consoleSpy.mockRestore();
    });

    it("should add a new MCP server with env variables", () => {
        vi.mocked(fs.existsSync).mockReturnValue(false); // mock dir not exists to test mkdir
        
        addMcpAction("sqlite", { command: "uvx", env: ["DB_PATH=/tmp/test.db"] }, ["mcp-server-sqlite", "--db", "test.db"]);

        expect(fs.mkdirSync).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();

        const [writtenPath, writtenContent] = vi.mocked(fs.writeFileSync).mock.calls[0];
        expect(writtenPath).toContain("sqlite.json");
        
        const config = JSON.parse(writtenContent as string);
        expect(config.name).toBe("sqlite");
        expect(config.command).toBe("uvx");
        expect(config.args).toEqual(["mcp-server-sqlite", "--db", "test.db"]);
        expect(config.env).toEqual({ DB_PATH: "/tmp/test.db" });
    });

    it("should remove an existing MCP server", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        removeMcpAction("sqlite");

        expect(fs.unlinkSync).toHaveBeenCalled();
        const [deletedPath] = vi.mocked(fs.unlinkSync).mock.calls[0];
        expect(deletedPath).toContain("sqlite.json");
        
        consoleSpy.mockRestore();
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import inquirer from "inquirer";
import { addMcpAction } from "../src/commands/mcp.js";
import * as secretsService from "../src/services/secrets.js";
import * as secretsCommand from "../src/commands/secrets.js";

vi.mock("fs");
vi.mock("inquirer");
vi.mock("../src/services/secrets.js");
vi.mock("../src/commands/secrets.js");

describe("MCP Interactive CLI", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(secretsService.getMasterPassword).mockResolvedValue("test-password");
        vi.mocked(secretsService.loadSecrets).mockReturnValue({});
    });

    it("should guide user through interactive setup with secret masking", async () => {
        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            name: "interactive-mcp",
            command: "npx",
            args: "-y test-pkg"
        }).mockResolvedValueOnce({
            proceed: true
        }).mockResolvedValueOnce({
            key: "API_KEY",
            isSecret: true
        }).mockResolvedValueOnce({
            value: "secret-123"
        }).mockResolvedValueOnce({
            proceed: false
        }).mockResolvedValueOnce({
            action: "save"
        });

        await addMcpAction(undefined, {}, []);

        expect(inquirer.prompt).toHaveBeenCalledTimes(6);
        expect(secretsService.saveSecrets).toHaveBeenCalled();

        const savedSecrets = vi.mocked(secretsService.saveSecrets).mock.calls[0][1];
        expect(savedSecrets).toEqual({
            MCP_INTERACTIVE_MCP_API_KEY: "secret-123"
        });

        const [examplePath, exampleContent] = vi.mocked(fs.writeFileSync).mock.calls[0];
        expect(examplePath).toContain("interactive-mcp.example.json");
        const config = JSON.parse(exampleContent as string);
        expect(config.env).toEqual({
            API_KEY: "${MCP_INTERACTIVE_MCP_API_KEY}"
        });
    });
});

import { execSync } from "child_process";
import { describe, it, expect } from "vitest";

describe("Tool Exposure & Discovery", () => {
    it("should disable the obsidian tools by default", () => {
        // Query the MCPJungle API to ensure obsidian tools are registered but disabled
        const output = execSync('curl -s http://127.0.0.1:18080/api/v0/tools 2>&1').toString();
        const tools = JSON.parse(output);
        const createNoteTool = tools.find((t: any) => t.name === "memory_create_note");
        
        expect(createNoteTool).toBeDefined();
        // mcpjungle sets enabled to false when disabled
        expect(createNoteTool.enabled).toBe(false);
    });

    it("should expose only discovery tools on the primary agenticflow server", () => {
        const output = execSync('curl -s http://127.0.0.1:18080/api/v0/tools 2>&1').toString();
        const tools = JSON.parse(output);
        
        const agenticflowTools = tools.filter((t: any) => t.name.startsWith("agenticflow_"));
        const toolNames = agenticflowTools.map((t: any) => t.name);

        expect(toolNames).toContain("agenticflow_discover_tools");
        expect(toolNames).toContain("agenticflow_call_tool");
        expect(toolNames).toContain("agenticflow_refresh_tool_index");
        
        // It should NOT contain semantic_search directly
        expect(toolNames).not.toContain("agenticflow_semantic_search");
    });

    it("should allow discovery of disabled tools via agenticflow_discover_tools", () => {
        // We need to refresh the index first to ensure it's seeded
        execSync('docker compose -f ../docker-compose.yaml exec gateway mcpjungle invoke agenticflow_refresh_tool_index --registry http://127.0.0.1:8080');
        
        // Query the discover_tools endpoint
        const input = JSON.stringify({ query: "create a note", limit: 5 });
        const output = execSync(`docker compose -f ../docker-compose.yaml exec gateway mcpjungle invoke agenticflow_discover_tools --input '${input}' --registry http://127.0.0.1:8080 2>&1`).toString();
        
        // The result should contain a reference to memory_create_note
        expect(output).toContain("memory_create_note");
    }, 15000);

    it("should be able to invoke hidden tools via agenticflow_call_tool", () => {
        const payload = {
            tool_name: "memory_search_vault_keywords",
            input: { query: "AgenticFlow", limit: 1 }
        };
        const input = JSON.stringify(payload);
        
        const output = execSync(`docker compose -f ../docker-compose.yaml exec gateway mcpjungle invoke agenticflow_call_tool --input '${input}' --registry http://127.0.0.1:8080 2>&1`).toString();
        
        // Since we are searching the vault, it should return a result from the MCP tool execution
        expect(output).toContain("AgenticFlow");
        // Ensure it didn't just fail to call the tool
        expect(output).not.toContain("Tool call_tool failed");
    });
});

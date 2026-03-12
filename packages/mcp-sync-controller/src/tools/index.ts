import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { getToolCollection, embeddingProvider } from "../services/search.js";
import { logger } from "../utils/logger.js";
import { toolError } from "../utils/tool-error.js";

const execFileAsync = promisify(execFile);
const REGISTRY = process.env.REGISTRY || "http://127.0.0.1:8080";

const META_TOOLS = new Set(["agenticflow__discover_tools", "agenticflow__call_tool", "agenticflow__refresh_tool_index"]);

export function registerTools(server: McpServer) {
    server.tool(
        "discover_tools",
        "MUST BE YOUR FIRST STEP for finding available actions across notes, memory, and external integrations. Most tools are hidden and MUST be discovered first. Keywords that trigger this search: memory, jira, notes, codebase, search, e-mail, calendar, tasks, research. Semantically search for available MCP tools across all registered servers.",
        { query: z.string().describe("What do you want to do? (e.g., 'search for jira issues')"), limit: z.number().optional().default(5).describe("Number of tools to return") },
        async ({ query, limit }: { query: string; limit: number }) => {
            try {
                const collection = await getToolCollection();
                const queryEmbedding = await embeddingProvider.generate(query);
                const results = await collection.query({
                    queryEmbeddings: [queryEmbedding],
                    nResults: limit,
                });

                if (!results.documents[0]?.length) {
                    return { content: [{ type: "text", text: "No tools found in the discovery index. This usually means no external MCP servers are registered or indexed. Please add MCP servers via the agenticflow CLI or configuration, then run refresh_tool_index." }] };
                }

                const formatted = results.documents[0].map((doc: string | null, i: number) => {
                    const meta = (results.metadatas?.[0]?.[i] ?? {}) as Record<string, unknown>;
                    return `### Tool: ${meta.name}\n${doc ?? "No description"}`;
                });

                return { content: [{ type: "text", text: `## Relevant Tools Found:\n\n${formatted.join("\n\n---\n\n")}` }] };
            } catch (err) {
                return toolError("discover_tools", err);
            }
        }
    );

    server.tool(
        "refresh_tool_index",
        "Sync the semantic tool index with all currently registered tools in MCPJungle. Run this after adding new MCP servers.",
        {},
        async () => {
            try {
                const collection = await getToolCollection();
                let tools: Array<{ name: string; description: string }> = [];
                try {
                    const res = await fetch(`${REGISTRY}/api/v0/tools`);
                    if (res.ok) {
                        const payload = (await res.json()) as any;
                        tools = Array.isArray(payload) ? payload : (payload.tools || []);
                    }
                } catch (e) {
                    logger.warn("Failed to fetch tools from MCPJungle during index refresh", { error: String(e) });
                }

                try {
                    const count = await collection.count();
                    if (count > 0) {
                        const existing = await collection.get({ limit: count });
                        await collection.delete({ ids: existing.ids });
                    }
                } catch (e) { }

                let indexed = 0;
                for (const tool of tools) {
                    if (META_TOOLS.has(tool.name)) continue;
                    const textToEmbed = `${tool.name}: ${tool.description}`;
                    const embedding = await embeddingProvider.generate(textToEmbed);
                    await collection.upsert({
                        ids: [tool.name],
                        embeddings: [embedding],
                        documents: [tool.description || "No description provided"],
                        metadatas: [{ name: tool.name }],
                    });
                    indexed++;
                }

                return { content: [{ type: "text", text: `Tool index refreshed. Indexed ${indexed} tools.` }] };
            } catch (err) {
                return toolError("refresh_tool_index", err);
            }
        }
    );

    server.tool(
        "call_tool",
        "Execute a specific MCP tool by name. Use discover_tools first to find the right tool name, then call it here. This works for all tools including Jira, Confluence, and other integrations. CRITICAL: Do NOT flatten arguments! All tool parameters MUST be structured as a JSON object inside the 'input' argument. For example, if a tool takes 'path' and 'content', you must pass { \"tool_name\": \"...\", \"input\": \"{\\\"path\\\":\\\"...\\\",\\\"content\\\":\\\"...\\\"}\" }.",
        {
            tool_name: z.string().describe("The exact tool name to call (e.g., 'atlassian__search_jira_issues')"),
            input: z.string().optional().describe("A stringified JSON object containing the input parameters for the tool. IMPORTANT: This MUST be a JSON string, not a raw object."),
        },
        async ({ tool_name, input }: { tool_name: string; input?: string }) => {
            let parsedInput: any = {};
            if (typeof input === 'string') {
                try { parsedInput = JSON.parse(input); } catch (e) { parsedInput = {}; }
            }

            try {
                const inputJson = JSON.stringify(parsedInput);
                const { stdout, stderr } = await execFileAsync(
                    "mcpjungle",
                    ["invoke", tool_name, "--input", inputJson, "--registry", REGISTRY],
                    { timeout: 60000 }
                );

                const output = stdout || stderr;
                if (!output) {
                    return { content: [{ type: "text", text: "(tool returned no output)" }] };
                }

                return { content: [{ type: "text", text: output }] };
            } catch (err) {
                return toolError("call_tool", err, "Verify the tool name is correct using discover_tools.");
            }
        }
    );
}

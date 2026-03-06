// agenticflow-memory-mcp — Obsidian semantic memory server
// Exposes the Obsidian vault to AI agents via native STDIO MCP transport.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./config.js";
import { startAutoIndexer } from "./services/indexer.js";
import { registerTools } from "./tools/index.js";

// ─── Startup ─────────────────────────────────────────────────────────────────

// Validate environment
validateConfig();

// Initialize server
const server = new McpServer({
  name: "agenticflow",
  version: "0.4.0", // Refactored version
});

// Register all tools
registerTools(server);

// Start background services
startAutoIndexer();

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`[agenticflow] Memory MCP server started successfully.\n`);

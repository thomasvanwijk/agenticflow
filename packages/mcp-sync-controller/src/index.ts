import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { logger } from "./utils/logger.js";

// Initialize server
const server = new McpServer({
  name: "agenticflow",
  version: "1.0.0",
});

// Register meta-tools
registerTools(server);

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("Sync Controller MCP server started successfully", "server_startup");


import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startSyncController } from "./services/sync-controller.js";
import { registerTools } from "./tools/index.js";
import { logger } from "./utils/logger.js";

// Initialize server
const server = new McpServer({
  name: "agenticflow",
  version: "1.0.0",
});

// Register meta-tools
registerTools(server);

// Start background sync service
startSyncController();

// Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("Sync Controller MCP server started successfully", "server_startup");

// Keep the process alive
const keepAlive = setInterval(() => {}, 1000 * 60 * 60);

process.on("SIGINT", async () => {
  clearInterval(keepAlive);
  await server.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  clearInterval(keepAlive);
  await server.close();
  process.exit(0);
});

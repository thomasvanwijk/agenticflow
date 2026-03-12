import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./config.js";
import { startAutoIndexer } from "./services/indexer.js";
import { registerTools } from "./tools/index.js";
import { logger } from "./utils/logger.js";

// Validate environment
validateConfig();

// Initialize server
const server = new McpServer({
  name: "mcp-memory",
  version: "1.0.0",
});

// Register generic memory tools
registerTools(server);

// Start background indexing service
await startAutoIndexer();

// Connect SDK via STDIO
const transport = new StdioServerTransport();
await server.connect(transport);

logger.info("mcp-memory server started successfully", "server_startup");

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

// gravity-memory-mcp — Obsidian semantic memory server
// Phase 2 stub: defines the tool interface.
// Full implementation in Phase 2 of agenticflow.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "gravity-memory",
  version: "0.1.0",
});

// ─── Tool: Semantic search over vault ─────────────────────────────────────────
server.tool(
  "semantic_search",
  "Search Obsidian vault notes by meaning/intent",
  { query: z.string(), limit: z.number().optional().default(5) },
  async ({ query, limit }) => {
    // TODO Phase 2: query ChromaDB for vectors matching `query`
    return {
      content: [{ type: "text", text: `[stub] semantic_search("${query}") — implement in Phase 2` }],
    };
  }
);

// ─── Tool: Recent notes by time window ────────────────────────────────────────
server.tool(
  "recent_context",
  "Retrieve notes modified or created in the last N hours",
  { hours: z.number().default(24) },
  async ({ hours }) => {
    // TODO Phase 2: scan vault for files modified within `hours`
    return {
      content: [{ type: "text", text: `[stub] recent_context(${hours}h) — implement in Phase 2` }],
    };
  }
);

// ─── Tool: Get a specific note ─────────────────────────────────────────────────
server.tool(
  "get_note",
  "Read a specific note by path (relative to vault root)",
  { path: z.string() },
  async ({ path }) => {
    // TODO Phase 2: read file from /vault mount
    return {
      content: [{ type: "text", text: `[stub] get_note("${path}") — implement in Phase 2` }],
    };
  }
);

// ─── Tool: Append to daily log ─────────────────────────────────────────────────
server.tool(
  "append_log",
  "Append content to today's daily log note",
  { content: z.string(), section: z.string().optional() },
  async ({ content, section }) => {
    // TODO Phase 2: append to vault/40_LOGS/YYYY-MM-DD.md
    return {
      content: [{ type: "text", text: `[stub] append_log() — implement in Phase 2` }],
    };
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────────
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
let transport: SSEServerTransport | null = null;

app.get("/mcp", async (_req: Request, res: Response) => {
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
});

app.post("/message", async (req: Request, res: Response) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active transport");
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Memory MCP server listening on port ${PORT}`);
});

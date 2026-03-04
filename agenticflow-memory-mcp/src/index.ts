// agenticflow-memory-mcp — Obsidian semantic memory server
// Exposes the Obsidian vault to AI agents via native STDIO MCP transport.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { ChromaClient } from "chromadb";
import type { Collection } from "chromadb";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);


// ─── Config ───────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env.VAULT_PATH || "/vault";
const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
const CHROMA_PORT = process.env.CHROMA_PORT || "8000";
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "ollama";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "nomic-embed-text";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkVault(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // skip hidden dirs like .obsidian
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkVault(full, results);
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

function readNote(filePath: string): { content: string; data: Record<string, unknown>; excerpt: string } {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return { content: parsed.content, data: parsed.data, excerpt: parsed.excerpt || "" };
}

// ─── Providers ───────────────────────────────────────────────────────────────

interface EmbeddingProvider {
  generate(text: string): Promise<number[]>;
}

class OllamaProvider implements EmbeddingProvider {
  async generate(text: string): Promise<number[]> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text.slice(0, 8192) }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${errorText}`);
      }

      const json = (await res.json()) as { embedding?: number[]; embeddings?: number[][] };
      const emb = json.embedding ?? json.embeddings?.[0];

      if (!Array.isArray(emb) || emb.length === 0) {
        throw new Error(`Invalid response from Ollama: ${JSON.stringify(json).slice(0, 200)}`);
      }

      return emb;
    } catch (err) {
      process.stderr.write(`TRACE: Ollama error: ${(err as Error).stack || (err as Error).message}\n`);
      throw new Error(`Ollama provider failed: ${(err as Error).message}`);
    }
  }
}

class OpenAIProvider implements EmbeddingProvider {
  async generate(text: string): Promise<number[]> {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8192) }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${errorText}`);
      }

      const json = (await res.json()) as { data: { embedding: number[] }[] };
      return json.data[0].embedding;
    } catch (err) {
      process.stderr.write(`TRACE: OpenAI error: ${(err as Error).stack || (err as Error).message}\n`);
      throw new Error(`OpenAI provider failed: ${(err as Error).message}`);
    }
  }
}

class LocalProvider implements EmbeddingProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static pipeline: any = null;

  async generate(text: string): Promise<number[]> {
    if (!LocalProvider.pipeline) {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Cache models in a writable directory inside the container
      env.cacheDir = "/tmp/hf-cache";
      // Force WASM backend — the native onnxruntime-node binary requires glibc
      // which is not available on Alpine Linux (musl). WASM works everywhere.
      env.backends.onnx.wasm && (env.backends.onnx.wasm.proxy = false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (env as any).backends.onnx.backend = "wasm";
      const model = EMBEDDING_MODEL !== "nomic-embed-text" ? EMBEDDING_MODEL : "Xenova/all-MiniLM-L6-v2";
      process.stderr.write(`[local-embed] Loading model ${model} (first load may take a moment)...\n`);
      LocalProvider.pipeline = await pipeline("feature-extraction", model, { dtype: "fp32" });
      process.stderr.write(`[local-embed] Model loaded.\n`);
    }
    const output = await LocalProvider.pipeline(text.slice(0, 4096), { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  }
}

function getProvider(): EmbeddingProvider {
  if (EMBEDDING_PROVIDER === "openai") return new OpenAIProvider();
  if (EMBEDDING_PROVIDER === "local") return new LocalProvider();
  return new OllamaProvider();
}

async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getProvider();
  return provider.generate(text);
}

// No-op embedding function for ChromaDB registration — we always provide external embeddings
const noOpEmbeddingFunction = {
  generate: async (): Promise<number[][]> => {
    throw new Error("Chroma internal generate() called. Use generateEmbedding() instead.");
  },
};

async function getCollection(name?: string): Promise<Collection> {
  // Use a per-provider collection name so different embedding dimensions never conflict.
  // Users can switch providers freely and even compare results between them.
  const collectionName = name ?? `obsidian_vault_${EMBEDDING_PROVIDER}`;
  const client = new ChromaClient({ host: CHROMA_HOST, port: parseInt(CHROMA_PORT), ssl: false });
  return client.getOrCreateCollection({
    name: collectionName,
    embeddingFunction: noOpEmbeddingFunction,
  });
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agenticflow-memory",
  version: "0.3.0",
});

// ─── Tool: Semantic search ─────────────────────────────────────────────────────
server.tool(
  "semantic_search",
  "Semantically search Obsidian vault notes by meaning or intent. Returns the most relevant notes for a given query.",
  { query: z.string().describe("Search query in natural language"), limit: z.number().optional().default(5).describe("Number of results to return") },
  async ({ query, limit }) => {
    try {
      const collection = await getCollection("obsidian_vault");
      const queryEmbedding = await generateEmbedding(query);
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
      });

      if (!results.documents[0]?.length) {
        return { content: [{ type: "text", text: "No results found. The vault index may be empty — try running index_vault first or using recent_context." }] };
      }

      const formatted = results.documents[0].map((doc: string | null, i: number) => {
        const meta = (results.metadatas?.[0]?.[i] ?? {}) as Record<string, unknown>;
        const score = results.distances?.[0]?.[i];
        const rel = score != null ? `(relevance: ${(1 - score).toFixed(2)})` : "";
        return `### ${meta.title || meta.path || `Result ${i + 1}`} ${rel}\n${(doc ?? "").slice(0, 1500)}`;
      });

      return { content: [{ type: "text", text: formatted.join("\n\n---\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Search failed: ${(err as Error).message}\n\nTip: ChromaDB may not be running, or the vault hasn't been indexed yet.` }] };
    }
  }
);

// ─── Tool: Index vault ─────────────────────────────────────────────────────────
server.tool(
  "index_vault",
  "Index or re-index the Obsidian vault into ChromaDB for semantic search. Run this once after setup, or when notes have changed significantly.",
  { force: z.boolean().optional().default(false).describe("Force re-index even if already indexed") },
  async ({ force }) => {
    try {
      const collection = await getCollection("obsidian_vault");
      const files = walkVault(VAULT_PATH);

      if (!files.length) {
        return { content: [{ type: "text", text: `No markdown files found in vault at ${VAULT_PATH}` }] };
      }

      let indexed = 0;
      let skipped = 0;

      for (const filePath of files) {
        const relPath = path.relative(VAULT_PATH, filePath);
        const { content, data } = readNote(filePath);
        if (!content.trim()) { skipped++; continue; }

        const stat = fs.statSync(filePath);
        const id = relPath.replace(/\\/g, "/");

        if (!force) {
          // Check if already indexed with same mtime
          const existing = await collection.get({ ids: [id] });
          if (existing.ids.length > 0) {
            const meta = existing.metadatas?.[0] as Record<string, unknown> | undefined;
            if (meta && meta.mtime === Math.floor(stat.mtimeMs)) { skipped++; continue; }
          }
        }

        try {
          const embedding = await generateEmbedding(content);
          await collection.upsert({
            ids: [id],
            embeddings: [embedding],
            documents: [content.slice(0, 8000)],
            metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
          });
          indexed++;
        } catch (fileErr) {
          // Skip files that fail embedding (e.g. binary content, Ollama error)
          process.stderr.write(`Skipping ${relPath}: ${(fileErr as Error).message}\n`);
          skipped++;
        }
      }

      return { content: [{ type: "text", text: `Indexing complete.\n- Indexed: ${indexed} notes\n- Skipped (failed/unchanged): ${skipped} notes\n- Total vault files: ${files.length}` }] };
    } catch (err) {
      process.stderr.write(`TRACE: ${(err as Error).stack || (err as Error).message}\n`);
      return { content: [{ type: "text", text: `Indexing failed: ${(err as Error).message}` }] };
    }
  }
);

// ─── Tool: Recent notes ────────────────────────────────────────────────────────
server.tool(
  "recent_context",
  "Retrieve Obsidian notes that were modified or created within the last N hours. Great for morning standups or catching up on recent work.",
  { hours: z.number().default(24).describe("Time window in hours"), limit: z.number().optional().default(10).describe("Max notes to return") },
  async ({ hours, limit }) => {
    const cutoff = Date.now() - hours * 3600 * 1000;
    const files = walkVault(VAULT_PATH);

    const recent = files
      .map((f) => ({ path: f, mtime: fs.statSync(f).mtimeMs }))
      .filter((f) => f.mtime >= cutoff)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);

    if (!recent.length) {
      return { content: [{ type: "text", text: `No notes modified in the last ${hours} hours.` }] };
    }

    const formatted = recent.map(({ path: filePath, mtime }) => {
      const relPath = path.relative(VAULT_PATH, filePath);
      const { content, data } = readNote(filePath);
      const modifiedAt = new Date(mtime).toLocaleString("en-NL", { timeZone: "Europe/Amsterdam" });
      const title = data.title || path.basename(filePath, ".md");
      return `### ${title}\n_Path: ${relPath} | Modified: ${modifiedAt}_\n\n${content.slice(0, 2000)}`;
    });

    return { content: [{ type: "text", text: `## ${recent.length} notes modified in the last ${hours}h\n\n${formatted.join("\n\n---\n\n")}` }] };
  }
);

// ─── Tool: Get note ────────────────────────────────────────────────────────────
server.tool(
  "get_note",
  "Read a specific Obsidian note by its path (relative to vault root).",
  { path: z.string().describe("File path relative to vault root, e.g. 'Projects/agenticflow.md'") },
  async ({ path: notePath }) => {
    const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
    if (!full.startsWith(VAULT_PATH)) {
      return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
    }
    if (!fs.existsSync(full)) {
      return { content: [{ type: "text", text: `Note not found: ${notePath}` }] };
    }

    const { content, data } = readNote(full);
    const stat = fs.statSync(full);
    const meta = Object.keys(data).length
      ? `**Frontmatter:**\n${JSON.stringify(data, null, 2)}\n\n`
      : "";

    return {
      content: [{
        type: "text",
        text: `# ${data.title || path.basename(notePath, ".md")}\n_Modified: ${new Date(stat.mtimeMs).toISOString()}_\n\n${meta}${content}`,
      }],
    };
  }
);

// ─── Tool: Append log ──────────────────────────────────────────────────────────
server.tool(
  "append_log",
  "Append a note or thought to today's daily log in the Obsidian vault.",
  {
    content: z.string().describe("Content to append"),
    section: z.string().optional().describe("Optional section heading to append under (e.g. '## Notes')"),
  },
  async ({ content, section }) => {
    const today = new Date().toISOString().slice(0, 10);
    const logDir = path.join(VAULT_PATH, "40_LOGS");
    const logFile = path.join(logDir, `${today}.md`);

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const timestamp = new Date().toLocaleTimeString("en-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });

    if (!fs.existsSync(logFile)) {
      // Create with frontmatter
      fs.writeFileSync(logFile, `---\ndate: ${today}\ntags: [log]\n---\n\n# Log ${today}\n\n`);
    }

    const entry = section
      ? `\n${section}\n- ${timestamp}: ${content}\n`
      : `\n- ${timestamp}: ${content}\n`;

    fs.appendFileSync(logFile, entry);

    return { content: [{ type: "text", text: `Appended to ${today}.md at ${timestamp}` }] };
  }
);

// ─── Tool: Discover tools ─────────────────────────────────────────────────────
server.tool(
  "discover_tools",
  "Semantically search for available MCP tools across all registered servers (Jira, Confluence, etc.). Use this when you are not sure which tool to use for a task.",
  { query: z.string().describe("What do you want to do? (e.g., 'search for jira issues')"), limit: z.number().optional().default(5).describe("Number of tools to return") },
  async ({ query, limit }) => {
    try {
      const collection = await getCollection("mcp_tools");
      const queryEmbedding = await generateEmbedding(query);
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
      });

      if (!results.documents[0]?.length) {
        return { content: [{ type: "text", text: "No tools found in index. Try running refresh_tool_index first." }] };
      }

      const formatted = results.documents[0].map((doc: string | null, i: number) => {
        const meta = (results.metadatas?.[0]?.[i] ?? {}) as Record<string, unknown>;
        return `### Tool: ${meta.name}\n${doc ?? "No description"}`;
      });

      return { content: [{ type: "text", text: `## Relevant Tools Found:\n\n${formatted.join("\n\n---\n\n")}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Tool discovery failed: ${(err as Error).message}` }] };
    }
  }
);

// ─── Tool: Refresh tool index ──────────────────────────────────────────────────
server.tool(
  "refresh_tool_index",
  "Sync the semantic tool index with all currently registered tools in MCPJungle. Run this after adding new MCP servers.",
  {},
  async () => {
    try {
      const collection = await getCollection("mcp_tools");

      // Fetch tools from MCPJungle API
      // Since this runs inside the gateway container as a child process, 'localhost:8080' should work
      const res = await fetch("http://localhost:8080/api/v0/tools");
      if (!res.ok) throw new Error(`Failed to fetch tools from MCPJungle: ${res.statusText}`);

      const tools = (await res.json()) as Array<{ name: string; description: string }>;

      // Clear existing tool index (simplest for now)
      try {
        const existing = await collection.get();
        if (existing.ids.length > 0) {
          await collection.delete({ ids: existing.ids });
        }
      } catch (e) {
        // Collection might be empty
      }

      let indexed = 0;
      for (const tool of tools) {
        const textToEmbed = `${tool.name}: ${tool.description}`;
        const embedding = await generateEmbedding(textToEmbed);
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
      return { content: [{ type: "text", text: `Refresh failed: ${(err as Error).message}` }] };
    }
  }
);

// ─── Tool: Call tool (proxy executor) ────────────────────────────────────────
server.tool(
  "call_tool",
  "Execute a specific MCP tool by name. Use discover_tools first to find the right tool name, then call it here. This works for all tools including Jira, Confluence, and other integrations.",
  {
    tool_name: z.string().describe("The exact tool name to call (e.g., 'atlassian__search_jira_issues')"),
    input: z.record(z.unknown()).optional().default({}).describe("JSON input parameters for the tool"),
  },
  async ({ tool_name, input }) => {
    try {
      const inputJson = JSON.stringify(input ?? {});

      const { stdout, stderr } = await execFileAsync(
        "/mcpjungle",
        ["invoke", tool_name, "--input", inputJson, "--registry", "http://127.0.0.1:8080"],
        { timeout: 60000 } // 60s timeout for slow tools
      );

      if (stderr && !stdout) {
        return { content: [{ type: "text", text: `Tool call failed:\n${stderr}` }] };
      }

      return { content: [{ type: "text", text: stdout || "(tool returned no output)" }] };
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const detail = error.stdout || error.stderr || error.message || String(err);
      return { content: [{ type: "text", text: `call_tool failed: ${detail}\n\nTip: Verify the tool name is correct using discover_tools.` }] };
    }
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

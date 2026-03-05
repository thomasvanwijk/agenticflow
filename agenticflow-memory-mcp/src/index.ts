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
import os from "os";
import chokidar from "chokidar";

const execFileAsync = promisify(execFile);


// ─── Config ───────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env.VAULT_PATH || "/vault";
const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
const CHROMA_PORT = process.env.CHROMA_PORT || "8000";
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "ollama";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/jina-embeddings-v2-small-en";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

if (!fs.existsSync(VAULT_PATH)) {
  process.stderr.write(`[agenticflow] CRITICAL: VAULT_PATH does not exist: ${VAULT_PATH}\n`);
  process.stderr.write(`Please ensure your vault directory is correctly mounted to ${VAULT_PATH} in docker-compose.yaml\n`);
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static initPromise: Promise<any> | null = null;

  async generate(text: string): Promise<number[]> {
    if (!LocalProvider.pipeline) {
      if (!LocalProvider.initPromise) {
        LocalProvider.initPromise = (async () => {
          const { pipeline, env } = await import("@huggingface/transformers");
          // Cache models in a writable directory inside the container
          env.cacheDir = "/tmp/hf-cache";
          const model = EMBEDDING_MODEL !== "nomic-embed-text" ? EMBEDDING_MODEL : "Xenova/all-MiniLM-L6-v2";
          process.stderr.write(`[local-embed] Loading model ${model} (first load may take a moment)...\n`);
          // onnxruntime-node (native binary, glibc-dependent) is replaced with onnxruntime-web
          // (pure WASM) in the Docker build — works on Alpine Linux without glibc.
          const loadedPipeline = await pipeline("feature-extraction", model, { dtype: "q8" });
          process.stderr.write(`[local-embed] Model loaded.\n`);
          return loadedPipeline;
        })();
      }
      LocalProvider.pipeline = await LocalProvider.initPromise;
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
  const baseName = name ?? "obsidian_vault";
  const collectionName = `${baseName}_${EMBEDDING_PROVIDER}`;
  const client = new ChromaClient({ host: CHROMA_HOST, port: parseInt(CHROMA_PORT), ssl: false });
  return client.getOrCreateCollection({
    name: collectionName,
    embeddingFunction: noOpEmbeddingFunction,
  });
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agenticflow",
  version: "0.3.0",
});

// ─── Tool: Semantic search ─────────────────────────────────────────────────────
server.tool(
  "semantic_search",
  "Semantically search Obsidian vault notes by meaning or intent. Returns the most relevant notes for a given query.",
  { query: z.string().describe("Search query in natural language"), limit: z.number().optional().default(5).describe("Number of results to return") },
  async ({ query, limit }) => {
    try {
      const collection = await getCollection();
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

// ─── Tool: Exact keyword search ────────────────────────────────────────────────
server.tool(
  "search_vault_keywords",
  "Search the Obsidian vault using exact keyword matching (lexical search). Very fast. Useful for finding specific proper nouns, names, or code snippets where semantic search might fail.",
  {
    query: z.string().describe("Exact text or keyword to search for"),
    limit: z.number().optional().default(10).describe("Maximum number of files to return")
  },
  async ({ query, limit }) => {
    try {
      const files = walkVault(VAULT_PATH);
      if (!files.length) {
        return { content: [{ type: "text", text: `No markdown files found in vault at ${VAULT_PATH}` }] };
      }

      const results: string[] = [];
      const searchStr = query.toLowerCase();

      // Read files quickly and find matches
      // Note: in a production setting with thousands of huge files this might be slow,
      // but for typical Markdown vaults, Node's fs reading is near-instant.
      for (const filePath of files) {
        if (results.length >= limit) break;

        const relPath = path.relative(VAULT_PATH, filePath).replace(/\\/g, "/");
        const { content, data } = readNote(filePath);

        if (content.toLowerCase().includes(searchStr) || (data.title && String(data.title).toLowerCase().includes(searchStr))) {
          // Extract a snippet around the first match
          const idx = content.toLowerCase().indexOf(searchStr);
          let snippet = "";
          if (idx !== -1) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(content.length, idx + searchStr.length + 100);
            snippet = content.slice(start, end).replace(/\n/g, " ").trim();
            if (start > 0) snippet = "..." + snippet;
            if (end < content.length) snippet = snippet + "...";
          }

          results.push(`### ${data.title || path.basename(filePath, ".md")}\nFile: \`${relPath}\`\nSnippet: ${snippet}`);
        }
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No exact matches found for "${query}".` }] };
      }

      return { content: [{ type: "text", text: `## Exact Matches for "${query}":\n\n${results.join("\n\n---\n\n")}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Search failed: ${(err as Error).message}` }] };
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
      const collection = await getCollection();
      const files = walkVault(VAULT_PATH);

      if (!files.length) {
        if (!fs.existsSync(VAULT_PATH)) {
          throw new Error(`Vault directory not found at ${VAULT_PATH}. Please check your volume configuration.`);
        }
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



// ─── Tool: Create note ─────────────────────────────────────────────────────────
server.tool(
  "create_note",
  "Create a new Obsidian note with optional frontmatter and content. Fails if the note already exists.",
  {
    path: z.string().describe("File path relative to vault root, e.g. 'Projects/new-project.md'"),
    frontmatter: z.record(z.unknown()).optional().describe("Key-value pairs for the note's YAML frontmatter (optional)"),
    content: z.string().optional().describe("The initial markdown content of the note (optional)")
  },
  async ({ path: notePath, frontmatter, content }) => {
    try {
      const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
      if (!full.startsWith(VAULT_PATH)) {
        return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
      }
      if (fs.existsSync(full)) {
        return { content: [{ type: "text", text: `Error: Note already exists at ${notePath}. Use update_note instead.` }] };
      }

      // Ensure directory exists
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let fileContent = "";
      if (frontmatter && Object.keys(frontmatter).length > 0) {
        fileContent += "---\n";
        // Simple YAML serialization
        for (const [key, value] of Object.entries(frontmatter)) {
          if (Array.isArray(value)) {
            fileContent += `${key}:\n`;
            value.forEach(v => fileContent += `  - ${v}\n`);
          } else {
            fileContent += `${key}: ${value}\n`;
          }
        }
        fileContent += "---\n\n";
      }

      if (content) {
        fileContent += content;
      }

      fs.writeFileSync(full, fileContent);

      return { content: [{ type: "text", text: `Successfully created note at: ${notePath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to create note: ${(err as Error).message}` }] };
    }
  }
);

// ─── Tool: Update note ─────────────────────────────────────────────────────────
server.tool(
  "update_note",
  "Completely replace the contents of an existing Obsidian note. This overwrites the entire file.",
  {
    path: z.string().describe("File path relative to vault root, e.g. 'Projects/project.md'"),
    content: z.string().describe("The new markdown content (including frontmatter if desired) to replace the file with")
  },
  async ({ path: notePath, content }) => {
    try {
      const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
      if (!full.startsWith(VAULT_PATH)) {
        return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
      }
      if (!fs.existsSync(full)) {
        return { content: [{ type: "text", text: `Error: Note not found at ${notePath}. Use create_note instead.` }] };
      }

      fs.writeFileSync(full, content);

      return { content: [{ type: "text", text: `Successfully updated note at: ${notePath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to update note: ${(err as Error).message}` }] };
    }
  }
);

// ─── Tool: Append to note ──────────────────────────────────────────────────────
server.tool(
  "append_to_note",
  "Append content to the end of an existing Obsidian note, optionally under a specific heading.",
  {
    path: z.string().describe("File path relative to vault root, e.g. 'Projects/project.md'"),
    content: z.string().describe("Content to append"),
    heading: z.string().optional().describe("Optional exact heading (e.g., '## Meeting Notes') to append under. If not found, it appends to the end.")
  },
  async ({ path: notePath, content, heading }) => {
    try {
      const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
      if (!full.startsWith(VAULT_PATH)) {
        return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
      }
      if (!fs.existsSync(full)) {
        return { content: [{ type: "text", text: `Error: Note not found at ${notePath}.` }] };
      }

      let fileContent = fs.readFileSync(full, "utf-8");

      if (heading) {
        // Find the heading line
        const lines = fileContent.split("\n");
        const headingIndex = lines.findIndex(line => line.trim() === heading.trim());

        if (headingIndex !== -1) {
          // Find the next heading of same or higher level to insert before
          const currentLevelMatch = heading.match(/^(#+)\s/);
          const currentLevel = currentLevelMatch ? currentLevelMatch[1].length : 0;

          let insertIndex = lines.length;
          for (let i = headingIndex + 1; i < lines.length; i++) {
            const match = lines[i].match(/^(#+)\s/);
            if (match && match[1].length <= currentLevel) {
              insertIndex = i;
              break;
            }
          }

          lines.splice(insertIndex, 0, "", content);
          fileContent = lines.join("\n");
          fs.writeFileSync(full, fileContent);
          return { content: [{ type: "text", text: `Successfully appended to note at: ${notePath} under heading '${heading}'` }] };
        }
      }

      // Fallback: append to end
      fs.appendFileSync(full, "\n" + content + "\n");
      return { content: [{ type: "text", text: `Successfully appended to the end of note at: ${notePath}` }] };

    } catch (err) {
      return { content: [{ type: "text", text: `Failed to append to note: ${(err as Error).message}` }] };
    }
  }
);
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
        "mcpjungle",
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

// ─── Auto-Indexer ─────────────────────────────────────────────────────────────

async function startAutoIndexer() {
  try {
    const isLowHardware = os.totalmem() < 4 * 1024 * 1024 * 1024 || os.cpus().length <= 2;
    process.stderr.write(`[agenticflow] Auto-indexer starting. Hardware profile: ${isLowHardware ? 'Low (tuned for Chromebox)' : 'Standard'}\n`);

    const collection = await getCollection();

    const watcher = chokidar.watch(path.join(VAULT_PATH, "**/*.md"), {
      ignored: [
        /(^|[/\\])\../, // ignore dotfiles/folders like .obsidian or .git
        "**/node_modules/**"
      ],
      persistent: true,
      ignoreInitial: true, // Prevent rescanning the entire vault on MCP process restart
      usePolling: false, // Default to fs.watch, relies on native OS events which is lighter
      depth: isLowHardware ? 5 : 99,
      awaitWriteFinish: {
        stabilityThreshold: 5000,
        pollInterval: 500
      }
    });

    watcher.on('add', async (filePath) => {
      try {
        const relPath = path.relative(VAULT_PATH, filePath);
        const { content, data } = readNote(filePath);
        if (!content.trim()) return;

        const stat = fs.statSync(filePath);
        const id = relPath.replace(/\\/g, "/");

        // Check if already indexed with same mtime
        const existing = await collection.get({ ids: [id] });
        if (existing.ids.length > 0) {
          const meta = existing.metadatas?.[0] as Record<string, unknown> | undefined;
          if (meta && meta.mtime === Math.floor(stat.mtimeMs)) return;
        }

        const embedding = await generateEmbedding(content);
        await collection.upsert({
          ids: [id],
          embeddings: [embedding],
          documents: [content.slice(0, 8000)],
          metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
        });
        process.stderr.write(`[agenticflow] Auto-indexed: ${id}\n`);
      } catch (err) {
        process.stderr.write(`[agenticflow] Failed to auto-index ${filePath}: ${(err as Error).message}\n`);
      }
    });

    watcher.on('change', async (filePath) => {
      try {
        const relPath = path.relative(VAULT_PATH, filePath);
        const { content, data } = readNote(filePath);
        if (!content.trim()) return;

        const stat = fs.statSync(filePath);
        const id = relPath.replace(/\\/g, "/");

        const embedding = await generateEmbedding(content);
        await collection.upsert({
          ids: [id],
          embeddings: [embedding],
          documents: [content.slice(0, 8000)],
          metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: Math.floor(stat.mtimeMs) }],
        });
        process.stderr.write(`[agenticflow] Auto-updated: ${id}\n`);
      } catch (err) {
        process.stderr.write(`[agenticflow] Failed to auto-update ${filePath}: ${(err as Error).message}\n`);
      }
    });

    watcher.on('unlink', async (filePath) => {
      try {
        const relPath = path.relative(VAULT_PATH, filePath);
        const id = relPath.replace(/\\/g, "/");
        await collection.delete({ ids: [id] });
        process.stderr.write(`[agenticflow] Auto-removed: ${id}\n`);
      } catch (err) {
        // It might already be gone
      }
    });

  } catch (err) {
    process.stderr.write(`[agenticflow] Failed to start auto-indexer: ${(err as Error).message}\n`);
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────────
startAutoIndexer();

const transport = new StdioServerTransport();
await server.connect(transport);

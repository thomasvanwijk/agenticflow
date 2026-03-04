// agenticflow-memory-mcp — Obsidian semantic memory server
// Exposes the Obsidian vault to AI agents via native STDIO MCP transport.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { ChromaClient, Collection } from "chromadb";

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

async function generateEmbedding(text: string): Promise<number[]> {
  if (EMBEDDING_PROVIDER === "openai" && OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0].embedding;
  } else {
    // Ollama
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text.slice(0, 8000) }),
    });
    const json = (await res.json()) as { embedding: number[] };
    return json.embedding;
  }
}

let chromaCollection: Collection | null = null;
async function getCollection(): Promise<Collection> {
  if (chromaCollection) return chromaCollection;
  const client = new ChromaClient({ path: `http://${CHROMA_HOST}:${CHROMA_PORT}` });
  chromaCollection = await client.getOrCreateCollection({ name: "obsidian_vault" });
  return chromaCollection;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agenticflow-memory",
  version: "0.2.0",
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
        include: ["documents", "metadatas", "distances"] as any,
      });

      if (!results.documents[0]?.length) {
        return { content: [{ type: "text", text: "No results found. The vault index may be empty — try running an index first or using recent_context." }] };
      }

      const formatted = results.documents[0].map((doc: string | null, i: number) => {
        const meta = results.metadatas?.[0]?.[i] as Record<string, unknown> ?? {};
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
      const collection = await getCollection();
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
          const existing = await collection.get({ ids: [id], include: ["metadatas"] as any });
          if (existing.ids.length > 0) {
            const meta = existing.metadatas?.[0] as Record<string, unknown> | undefined;
            if (meta && meta.mtime === stat.mtimeMs) { skipped++; continue; }
          }
        }

        const embedding = await generateEmbedding(content);
        await collection.upsert({
          ids: [id],
          embeddings: [embedding],
          documents: [content.slice(0, 8000)],
          metadatas: [{ path: id, title: String(data.title || path.basename(filePath, ".md")), mtime: stat.mtimeMs }],
        });
        indexed++;
      }

      return { content: [{ type: "text", text: `Indexing complete.\n- Indexed: ${indexed} notes\n- Skipped (unchanged): ${skipped} notes\n- Total vault files: ${files.length}` }] };
    } catch (err) {
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

// ─── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

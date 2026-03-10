import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { VAULT_PATH } from "../config.js";
import { getCollection } from "../services/chroma.js";
import { generateEmbedding } from "../providers/index.js";
import { walkVault, readNote } from "../services/vault.js";
import { indexVault } from "../services/indexer.js";
import { logger, toolError } from "../utils/logger.js";
import matter from "gray-matter";
import { wrapAsAiCallout, mergeFrontmatterWithContributor, addContributorToFrontmatter, stringifyWithLinks } from "../utils/ai-attribution.js";

const execFileAsync = promisify(execFile);

export function registerTools(server: McpServer) {
    const role = process.env.AGENTICFLOW_ROLE || "all";

    // ─── Memory Role Tools ──────────────────────────────────────────────────
    if (role === "memory" || role === "all") {
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
                    return toolError("semantic_search", err, "ChromaDB may not be running, or the vault hasn't been indexed yet.");
                }
            }
        );

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

                    for (const filePath of files) {
                        if (results.length >= limit) break;

                        const relPath = path.relative(VAULT_PATH, filePath).replace(/\\/g, "/");
                        const { content, data } = readNote(filePath);

                        if (content.toLowerCase().includes(searchStr) || (data.title && String(data.title).toLowerCase().includes(searchStr))) {
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
                    return toolError("search_vault_keywords", err);
                }
            }
        );

        server.tool(
            "index_vault",
            "Index or re-index the Obsidian vault into ChromaDB for semantic search. Run this once after setup, or when notes have changed significantly.",
            { force: z.boolean().optional().default(false).describe("Force re-index even if already indexed") },
            async ({ force }) => {
                try {
                    const { indexed, skipped, total } = await indexVault(force);
                    return { content: [{ type: "text", text: `Indexing complete.\n- Indexed: ${indexed} notes\n- Skipped (failed/unchanged): ${skipped} notes\n- Total vault files: ${total}` }] };
                } catch (err) {
                    return toolError("index_vault", err);
                }
            }
        );

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

        server.tool(
            "create_note",
            "Create a new Obsidian note with optional frontmatter and content. Fails if the note already exists.",
            {
                path: z.string().describe("File path relative to vault root, e.g. 'Projects/new-project.md'"),
                frontmatter: z.record(z.unknown()).optional().describe("Key-value pairs for the note's YAML frontmatter. For Obsidian wiki-links, provide the unquoted raw string like `[[Note Title]]`; the system will automatically quote it for Obsidian compatibility."),
                content: z.string().optional().describe("The initial markdown content of the note. IMPORTANT: The system will automatically wrap this content in an AI attribution callout. Do NOT manually wrap your prose."),
                ai_model: z.string().optional().describe("The true current AI model and version generating this content (e.g., 'Gemini 3.0 Pro' or your actual identity). Do not hallucinate older versions.")
            },
            async ({ path: notePath, frontmatter, content, ai_model }) => {
                try {
                    const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
                    if (!full.startsWith(VAULT_PATH)) {
                        return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
                    }
                    if (fs.existsSync(full)) {
                        return { content: [{ type: "text", text: `Error: Note already exists at ${notePath}. Use update_note instead.` }] };
                    }

                    const dir = path.dirname(full);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                    const finalContent = wrapAsAiCallout(content || "", ai_model);
                    const finalFrontmatter = mergeFrontmatterWithContributor({}, frontmatter, ai_model);
                    const fileContent = stringifyWithLinks(finalContent, finalFrontmatter);

                    fs.writeFileSync(full, fileContent);

                    return { content: [{ type: "text", text: `Successfully created note at: ${notePath}` }] };
                } catch (err) {
                    return toolError("create_note", err);
                }
            }
        );

        server.tool(
            "update_note",
            "Completely replace the contents of an existing Obsidian note. This overwrites the entire file.",
            {
                path: z.string().describe("File path relative to vault root, e.g. 'Projects/project.md'"),
                frontmatter: z.record(z.unknown()).optional().describe("Key-value pairs for the note's YAML frontmatter. For Obsidian wiki-links, provide the unquoted raw string like `[[Note Title]]`; the system will automatically quote it for Obsidian compatibility."),
                content: z.string().describe("The new markdown content (excluding frontmatter) to replace the file with. IMPORTANT: You MUST manually wrap any newly generated prose in `> [!ai]` callouts. The system will NOT automatically wrap the file content."),
                ai_model: z.string().optional().describe("The true current AI model and version generating this content (e.g., 'Gemini 3.0 Pro' or your actual identity). Do not hallucinate older versions.")
            },
            async ({ path: notePath, frontmatter, content, ai_model }) => {
                try {
                    const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
                    if (!full.startsWith(VAULT_PATH)) {
                        return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
                    }
                    if (!fs.existsSync(full)) {
                        return { content: [{ type: "text", text: `Error: Note not found at ${notePath}. Use create_note instead.` }] };
                    }

                    // Since we accept frontmatter as an object now, we merge it directly.
                    // If the user provided frontmatter in the content string (e.g., via matter), 
                    // we can optionally parse it, but standard usage should use the parameter.
                    const { data, content: body } = matter(content);
                    const mergedFrontmatter = { ...data, ...(frontmatter || {}) };
                    const finalFrontmatter = mergeFrontmatterWithContributor(mergedFrontmatter, {}, ai_model);
                    const fileContent = stringifyWithLinks(body, finalFrontmatter);

                    fs.writeFileSync(full, fileContent);

                    return { content: [{ type: "text", text: `Successfully updated note at: ${notePath}` }] };
                } catch (err) {
                    return toolError("update_note", err);
                }
            }
        );

        server.tool(
            "append_to_note",
            "Append content to the end of an existing Obsidian note, optionally under a specific heading.",
            {
                path: z.string().describe("File path relative to vault root, e.g. 'Projects/project.md'"),
                content: z.string().describe("Content to append. IMPORTANT: The system will automatically wrap this content in an AI attribution callout. Do NOT manually wrap your prose."),
                heading: z.string().optional().describe("Optional exact heading (e.g., '## Meeting Notes') to append under. If not found, it appends to the end."),
                ai_model: z.string().optional().describe("The true current AI model and version generating this content (e.g., 'Gemini 3.0 Pro' or your actual identity). Do not hallucinate older versions.")
            },
            async ({ path: notePath, content, heading, ai_model }) => {
                try {
                    const full = path.join(VAULT_PATH, notePath.replace(/^\//, ""));
                    if (!full.startsWith(VAULT_PATH)) {
                        return { content: [{ type: "text", text: "Access denied: path traversal not allowed." }] };
                    }
                    if (!fs.existsSync(full)) {
                        return { content: [{ type: "text", text: `Error: Note not found at ${notePath}.` }] };
                    }

                    let fileContent = fs.readFileSync(full, "utf-8");
                    const wrappedContent = wrapAsAiCallout(content, ai_model);

                    if (heading) {
                        const lines = fileContent.split("\n");
                        const headingIndex = lines.findIndex(line => line.trim() === heading.trim());

                        if (headingIndex !== -1) {
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

                            lines.splice(insertIndex, 0, "", wrappedContent);
                            fileContent = lines.join("\n");
                            fileContent = addContributorToFrontmatter(fileContent, ai_model);
                            fs.writeFileSync(full, fileContent);
                            return { content: [{ type: "text", text: `Successfully appended to note at: ${notePath} under heading '${heading}'` }] };
                        }
                    }

                    fileContent = fileContent.trimEnd() + "\n\n" + wrappedContent + "\n";
                    fileContent = addContributorToFrontmatter(fileContent, ai_model);
                    fs.writeFileSync(full, fileContent);
                    return { content: [{ type: "text", text: `Successfully appended to the end of note at: ${notePath}` }] };

                } catch (err) {
                    return toolError("append_to_note", err);
                }
            }
        );
    }

    // ─── Discovery Role Tools ───────────────────────────────────────────────
    if (role === "discovery" || role === "all") {
        server.tool(
            "discover_tools",
            "MUST BE YOUR FIRST STEP for finding available actions across notes, memory, and external integrations. Most tools are hidden and MUST be discovered first. Keywords that trigger this search: memory, jira, notes, codebase, search, e-mail, calendar, tasks, research. Semantically search for available MCP tools across all registered servers.",
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
                    const collection = await getCollection("mcp_tools");
                    
                    // 1. Get ALL external tools from MCPJungle (includes obsidian when it is registered)
                    let tools: Array<{ name: string; description: string }> = [];
                    try {
                        const res = await fetch("http://127.0.0.1:8080/api/v0/tools");
                        if (res.ok) {
                            tools = (await res.json()) as Array<{ name: string; description: string }>;
                        }
                    } catch (e) {
                        logger.warn("Failed to fetch tools from MCPJungle during index refresh", { error: String(e) });
                    }

                    // 2. Clear existing index (with pagination fix)
                    try {
                        const count = await collection.count();
                        if (count > 0) {
                            const existing = await collection.get({ limit: count });
                            await collection.delete({ ids: existing.ids });
                        }
                    } catch (e) { }

                    // 3. Index all tools
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
                    return toolError("refresh_tool_index", err);
                }
            }
        );

        server.tool(
            "call_tool",
            "Execute a specific MCP tool by name. Use discover_tools first to find the right tool name, then call it here. This works for all tools including Jira, Confluence, and other integrations.",
            {
                tool_name: z.string().describe("The exact tool name to call (e.g., 'atlassian__search_jira_issues')"),
                input: z.record(z.unknown()).optional().default({}).describe("JSON input parameters for the tool"),
            },
            async ({ tool_name, input }) => {
                try {
                    // Always use mcpjungle invoke to maintain consistent orchestration
                    const inputJson = JSON.stringify(input ?? {});
                    const { stdout, stderr } = await execFileAsync(
                        "mcpjungle",
                        ["invoke", tool_name, "--input", inputJson, "--registry", "http://127.0.0.1:8080"],
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
}

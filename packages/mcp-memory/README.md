# @agenticflow/mcp-memory

A standalone MCP server providing semantic search and generic file operations over a directory of Markdown notes. This acts as a read/write memory component for AI agents via Model Context Protocol.

## Features
- **Semantic Search**: Powered by ChromaDB using local CPU, Ollama, or OpenAI embeddings.
- **File Management**: Read, create, update, and append to markdown files natively.
- **Auto-Indexing**: Automatically watches and semantic-indexes new/changed files in the background.

## Obsidian Integrations (Optional)
This package includes explicit logic to support an Obsidian vault safely:
- Parses Obsidian-specific frontmatter while preserving unquoted `[[Wiki Links]]`.%%This feature was removed in favor of a more generic approach that supports both Obsidian and standard markdown files.%% 
- AI attribution (configurable injected callouts like `> [!ai] Gemini`).
- Injects `contributors` automatically into frontmatter.

To enable these Obsidian features, set `AI_ATTRIBUTION_ENABLED=true` in your `.env`. Otherwise, it operates as a standard, clean markdown file server.

## Installation
Currently part of the agenticflow monorepo.

```bash
npm install
npm run build
npm start
```

## Environment Variables
- `VAULT_PATH`: Absolute path to markdown directory (default: `/vault`)
- `AI_ATTRIBUTION_ENABLED`: `true` or `false`
- `EMBEDDING_PROVIDER`: `local` | `ollama` | `openai`
- `CHROMA_HOST` / `CHROMA_PORT`: ChromaDB connection.

# @agenticflow/mcp-memory

A standalone MCP server providing semantic search and generic file operations over a directory of Markdown notes. This acts as a read/write memory component for AI agents via Model Context Protocol.

## Features
- **Semantic Search**: Powered by ChromaDB using local CPU, Ollama, or OpenAI embeddings.
- **File Management**: Read, create, update, and append to markdown files natively.
- **Auto-Indexing**: Automatically watches and semantic-indexes new/changed files in the background.

## AI Attribution (Optional)
This package includes explicit logic to attribute AI generated content:
- Injects `contributors` automatically into frontmatter for universally compatible attribution.
- Automatically detects Obsidian vaults (via the presence of an `.obsidian` folder) and wraps AI-generated content in configurable callouts like `> [!ai] Gemini`.
- Parses frontmatter while preserving unquoted `[[Wiki Links]]`.

To enable these attribution features, set `AI_ATTRIBUTION_ENABLED=true` in your `.env`. Otherwise, it operates as a standard, clean markdown file server.

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

# agenticflow

> Self-hosted, plug-and-play MCP gateway for agentic productivity. One endpoint to connect all your tools (Jira, Confluence, Microsoft 365, Obsidian, and more) to any AI assistant.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://www.docker.com/)

## What is this?

`agenticflow` gives AI agents a single, intelligent MCP endpoint that routes to all your productivity tools. It adds:

- **Unified gateway** via [MCPJungle](https://github.com/mcpjungle/MCPJungle) — one config in Claude/Cursor, access everything
- **Obsidian memory** — semantic search and time-based retrieval over your personal knowledge vault
- **Skill/tool discovery** — agents find the right tool by describing intent, not by knowing tool names
- **Plug-and-play** — add new services without reconfiguring your AI client

## Architecture

```
AI Client (Claude / Cursor / Custom)
          │
          ▼  single MCP endpoint
   MCPJungle Gateway :18080
          │
   ┌──────┼──────────┬──────────┐
   ▼      ▼          ▼          ▼
[Memory] [Jira]  [Confluence] [Discovery]
 Obsidian Work    Docs        Semantic
 Notes    Items   Search      Tool RAG
```

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js (v18+) and npm
- An Obsidian vault (any structure)

### 1. Install the CLI

```bash
git clone https://github.com/YOUR_USERNAME/agenticflow.git
cd agenticflow/cli
npm install
npm link
```

### 2. Setup & Start

Run the guided setup wizard to configure your environment, master password, and any external integrations (like Jira/Confluence):

```bash
cd ..  # back to the repo root
agenticflow setup
```

The wizard will:
1. Configure your `.env` and Obsidian vault path.
2. Store your Master Password securely.
3. Automatically build and start the Docker containers.
4. Let you index your vault for the first time.

*(If you ever need to stop or start the cluster manually, just run `agenticflow up` or `agenticflow down`)*

### 3. Connect your AI client

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agenticflow": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:18080/mcp"]
    }
  }
}
```

That's it. All your tools are now available.

## Services

| Service | Status |
|---|---|
| Obsidian Memory (semantic + temporal) | 🔧 In development |
| Jira | ✅ Via Atlassian MCP |
| Confluence | ✅ Via Atlassian MCP |
| SharePoint / Microsoft 365 | 🔧 In development |
| Filesystem | ✅ Bundled |
| n8n | ✅ Via n8n-mcp |
| Miro | 📋 Planned |
| MS Fabric | 📋 Planned |

## Vault Compatibility

Works with **any Obsidian vault layout**. The memory server indexes by content, not structure. See [docs/obsidian-setup.md](docs/obsidian-setup.md) for the recommended setup if you're starting fresh.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The project is structured so you only need to configure `config/config.yaml` — nothing personal ever lands in the repo.

## License

MIT

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
- An Obsidian vault (any structure)
- API keys for the services you want to connect

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/agenticflow.git
cd agenticflow
cp config/config.example.yaml config/config.yaml
cp config/servers.example.yaml config/servers.yaml
```

Edit `config/config.yaml` with your vault path and API keys.

### 2. Start the stack

```bash
docker compose up -d
```

Gateway is live at `http://localhost:18080/mcp`

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

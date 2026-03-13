# agenticflow

> Self-hosted, plug-and-play MCP gateway for agentic productivity. One endpoint to connect all your tools (Jira, Confluence, Microsoft 365, Obsidian, and more) to any AI assistant.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![License Check](https://github.com/thomasvanwijk/agenticflow/actions/workflows/license-check.yml/badge.svg)](https://github.com/thomasvanwijk/agenticflow/actions/workflows/license-check.yml)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://www.docker.com/)

## What is this?

`agenticflow` gives AI agents a single, intelligent MCP endpoint that routes to all your productivity tools. It adds:

- **Unified gateway** via [MCPJungle](https://github.com/mcpjungle/MCPJungle) — one config in Claude/Cursor, access everything
- **Markdown & Obsidian memory** — semantic search and time-based retrieval over your personal knowledge vault or Markdown folders
- **Skill/tool discovery** — agents find the right tool by describing intent, not by knowing tool names
- **Plug-and-play** — add new services without reconfiguring your AI client
- **Model Compatibility** — [Insights on how different LLMs (Claude, GPT, Gemini, Sonar) behave with agenticflow tools](docs/MODEL_COMPATIBILITY.md)

See [docs/ROADMAP.md](docs/ROADMAP.md) for current development priorities and vision.

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
- An Obsidian vault or any Markdown folder (any structure)

### 1. Install & Setup

Run the installation script from the repository root. This will automatically build the CLI and launch the guided setup wizard to configure your environment, master password, and any external integrations (like Jira/Confluence):

```bash
git clone https://github.com/YOUR_USERNAME/agenticflow.git
cd agenticflow
./setup.sh
```

> **Note**: If your terminal says `agenticflow: command not found` after setup completes, your system's `PATH` is likely missing the global npm bin directory (very common on Linux servers). Run this to fix it permanently:
> ```bash
> export PATH="$(npm config get prefix)/bin:$PATH"
> echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
> ```

The wizard will:
1. Configure your `.env` and Obsidian vault path.
2. Store your Master Password securely.
3. Automatically build and start the Docker containers.
4. Let you index your vault for the first time.

*(If you ever need to stop or start the cluster manually, just run `agenticflow up` or `agenticflow down`)*

### 3. Connect your AI client

> **⚠️ Important: Direct SSE is currently not supported.** Due to proxy routing complexities, AI clients that attempt to connect directly via SSE (e.g., native Gemini CLI) may fail to resolve the return endpoints correctly. You **must** use an `mcp-remote` bridge (or similar STDIO-to-SSE adapter) to connect.

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agenticflow": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-remote", "http://localhost:18080/mcp"]
    }
  }
}
```

**Cursor**:
1. Go to Settings > MCP
2. Add new server
3. Type: `command`
4. Command: `npx`
5. Args: `-y @modelcontextprotocol/server-remote http://localhost:18080/mcp`

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

## Troubleshooting

### High CPU Usage on Low-End Devices
If you are running agenticflow on a device with limited CPU cores (e.g. 2 cores) and notice 100% CPU usage during start or when indexing, you can enable `AGENTICFLOW_LOW_RESOURCE_MODE=true` in your `.env` file. This limits the local embedding models to a single thread, preventing the container from starving the host OS.

## Vault Compatibility

Works with **any Markdown folder** or **Obsidian vault layout**. The memory server indexes by content, not structure. It automatically detects Obsidian vaults to enable specific features like `> [!ai]` callouts. See [docs/obsidian-setup.md](docs/obsidian-setup.md) for the recommended setup if you're starting fresh.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The project is structured so you only need to configure your `.env` and `servers.d/` configuration files — nothing personal ever lands in the repo.

## License

MIT

# agenticflow - Project Overview

`agenticflow` is a self-hosted, plug-and-play Model Context Protocol (MCP) gateway designed for agentic productivity. It provides a single unified endpoint to connect various productivity tools (Jira, Confluence, Microsoft 365, Obsidian, etc.) to any AI assistant (like Claude or Cursor).

## Core Architecture

The system is composed of several interconnected services orchestrated via Docker Compose:

1.  **Auth Proxy (Caddy):** Handles authentication and exposes the unified MCP endpoint (default port 18080).
2.  **MCPJungle Gateway:** The core routing engine that manages MCP server registration, tool discovery, and request dispatching.
3.  **Obsidian Memory (agenticflow-memory-mcp):** A specialized MCP server providing semantic search and temporal retrieval over an Obsidian vault using ChromaDB.
4.  **Vector Database (Chroma):** Stores embeddings for the Obsidian memory service.
5.  **Relational Database (Postgres):** Provides persistence for the MCPJungle gateway.

## Key Components

### 1. CLI (`/cli`)
A TypeScript-based command-line interface for managing the `agenticflow` lifecycle.
- **Build:** `npm run build` (uses `tsc`)
- **Run:** `agenticflow up` / `agenticflow down` (wraps Docker Compose)
- **Secrets:** `agenticflow secrets` (handles encrypted secret injection)

### 2. Obsidian Memory MCP (`/agenticflow-memory-mcp`)
An MCP server that indexes Obsidian notes into ChromaDB.
- **Technologies:** Node.js, ChromaDB, HuggingFace Transformers (local embeddings).
- **Functionality:** Semantic search, time-based retrieval, and note management.

### 3. Gateway (`/gateway`)
Builds a custom runtime environment combining:
- `MCPJungle` (Golang)
- `agenticflow-memory-mcp` (Node.js)
- `agenticflow-cli` (Node.js)
- Pre-installed/patched MCP servers (e.g., `mcp-atlassian`)

## Building and Running

The project is primarily managed through the provided `setup.sh` and the built-in CLI.

### Initial Setup
```bash
./setup.sh
```
This script builds the CLI and launches a guided setup wizard.

### Key Commands (via CLI)
- **Start Services:** `agenticflow up`
- **Stop Services:** `agenticflow down`
- **Rebuild Services:** `agenticflow build`
- **Check Status:** `agenticflow status`
- **Re-index Vault:** `agenticflow index`

### Manual Development Build
If you are working on individual components:
- **CLI:** `cd cli && npm install && npm run build`
- **Memory MCP:** `cd agenticflow-memory-mcp && npm install && npm run build`

## Configuration

Configuration is managed via files in the `/config` directory:
- `config.yaml`: Main gateway configuration.
- `servers.json`: Definitions for individual MCP servers (Jira, Confluence, etc.).
- `secrets.enc`: Encrypted secrets (managed by the CLI).

## Development Conventions

- **Language:** TypeScript/Node.js for CLI and Memory MCP; Go for the core gateway (MCPJungle).
- **Containerization:** All services are containerized. Changes to the gateway environment require a `docker-compose build`.
- **Secret Management:** Never commit raw secrets. Use the `agenticflow secrets` command to manage the `secrets.enc` file.
- **Testing:**
  - `agenticflow-memory-mcp` has several test scripts (`test-embed.mjs`, `test-file-tools.mjs`, etc.).
  - A `scaling_test_vault` is provided for testing memory performance with large vaults.

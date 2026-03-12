# @agenticflow/mcp-sync-controller

This service manages the lifecycle of MCP servers within the Agenticflow ecosystem. It coordinates between local configuration files, encrypted secrets, and the `MCPJungle` registry.

## Features
- **Dynamic Sync**: Watches a directory for `.json` configuration files and automatically registers/deregisters them with the MCPJungle gateway.
- **Secret Hot-Reload**: Watches `secrets.enc` and re-injects credentials into running MCP servers without requiring a full system restart.
- **Exposure Management**: Enforces which tools are directly visible to the client and which are hidden but semantically discoverable.
- **Semantic Discovery**: Maintains a vector index of all available tools across all registered MCP servers.

## Tools
- `discover_tools`: Semantic search for finding the right tool for a task.
- `refresh_tool_index`: Manually trigger a full re-index of available tools.
- `call_tool`: A meta-tool that routes execution requests to any registered MCP server.

## Installation
```bash
npm install
npm run build
npm start
```

## Environment Variables
- `REGISTRY`: URL of the MCPJungle registry (default: `http://127.0.0.1:8080`)
- `SERVERS_DIR`: Path to MCP server JSON configs.
- `SECRETS_FILE`: Path to the encrypted secrets file.
- `CHROMA_HOST` / `CHROMA_PORT`: Connection to the vector database.

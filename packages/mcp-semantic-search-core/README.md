# @agenticflow/mcp-semantic-search-core

Core logic wrapping ChromaDB and exposing an interface to manage separated collections (`mcp_tools`, `mcp_memory`, etc.).

Includes an embedded REST API for managing these collections externally. Re-exports the `@agenticflow/mcp-embedding-providers` module for convenience.

## REST API endpoints exposed:
- `GET /api/collections`
- `GET /api/collections/:name`
- `DELETE /api/collections/:name`
- `POST /api/collections/:name/clear`

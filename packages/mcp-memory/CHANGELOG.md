# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - Initial Extraction
### Added
- Extracted memory functionality from the monolithic `agenticflow-memory-mcp` service.
- Added support for running purely as a generic Markdown file server, while keeping Obsidian integrations behind the `AI_ATTRIBUTION_ENABLED` flag.
- Generalized AI attribution: `> [!ai]` callouts are now only injected if an `.obsidian` folder is detected in the `VAULT_PATH`.
- Universal frontmatter attribution: `contributors` tracking is now universally applied to all Markdown vaults when `AI_ATTRIBUTION_ENABLED=true`.
- Integrated with decoupled `@agenticflow/mcp-semantic-search-core` and `@agenticflow/mcp-embedding-providers`.

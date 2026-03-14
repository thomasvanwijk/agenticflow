# Development Guide

This document outlines best practices for developing and testing AgenticFlow locally, specifically focusing on isolated environments to prevent port and naming conflicts.

## Isolated Worktree Environments

When developing features or testing infrastructure changes, spinning up a new docker-compose stack can conflict with your primary instance if ports or container names collide. 

To solve this, we support dynamic configuration based on your git worktree (or branch) name.

### Setup

1. **Create a worktree:**
   ```bash
   git worktree add ../agenticflow-feature
   cd ../agenticflow-feature
   ```

2. **Bootstrap the environment:**
   We provide a script that generates a `.env.local` file with unique port assignments based on the environment name.
   ```bash
   ./bootstrap-env.sh
   ```
   This will assign unique `PROXY_PORT`, `POSTGRES_PORT`, and `CHROMA_PORT` values based on a hash of the directory name (e.g. `agenticflow-feature`).

3. **Start the stack:**
   The `docker-compose.yaml` is designed to auto-namespace container names using `${PROJECT_NAME}` and `${ENV_NAME}`.
   ```bash
   docker compose up -d
   ```

## CLI Development & Testing

### Running the Local CLI
When developing new CLI commands or testing unreleased functionality within your isolated environment, **do not** use the globally installed `agenticflow` command. 

Instead, run the local version directly from the `cli/` directory:
```bash
cd cli/
npm install
npm run build
npm run cli -- <command>
```
For example: `npm run cli -- mcp list`

### Targeting Environments
The global CLI supports `--env` and `--workspace` flags to explicitly dictate which environment it operates against. This is more transparent than magically detecting the current directory context.

```bash
# Load context from .env.feature and use that environment's docker compose config
agenticflow --env feature mcp list

# Explicitly set the base path for resolving configurations and docker-compose.yaml
agenticflow --workspace /path/to/agenticflow-feature mcp list
```

## Renaming the Project
The application is designed to be easily renamed. Most core services and the CLI rely on the `PROJECT_NAME` environment variable (which defaults to `agenticflow`). To rename the stack, update `PROJECT_NAME` in your `.env` or `.env.local`.

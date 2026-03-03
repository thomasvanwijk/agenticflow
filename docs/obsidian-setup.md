# Obsidian Vault Setup

The `agenticflow` memory server works with **any Obsidian vault layout**. You don't need to restructure your vault.

## Minimum setup

Just point `config.yaml` to your vault:

```yaml
memory:
  vault_path: "/Users/you/Documents/Obsidian/YourVault"
```

The server will scan, index, and watch for changes automatically.

## Recommended setup (optional)

If you're starting fresh or want to optimize for agent retrieval, this structure works well for both daily human use and agentic queries:

```
YourVault/
  00_INBOX/        # Quick capture — no friction, dump anything here
  10_INTENTS/      # Active missions (agent-readable, use frontmatter)
  20_PROJECTS/     # Long-running work, specs, decisions
  30_MEMORIES/     # Atomic/evergreen notes — your knowledge base
  40_LOGS/         # Auto-generated logs (agent writes here)
  50_ARCHIVE/      # Completed work — not deleted, just quieter
  Templates/       # Obsidian templates
```

## Recommended frontmatter

Adding this to important notes significantly improves semantic retrieval quality:

```yaml
---
type: memory       # memory | intent | project | log
tags: [example]
created: 2026-03-03
status: active     # active | archived | draft
---
```

This is optional — the semantic index works on plain notes too.

## Daily log naming

The memory server's `append_log` tool writes to `40_LOGS/YYYY-MM-DD.md` by default. This powers `recent_context` queries like "what did I work on yesterday?".

## Tips for agents

- Notes in `10_INTENTS/` should have a clear title and short summary in the first paragraph — this anchors semantic search.
- Keep `00_INBOX/` notes brief. Process them into `30_MEMORIES/` or `20_PROJECTS/` periodically.
- `40_LOGS/` is written by agents — don't manually edit these.

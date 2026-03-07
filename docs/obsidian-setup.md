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

## AI Attribution (Authorship)

AgenticFlow can automatically attribute AI-generated content in your vault using Obsidian callouts. This makes it easy to distinguish what you wrote from what the AI wrote.

### 1. Enable the Feature
Add these environment variables to your `.env` file or container configuration:
- `AI_ATTRIBUTION_ENABLED=true`
- `AI_ATTRIBUTION_CALLOUT_TYPE=ai` (optional, default: `ai`)
- `AI_ATTRIBUTION_INCLUDE_MODEL=true` (optional, default: `true`)
- `AI_ATTRIBUTION_INCLUDE_DATE=true` (optional, default: `true`)

### 2. Install CSS Snippet
To make the AI-attributed content look subtle and professional, add this CSS to your Obsidian vault at `.obsidian/snippets/ai-attribution.css` and enable it in **Settings → Appearance → CSS snippets**:

```css
/* AI callout - subtle tint, clearly marked but not intrusive */
.callout[data-callout="ai"] {
    --callout-color: 139, 92, 246;
    background-color: rgba(139, 92, 246, 0.04);
    border-left: 3px solid rgba(139, 92, 246, 0.35);
    border-radius: 0 4px 4px 0;
}

.callout[data-callout="ai"] .callout-title {
    font-size: 0.72em;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.5;
    padding-bottom: 4px;
}

.callout[data-callout="ai"] .callout-icon {
    display: none;
}

.callout[data-callout="ai"] .callout-content {
    padding-top: 2px;
    margin-left: 0;
}

.theme-dark .callout[data-callout="ai"] {
    background-color: rgba(139, 92, 246, 0.07);
}
```

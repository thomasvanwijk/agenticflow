---
name: obsidian-memory
description: How to read, write, and search Obsidian notes as agent memory
type: skill
tags: [obsidian, memory, knowledge, notes]
---

## Overview
Use this skill when you need to access or update the user's personal knowledge vault.

## Available Tools
- **agenticflow__semantic_search**: Find notes by meaning/intent
- **agenticflow__recent_context**: Get notes from last N hours
- **agenticflow__get_note**: Read a specific note by path
- **agenticflow__append_log**: Write to today's daily log

## Common Workflows

### Before starting a task
1. Call `agenticflow__semantic_search` with the task topic to load relevant context
2. Call `agenticflow__recent_context(hours=48)` to check for recent work on this topic

### After completing a task
1. Call `agenticflow__append_log` to record what was done and any key decisions

## AI Attribution (Authorship)
When the `ai_attribution` feature is enabled in AgenticFlow, any content you write to the vault will be automatically wrapped in an `[!ai]` callout and your identity will be added to the note's `contributors` frontmatter.

- **`ai_model` parameter**: Always provide your identity (e.g., "Gemini 2.0 Pro") when calling `create_note`, `update_note`, or `append_to_note`.
- **Prose Only**: Focus on providing clear prose. The system handles the callout wrapping and frontmatter updates for you.
- **Maintain formatting**: If you are providing code blocks or Mermaid diagrams, use strict triple backticks. The system will ensure they render correctly inside the attribution callout.

---
name: obsidian-memory
description: How to read, write, and search Obsidian notes as agent memory
type: skill
tags: [obsidian, memory, knowledge, notes]
---

## Overview
Use this skill when you need to access or update the user's personal knowledge vault.

## Available Tools
- **memory__semantic_search**: Find notes by meaning/intent
- **memory__recent_context**: Get notes from last N hours
- **memory__get_note**: Read a specific note by path
- **memory__append_log**: Write to today's daily log

## Common Workflows

### Before starting a task
1. Call `memory__semantic_search` with the task topic to load relevant context
2. Call `memory__recent_context(hours=48)` to check for recent work on this topic

### After completing a task
1. Call `memory__append_log` to record what was done and any key decisions

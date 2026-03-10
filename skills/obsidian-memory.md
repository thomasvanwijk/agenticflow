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

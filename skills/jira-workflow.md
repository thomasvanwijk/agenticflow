---
name: jira-workflow
description: How to create, update, and query Jira issues
type: skill
tags: [jira, project-management, work]
---

## Overview
Use this skill when you need to work with Jira: creating tickets, updating status, searching issues, or managing sprints.

## Available Tools
- **jira_create_issue**: Create a new ticket
- **jira_update_issue**: Update fields on an existing ticket
- **jira_search_issues**: Search with JQL
- **jira_get_issue**: Get details of a specific issue
- **jira_list_projects**: List all accessible projects

## Common Workflows

### Create a task from a Confluence requirement
1. Read the requirement from Confluence using `confluence_get_page`
2. Extract the acceptance criteria
3. Create a Jira story with `jira_create_issue`

### Daily standup context
Use `jira_search_issues` with JQL: `assignee = currentUser() AND status != Done ORDER BY updated DESC`

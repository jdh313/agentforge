---
name: restricted-reader
description: Reads the vault under a plan-mode, write-denied restriction.
model: sonnet
maxTurns: 6
effort: medium
tools:
  - Read
  - Grep
disallowedTools:
  - Write
  - Edit
permissionMode: plan
isolation: worktree
memory: project
background: false
omitClaudeMd: true
skills:
  - vault-conventions
initialPrompt: Summarize the vault index before waiting for instructions.
color: cyan
mcpServers:
  - obsidian-mcp
hooks:
  PreToolUse:
    - matcher: Write
experimental:
  cacheTtl: 1h
---

# Restricted reader

Read the requested notes and return a cited summary. Never write.

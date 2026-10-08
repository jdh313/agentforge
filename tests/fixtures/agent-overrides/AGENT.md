---
name: canonical-reader
description: Read canonical material.
model: sonnet
maxTurns: 8
tools: Read
targets:
  pi:
    model: anthropic/claude-sonnet-4-5
    tools: [read, grep]
    effort: low
    body: |
      # Pi reader

      Use Pi's native agent context.
  claude:
    name: claude-reader
    model: haiku
    body: |
      # Claude reader

      Use Claude's native agent context.
---

# Canonical reader

Use the shared agent context.

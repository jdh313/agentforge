---
name: canonical-reader
description: Read canonical material.
model: sonnet
maxTurns: 8
tools: Read
targets:
  claude:
    name: claude-reader
    model: haiku
    body: |
      # Claude reader

      Use Claude's native agent context.
---

# Canonical reader

Use the shared agent context.

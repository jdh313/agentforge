---
name: vault-reader
description: Read and summarize the knowledge vault.
model: sonnet
maxTurns: 10
effort: high
tools:
  - Read
  - Grep
targets:
  pi:
    tools:
      - read
      - grep
---

# Vault reader

Inspect the requested notes and return a concise, cited summary.

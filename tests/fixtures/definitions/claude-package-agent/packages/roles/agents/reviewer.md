---
name: reviewer
description: Review a change without editing it.
model: sonnet
upstream:
  repo: example/agents
  reviewed_sha: 0123456789ab
not-a-claude-key: true
targets:
  claude:
    model: haiku
    body: |
      # Reviewer

      Claude-specific review procedure.
---

# Reviewer

Canonical review procedure.

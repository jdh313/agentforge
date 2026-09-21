---
name: hooked-agent
description: Exercises an agent-scoped hook projection.
hooks:
  Stop:
    - hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/agent-cleanup.sh"
---

# Hooked agent

Run the delegated workflow.

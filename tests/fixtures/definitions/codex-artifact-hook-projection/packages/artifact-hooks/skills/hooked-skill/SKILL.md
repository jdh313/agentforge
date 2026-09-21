---
name: hooked-skill
description: Exercises a skill-scoped hook projection.
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/skill-guard.sh"
          once: true
---

# Hooked skill

Run the guarded workflow.

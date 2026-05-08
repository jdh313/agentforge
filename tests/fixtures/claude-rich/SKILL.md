---
name: claude-rich
description: Test fixture exercising Claude-only frontmatter and $ARGUMENTS body substitution.
allowed-tools: Bash(git *) Read
disable-model-invocation: true
argument-hint: "[issue-number]"
---

Fix GitHub issue $ARGUMENTS following the project's coding standards.

1. Read the issue description.
2. Implement the fix.
3. Add tests.

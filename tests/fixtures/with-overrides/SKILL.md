---
name: with-overrides
description: Test fixture for per-target body and field overrides.
allowed-tools: Bash(git *)
disable-model-invocation: true
targets:
  opencode:
    body: |
      Pass the issue number as the first argument when invoking this skill,
      then summarize and fix it.
  codex:
    description: With-overrides skill (Codex variant — Codex-tailored description).
    body: |
      For Codex: pass the issue number explicitly, then fix and test.
---

Fix issue $ARGUMENTS following the project's coding standards.

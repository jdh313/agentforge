# agentforge

Render canonical AI agent artifacts for multiple harnesses.

Takes a single canonical source (e.g. a `SKILL.md`) and emits harness-specific
outputs for Claude Code, OpenCode, and Codex — each with the right path,
frontmatter shape, and optional per-target body overrides.

## Status

M1 spike: skills only, synthetic fixtures, snapshot-tested.

## Quick start

```sh
bun install
bun test

bun run src/cli.ts list-targets
bun run src/cli.ts render tests/fixtures/claude-rich --all-targets --out-base /tmp/agentforge-spike
bun run src/cli.ts validate tests/fixtures/claude-rich
```

## CLI

```
agentforge render <skill-source-dir> --target <name> --out <out-dir>
agentforge render <skill-source-dir> --all-targets --out-base <out-base>
agentforge validate <skill-source-dir>
agentforge list-targets
```

## Targets

| Target | Output base dir |
|---|---|
| `claude` | `~/.claude/skills` |
| `opencode` | `~/.config/opencode/skills` |
| `codex` | `~/.agents/skills` |

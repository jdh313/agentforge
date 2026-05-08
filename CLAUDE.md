# agentforge — Repo Instructions

TypeScript/Bun CLI that renders one canonical AI agent artifact (currently
`SKILL.md`) into per-harness outputs for Claude Code, OpenCode, and Codex.
Defers to user-level CLAUDE.md for shell, OS, and global preferences; only
narrows or extends here.

## Status

- **M1 spike** complete — skills only, synthetic fixtures, snapshot-tested.
- Real-corpus migration, `agents` kind, `mcp` kind, watch mode, Nix
  integration, and GitHub publishing are M2+.
- Full milestone plan: `~/.claude/plans/stateful-meandering-hamming.md`.

## Stack

- **Runtime/test:** Bun 1.3+ (`bun test`, `bun run src/cli.ts …`).
- **CLI:** commander 14.
- **Frontmatter:** gray-matter 4 (`matter()`, `matter.stringify()`).
- **Validation:** zod 4 — `.passthrough()` is deprecated; use
  `z.looseObject({…})` for open shapes.
- **Lint/format:** biome 2.4 (schema URL pinned in `biome.json` — bump on
  upgrade).
- **VCS:** jj-colocated (`.jj/` + `.git/`). SSH commit signing via 1Password.
  Even `jj status` fails with `SSH sign failed … 1Password: failed to fill
  whole buffer` when 1Password is locked — unlock before any jj op.

## Architecture

```
src/
  types.ts          — TargetName, TARGET_NAMES, RenderResult, Warning
  schema.ts         — CanonicalFrontmatter (zod), CLAUDE_ONLY_KEYS,
                      COMMON_KEYS, ALL_CLAUDE_KEYS
  deep-merge.ts     — small typed deep-merge (no lodash)
  render.ts         — pipeline: parse → validate → merge → filter →
                      emit → copy resources → warnings
  cli.ts            — commander entry: render, validate, list-targets
  targets/
    index.ts        — TargetAdapter interface + REGISTRY + getTarget/allTargets
    claude.ts       — full Claude key set, ~/.claude/skills
    opencode.ts     — common subset, ~/.config/opencode/skills
    codex.ts        — common subset, ~/.agents/skills
tests/
  fixtures/         — 4 synthetic skills (claude-rich, with-overrides,
                      with-resources, common-subset)
  __snapshots__/    — bun test snapshots (committed; regen with
                      `bun test --update-snapshots`)
  render.test.ts    — fixture × target matrix (4 × 3 = 12 cases)
```

## Render contract (don't break without good reason)

- Canonical `SKILL.md` is Claude-rich. Frontmatter is a superset of all
  targets' schemas plus an optional `targets:` block keyed by target name.
- Per target: deep-merge `targets.<name>` over top-level frontmatter
  (excluding `body`), filter to `adapter.allowedFrontmatterKeys`, validate
  with `adapter.outputFrontmatterSchema`.
- Body precedence: `targets.<name>.body` (full replacement) ⟶ canonical body.
  No partial templating, no prefix/suffix stitching.
- Resource subdirs (`scripts/`, `references/`, `assets/`) copy passthrough
  when present.
- Warnings (non-Claude targets only):
  - `claude-only-frontmatter-stripped` — listed Claude-only keys lost in
    output.
  - `claude-only-body-feature` — canonical body uses `$ARGUMENTS`,
    `${CLAUDE_*}`, `` !`…` ``, ` ```! `, or `$N`, and no `targets.<name>.body`
    override is set.

## Common commands

```sh
bun install
bun test                          # 12 cases, 36 snapshots
bun test --update-snapshots       # after intentional output changes
bunx biome check .                # lint + format check
bunx biome check . --write        # auto-fix (re-run tests after)
bunx tsc --noEmit                 # typecheck only

bun run src/cli.ts list-targets
bun run src/cli.ts render <skill-dir> --target <name> --out <dir>
bun run src/cli.ts render <skill-dir> --all-targets --out-base <dir>
bun run src/cli.ts validate <skill-dir>
```

## Adding a new target

1. Create `src/targets/<name>.ts` exporting a `TargetAdapter` (`outputBaseDir`,
   `allowedFrontmatterKeys`, `resourceSubdirs`, `outputFrontmatterSchema`).
2. Add the literal to `TargetName` and `TARGET_NAMES` in `src/types.ts`.
3. Register in `REGISTRY` in `src/targets/index.ts`.
4. Extend `render.test.ts` automatically picks up the new target via
   `TARGET_NAMES`; re-run with `bun test --update-snapshots` and review the
   diff before committing.

## Adding a new kind (e.g., agents, mcp)

Current code is skill-shaped (one `SKILL.md` per directory, `targets:` keyed
by harness). New kinds will likely require:

- A per-kind canonical schema (alongside `schema.ts`).
- Per-kind target adapters (allowed keys, output paths, output schemas
  diverge by harness for non-skill artifacts — especially MCP).
- A kind dispatcher in `render.ts` and a `--kind` flag (or kind inferred
  from source-dir layout).

Plan to refactor `TargetAdapter` to be kind-aware before M5 lands.

## Lint exceptions

- `src/render.ts` disables `lint/suspicious/noTemplateCurlyInString` for the
  `CLAUDE_ONLY_BODY_PATTERNS` table — the labels are intentional documentation
  literals (`'${CLAUDE_SKILL_DIR}'` etc.), not template strings.

## Out of scope today

- Agents and MCP kinds (M5/M6).
- Watch mode.
- Compiled binary via `bun build --compile`.
- Multi-skill source directory rendering.
- Codex `agents/openai.yaml` emission.
- Translating Claude-only body features (`$ARGUMENTS`, dynamic shell
  injection) into target-native forms — current behavior is warn-only.
- Nix integration; the tool runs as a plain `bun run` invocation.

## VCS notes

- Default to `jj` for all commits in this repo. The user's
  `04-git-workflow.md` rules apply.
- No GitHub remote; deferred to a later milestone.

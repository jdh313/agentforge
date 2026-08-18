# agentforge — Repo Instructions

TypeScript/Bun CLI that renders canonical AI agent artifacts (`SKILL.md`,
`OUTPUT_STYLE.md`) into per-harness outputs for Claude Code, OpenCode, Codex,
and Claude chat. Defers to user-level CLAUDE.md for shell, OS, and global
preferences; only narrows or extends here.

## Terminology

- **Artifact** — the type/category of canonical thing being rendered:
  `skill`, `output-style` (today), `agent`, `mcp` (planned). Each artifact
  has a canonical filename (`SKILL.md`, `OUTPUT_STYLE.md`), a canonical
  schema, and a layout (`directory` for skills, `file` for output-styles).
- **Target** — the harness consuming the output: `claude`, `opencode`,
  `codex`, `claude-chat`. A target may support a subset of artifacts; e.g.,
  `output-style` only renders to `claude` because no other harness has the
  concept.

## Status

- **M1 spike** complete — skills only, synthetic fixtures, snapshot-tested.
- **output-style** artifact landed — only `claude` supports it (Codex has a
  fixed `personality` enum, not custom files; OpenCode has no analog).
- Marketplace compilation translates package-level Claude `agent` and
  `command` sources into direct Claude files and inferred Codex procedures or
  skills; commands and explicit-only skill projections receive skill-local
  `agents/openai.yaml` policy.
- Real-corpus migration, `agent` artifact, `mcp` artifact, watch mode, Nix
  integration, and GitHub publishing are M2+.
- Milestone planning is tracked outside this repo; the bullets above are the
  published status.

## Stack

- **Runtime/test:** Bun 1.3+ (`bun test`, `bun run src/cli.ts …`).
- **CLI:** commander 14.
- **Frontmatter:** gray-matter 4 (`matter()`, `matter.stringify()`).
- **Validation:** zod 4 — `.passthrough()` is deprecated; use
  `z.looseObject({…})` for open shapes.
- **Lint/format:** biome 2.4 (schema URL pinned in `biome.json` — bump on
  upgrade).
- **VCS:** jj-colocated Git repository (see § VCS notes).

## Architecture

```
src/
  types.ts          — TargetName, TARGET_NAMES, ArtifactType,
                      ARTIFACT_TYPES, RenderResult, Warning
  schema.ts         — CanonicalSkillFrontmatter,
                      CanonicalOutputStyleFrontmatter, ARTIFACT_DEFS
                      (filename + schema + layout per artifact),
                      CLAUDE_ONLY_KEYS, COMMON_KEYS, ALL_CLAUDE_KEYS,
                      OUTPUT_STYLE_KEYS
  capabilities.ts   — construct-shape families + the checked-in capability
                      table keyed by (target, surface); one doc citation per
                      row. `supportFor` returns supported/unsupported/unknown,
                      so an unlisted construct is reported, never passed.
  compatibility.ts  — the single construct detector: frontmatter tool filters
                      plus body shapes, over every artifact type and text
                      resource file. Returns occurrences carrying `path:line`.
  deep-merge.ts     — small typed deep-merge (no lodash)
  package-payload-plan.ts — per-target plan of which marketplace-package
                      files ship where, from `payloads` declarations
                      (source path, destination, executable bit, collision
                      handling)
  agent-command.ts  — canonical agent/command behavior parsers
  render.ts         — pipeline: parse → validate → merge → filter →
                      emit → copy resources (directory layout) → warnings
  report.ts         — builds the `compile --report` output (JSON/MD),
                      grouping compiler diagnostics by disposition (what
                      became of the thing) rather than severity
  cli.ts            — commander entry: render, validate, list-targets;
                      artifact inferred from canonical filename, or
                      passed via `--artifact`
  targets/
    index.ts        — TargetAdapter (name + artifacts map),
                      ArtifactConfig, getArtifactConfig,
                      REGISTRY/getTarget/allTargets
    claude.ts       — artifacts.skill (~/.claude/skills),
                      artifacts['output-style'] (~/.claude/output-styles)
    opencode.ts     — artifacts.skill (~/.config/opencode/skills)
    codex.ts        — artifacts.skill (~/.agents/skills)
    claude-chat.ts  — artifacts.skill (~/Downloads/claude-skills, zipped)
tests/
  fixtures/         — 4 skills + 2 output-styles
                      (output-style-basic, output-style-rich)
  __snapshots__/    — bun test snapshots (committed; regen with
                      `bun test --update-snapshots`)
  render.test.ts    — skill × target (4×4) + output-style × target
                      (2×4, 1 supported + 3 rejected per fixture) = 24 cases
```

## Render contract (don't break without good reason)

- Source directory contains exactly one canonical file (`SKILL.md` or
  `OUTPUT_STYLE.md`); the artifact is inferred from which is present, or
  forced with `--artifact`.
- Canonical frontmatter is the superset for that artifact's targets, plus
  an optional `targets:` block keyed by target name.
- Per (target, artifact): look up `adapter.artifacts[artifact]`. If missing,
  the render throws (`--all-targets` skips with a log line instead).
  Otherwise: deep-merge `targets.<name>` over top-level frontmatter
  (excluding `body`), filter to `allowedFrontmatterKeys`, validate with
  `outputFrontmatterSchema`.
- Three categories of frontmatter key, and they are not interchangeable:
  1. **Known Claude key** (schema-enumerated, in `CLAUDE_ONLY_KEYS`) — retained
     on Claude, stripped elsewhere under `claude-only-frontmatter-stripped`.
  2. **Unrecognized key** — canonical schemas are `z.looseObject`, so a key they
     do not enumerate survives parse instead of being discarded.
     `ArtifactConfig.unrecognizedFrontmatter` is `'retain'` on Claude and
     defaults to `'strip'` everywhere else, because emitting a key is a claim
     the target accepts it. Reported either way, as
     `unrecognized-frontmatter-key`.
  3. **Authoring-layer key** (`authoring-keys` in `PACKAGE.yaml`) — belongs to
     the source repo, addressed to no runtime. Stripped from **every** target
     including Claude, reported nowhere. See § Authoring keys.
- Body precedence: `targets.<name>.body` (full replacement) ⟶ canonical body.
  No partial templating, no prefix/suffix stitching.
- Layout per artifact: `directory` (skill) materializes
  `<outDir>/<canonicalFilename>` + resource subdirs; `file` (output-style)
  writes `<outDir>/<name>.md` directly, no resources.
- Resource subdirs (`scripts/`, `references/`, `assets/`) copy passthrough
  when present (directory layout only).
- Warnings (skill artifact, non-Claude targets only, except where noted):
  - `claude-only-frontmatter-stripped` — listed Claude-only keys lost in
    output.
  - `claude-only-body-feature` — canonical body carries a construct the
    capability table marks **unsupported** on this target (`$ARGUMENTS`,
    `${CLAUDE_*}`, `` !`…` ``, ` ```! `, `$N`), and no `targets.<name>.body`
    override is set.
  - `unclassified-body-construct` — canonical body carries a construct-shaped
    string the table does not classify (a bare `$UPPER` such as `$PATH`). Kept
    separate on purpose: an unrecognized shape is not a confirmed loss, and
    wording it as one would cry wolf on every mention of an env var.
  - `unrecognized-frontmatter-key` — **every** target, Claude included:
    canonical frontmatter carries a key the artifact's schema does not
    enumerate **and** no `authoring-keys` declaration covers. The detail says
    whether it was retained or dropped. Kept apart from
    `claude-only-frontmatter-stripped` for the same reason
    `unclassified-body-construct` is kept apart from `claude-only-body-feature`:
    that warning claims Claude owns the key and the target loses it, and an
    unrecognized key supports neither half.
  - A key covered by `authoring-keys` emits **nothing**. That is not an
    oversight: a declared strip is not a loss, and only a confirmed loss is
    worth recording (ndr:4nshwv).

## Common commands

```sh
bun install
bun test                          # 24 cases, 54 snapshots
bun test --update-snapshots       # after intentional output changes
bunx biome check .                # lint + format check
bunx biome check . --write        # auto-fix (re-run tests after)
bunx tsc --noEmit                 # typecheck only

bun run src/cli.ts list-targets
bun run src/cli.ts render <source-dir> --target <name> --out <dir>
bun run src/cli.ts render <source-dir> --all-targets --out-base <dir>
bun run src/cli.ts validate <source-dir>
# artifact inferred from SKILL.md / OUTPUT_STYLE.md presence;
# override with -a, --artifact <skill|output-style>
```

## Installing the CLI

`package.json` already declares a `bin` entry (`agentforge → src/cli.ts`)
and the script has `#!/usr/bin/env bun`, so two install paths work
out of the box:

**`bun link`** (recommended for dev — live symlink, edits picked up
immediately; still requires `bun` on `$PATH` at runtime):

```sh
bun link            # from the repo root
# ensure ~/.bun/bin is on $PATH; then:
agentforge list-targets
```

**`bun build --compile`** (standalone binary — no `bun` runtime
needed, but doesn't track edits — re-run after changes):

```sh
bun build --compile src/cli.ts --outfile ~/.local/bin/agentforge
```

## Adding a new target

1. Create `src/targets/<name>.ts` exporting a `TargetAdapter`. Each supported
   artifact goes under `artifacts.<artifact>` with its own `outputBaseDir`,
   `allowedFrontmatterKeys`, `resourceSubdirs`, `outputFrontmatterSchema`,
   and optional `bundle`.
2. Add the literal to `TargetName` and `TARGET_NAMES` in `src/types.ts`.
3. Register in `REGISTRY` in `src/targets/index.ts`.
4. `render.test.ts` automatically picks up the new target via
   `TARGET_NAMES`; re-run with `bun test --update-snapshots` and review the
   diff before committing. Unsupported (target, artifact) pairs assert a
   thrown error instead of producing a snapshot.

## Adding a new artifact (e.g., agent, mcp)

1. Add the literal to `ArtifactType` and `ARTIFACT_TYPES` in `src/types.ts`.
2. Add a canonical schema in `src/schema.ts` and register the
   `{canonicalFilename, canonicalSchema, layout}` entry in `ARTIFACT_DEFS`.
3. On each supporting target, add an entry under `artifacts.<artifact>`
   (allowed keys, output dir, output schema; resource subdirs only for
   `layout: 'directory'`).
4. Add fixtures `tests/fixtures/<artifact>-*/` containing the canonical
   file; the test matrix expands automatically.
5. The renderer branches on `layout`: `'file'` writes
   `<outDir>/<name>.md`; `'directory'` keeps the SKILL-style materialization
   with optional resources and zip bundling.

## Lint exceptions

- `src/capabilities.ts` disables `lint/suspicious/noTemplateCurlyInString`: its
  capability-table tokens (`'${CLAUDE_*}'`) are literal documentation of
  Claude-only patterns.
- `tests/translated-construct.test.ts` suppresses the same rule on two lines,
  for the same reason: the literal variable names are what the assertions are
  about.

## Document class

`PACKAGE.yaml` may declare `documents: [{class, pattern}]`, where `class` is
`reference` or `diagnostic`. Both mark a file whose Claude-only constructs are
documentation *about* Claude rather than instructions to a model — an API gotcha
reference, or a skill that probes a specific endpoint — so the file is exempt
from body scanning. This is deliberately **not** an `artifacts:` entry: document
class is orthogonal to artifact type, and overloading `artifacts` would emit a
spurious `unsupported-artifact-projection` for a file never meant to translate.

## Authoring keys

`PACKAGE.yaml` may declare `authoring-keys: [<frontmatter key>, …]` — a flat
list of frontmatter keys that belong to the **authoring layer of the source
repo** and are addressed to no runtime. A declared key is stripped from every
target's output, Claude included, and reported nowhere.

The motivating case is `upstream:`, which carries adaptation provenance
(`repo`, `path`, `reviewed_sha`, `status`) that a repo-local review workflow
reads *and rewrites in canonical source*. A copy of it in published output is
inert — refreshing a reviewed SHA into a published artifact means nothing.

Declared rather than inferred, on the `documents:` precedent: these are
repo-local conventions whose vocabulary the compiler has no business knowing,
and `skillsmith` will grow more of them. Guessing which unrecognized keys are
authoring-layer is exactly the intent-guessing a declaration exists to avoid.

Note the distinction this closes. Stripping `upstream:` was always the right
outcome; the defect was that nothing had **decided** it — the same silence that
destroyed `disallowed-tools`, where the outcome genuinely was wrong. The
declaration converts an accident into a decision. Opt-in: an undeclared
unrecognized key keeps the category-2 behavior above.

## Out of scope today

- Leaf-renderer `agent` artifacts and MCP artifacts (M5/M6).
- Watch mode.
- Compiled binary via `bun build --compile`.
- Multi-artifact source directory rendering (each source dir contains
  exactly one canonical file).
- Translating Claude-only body features (`$ARGUMENTS`, dynamic shell
  injection) into target-native forms — current behavior is warn-only.
- Nix integration; the tool runs as a plain `bun run` invocation.

## VCS notes

- The repo is jj-colocated: use `jj` commands for local history (a hook
  rejects bare `git`). The user's `git-workflow.md` rules apply.
- `origin` is `git@github.com:jdh313/agentforge.git`, tracked by `main`. The
  repo is public; push only when asked. CI (`.github/workflows/ci.yml`) runs
  tests, typecheck, and lint on push and pull requests.

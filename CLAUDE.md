# agentforge — Repo Instructions

TypeScript/Bun CLI that currently renders canonical `SKILL.md`, `AGENT.md`, and
`OUTPUT_STYLE.md` artifacts into per-harness outputs for Claude Code, OpenCode,
Codex, Pi, and Claude chat. Marketplace compilation additionally reads
package-level agent and command sources. Defers to user-level CLAUDE.md for
shell, OS, and global preferences; only narrows or extends here.

## Terminology

- **Artifact** — the type/category of canonical thing being rendered.
  `skill`, `agent`, and `output-style` are implemented by the leaf renderer;
  `agent` projects to Claude (Markdown) and Codex (native TOML), and `mcp`
  remains later work. Each implemented artifact has a canonical filename
  (`SKILL.md`, `AGENT.md`, `OUTPUT_STYLE.md`), a canonical schema, and a layout
  (`directory` for skills, `file` for agents and output-styles).
- **Target** — the harness consuming the output: `claude`, `opencode`,
  `codex`, `pi`, `claude-chat`. A target may support a subset of artifacts; e.g.,
  `output-style` only renders to `claude` because no other harness has the
  concept.

## Status

- The 0.5 roadmap slice unified target projection behind one target adapter.
- The 0.6 slice added scoped skill installation and Pi skill support.
- The 0.7 slice converged standalone rendering and installation on compilation
  plans and the staged materializer (`rsuzoxko`, commit `2cbcb8ff`). These
  roadmap labels describe implementation slices; released package versions are
  assigned separately by semantic-release.
- The 0.8 slice is underway: `agent` is a first-class leaf artifact with a
  shared canonical schema, projecting to Claude Markdown and native Codex
  agent-role TOML. Codex plugin packages cannot register agent roles as of
  codex-cli 0.154.0 (`docs/limitations.md` L-010), so marketplace agent
  translation keeps the Markdown-procedure fallback for Codex. Leaf agents
  install with planned-file ownership at Claude user and project scope, and at
  Codex **user scope only** — codex-cli 0.154.0 scans `$CODEX_HOME/agents` and
  never a repository's `.codex/agents`, so that scope is omitted and a
  `--scope project` agent install refuses (`docs/limitations.md` L-012).
  Remaining target projections stay gated on verified native semantics. See
  [docs/roadmap.md](docs/roadmap.md).
- Releases are automated (semantic-release + per-platform binaries; see
  § Releases).

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
  schema.ts         — CanonicalSkillFrontmatter, CanonicalAgentFrontmatter,
                      CanonicalOutputStyleFrontmatter, ARTIFACT_DEFS
                      (filename + schema + layout per artifact)
  frontmatter.ts    — checked-in key membership by artifact and target;
                      the single authority for retained output frontmatter
  capabilities.ts   — construct-shape families + the checked-in capability
                      table keyed by (target, surface); one doc citation per
                      row. `supportFor` returns supported/unsupported/unknown,
                      so an unlisted construct is reported, never passed.
  compatibility.ts  — the single construct detector: frontmatter tool filters
                      plus body shapes, over every artifact type and text
                      resource file. Returns occurrences carrying `path:line`.
                      One family, `agent-reference`, is matched against the
                      package's own declared agent names rather than a shape —
                      see § Collaborator references.
  deep-merge.ts     — small typed deep-merge (no lodash)
  target-adapter.ts — one target shape: artifact projections, normative scoped
                      install locations, plus optional marketplace compilation
  paths.ts          — `portableRelative` (POSIX-separated relative paths, for
                      values that ship inside documents) and `isContainedPath`
                      (strict containment test); shared by the materializer,
                      payload planning, and the root manifest
  root-manifest.ts  — the marketplace-root copy of a publication's registry,
                      with plugin sources rewritten to point into the compiled
                      output (see § Root manifest)
  package-payload-plan.ts — per-target plan of which marketplace-package
                      files ship where, from `payloads` declarations
                      (source path, destination, executable bit, collision
                      handling)
  agent-command.ts  — package-level agent/command behavior parsers; agents
                      consume the same canonical schema as leaf projection
  render.ts         — pure projection plus standalone render orchestration;
                      every destination write goes through the materializer
  artifact-plan.ts  — shared projection-to-plan builder used by render and
                      install, including modes, diagnostics, and provenance
  install.ts        — synthetic one-artifact install plans with resolved roots;
                      refuses a write that would collide with another
                      target's projection at a shared destination
  install-collision.ts — stateless detector for the above: compares on-disk
                      bytes against the installing target's own plan, then
                      (only on a mismatch) against every other target's
                      projection of the same source, via `targets/registry.ts`
  report.ts         — builds the `compile --report` output (JSON/MD),
                      grouping compiler diagnostics by disposition (what
                      became of the thing) rather than severity
  cli.ts            — commander entry: install, check-install, render, validate;
                      artifact inferred from canonical filename, or
                      passed via `--artifact`
  targets/
    registry.ts     — the only target enumeration and projection lookup
    index.ts        — assembles target-owned optional marketplace capabilities
    claude.ts       — artifacts.skill (~/.claude/skills), artifacts.agent
                      (~/.claude/agents, .claude/agents),
                      artifacts['output-style'] (~/.claude/output-styles)
    opencode.ts     — artifacts.skill (~/.config/opencode/skills)
    codex.ts        — artifacts.skill (~/.agents/skills), artifacts.agent
                      (native `.toml` via `nativeDocument`; ~/.codex/agents,
                      .codex/agents)
    pi.ts           — artifacts.skill (~/.pi/agent/skills, .pi/skills)
    claude-chat.ts  — artifacts.skill (~/Downloads/claude-skills, zipped)
tests/
  fixtures/         — 5 matrix skills + focused skill fixtures + 3 agents +
                      2 output-styles
  __snapshots__/    — bun test snapshots (committed; regen with
                      `bun test --update-snapshots`)
  render.test.ts    — skill × target (5×5), agent × target (2×5), and
                      output-style × target (2×5), plus focused projection and
                      materialization cases
```

## Render contract (don't break without good reason)

- Source directory contains exactly one canonical file (`SKILL.md`,
  `AGENT.md`, or `OUTPUT_STYLE.md`); the artifact is inferred from which is
  present, or forced with `--artifact`.
- Canonical frontmatter is the superset for that artifact's targets, plus
  an optional `targets:` block keyed by target name.
- Per (target, artifact): look up `adapter.artifacts[artifact]`. If missing,
  the render throws (`--all-targets` skips with a log line instead).
  Otherwise: deep-merge `targets.<name>` over top-level frontmatter
  (excluding `body`), filter through `frontmatter.ts`, validate with
  `outputFrontmatterSchema`.
- Three categories of frontmatter key, and they are not interchangeable:
  1. **Known key** — retained where its checked-in membership names the target,
     translated where the capability table names a native form, and otherwise
     stripped under `claude-only-frontmatter-stripped` (legacy diagnostic name).
  2. **Unrecognized key** — canonical schemas are `z.looseObject`, so a key they
     do not enumerate survives parse long enough to be reported. It is stripped
     on every target, Claude included, because emitting a key is a claim that
     the checked-in target table accepts it. Reported as
     `unrecognized-frontmatter-key`.
  3. **Authoring-layer key** (`authoring-keys` in `PACKAGE.yaml`) — belongs to
     the source repo, addressed to no runtime. Stripped from **every** target
     including Claude, reported nowhere. See § Authoring keys.
- Body precedence: `targets.<name>.body` (full replacement) ⟶ canonical body.
  No partial templating, no prefix/suffix stitching.
- Layout per artifact: `directory` (skill) materializes
  `<outDir>/<canonicalFilename>` + resource subdirs; `file` (agent,
  output-style) writes `<outDir>/<name>.md` directly, no resources — unless
  the target adapter's `nativeDocument` is set for that artifact, in which
  case the target picks its own extension (e.g. Codex's `agent` artifact
  writes `<outDir>/<name>.toml`; see `NativeAgentDocument`).
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
    enumerate **and** no `authoring-keys` declaration covers. Kept apart from
    `claude-only-frontmatter-stripped` for the same reason
    `unclassified-body-construct` is kept apart from `claude-only-body-feature`:
    that warning claims Claude owns the key and the target loses it, and an
    unrecognized key supports neither half.
  - A key covered by `authoring-keys` emits **nothing**. That is not an
    oversight: a declared strip is not a loss, and only a confirmed loss is
    worth recording (ndr:4nshwv).

## Cross-target install collisions

At `--scope plugin`, `claude`, `codex`, and `pi` all resolve a skill install
to the identical `join(pluginRoot, 'skills')` — correct and unchanged, since
all three harnesses read a plugin's `skills/` directory in place. That shared
path means a second target installing the same skill into the same plugin
root can silently erase the first target's projection: skill installs use
`ownership: 'snapshot'` (§ Render contract's directory layout), so
`materializeCompilation` swaps the *whole* destination directory, and neither
ownership mode records which target wrote a file.

`install-collision.ts` detects this **statelessly** — no manifest, no
persisted state — at install time for target `T` into `destinationRoot`:

1. Bytes on disk equal what `T`'s own plan would write (or the destination
   doesn't exist yet): proceed normally. This covers a fresh install and a
   no-op re-install of the same target.
2. Otherwise, project the same source directory for every *other* target in
   `targets/registry.ts` that supports the artifact, and compare each
   projection's bytes against what is on disk.
3. A match against another target's projection is a collision: `install`
   refuses before anything is staged or swapped, and `check-install` reports
   it as a `cross-target-install-collision` diagnostic instead (it is
   read-only, so it never throws).
4. No match anywhere: an ordinary upgrade of `T`'s own earlier output, and
   the write proceeds.

The refusal message names the colliding target and, where cheap to compute,
a `differs:` line (frontmatter keys and/or `body`) — not a general diff
engine, just what the two projections already have in hand.

Known and accepted blind spot: if the source was edited between two installs
of different targets, the on-disk bytes can match neither current
projection, and the check degrades to a silent overwrite. This is
deliberate — closing it would require persistent state that nothing else in
`install.ts`/`materializer.ts` carries.

## Common commands

```sh
bun install
bun test                          # full test suite, including snapshots
bun test --update-snapshots       # after intentional output changes
bunx biome check .                # lint + format check
bunx biome check . --write        # auto-fix (re-run tests after)
bunx tsc --noEmit                 # typecheck only

bun run src/cli.ts list-targets
bun run src/cli.ts render <source-dir> --target <name> --out <dir>
bun run src/cli.ts render <source-dir> --all-targets --out-base <dir>
bun run src/cli.ts install <source-dir> --target <name> --scope <user|project|plugin>
bun run src/cli.ts check-install <source-dir> --target <name> --scope <user|project|plugin>
bun run src/cli.ts validate <source-dir>
# artifact inferred from SKILL.md / AGENT.md / OUTPUT_STYLE.md presence;
# override with -a, --artifact <skill|agent|output-style>
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

**Release binary** (consumers; no checkout, no Bun): see README § Release
binaries. Pin `vX.Y.Z` + the `SHA256SUMS` entry, never a commit SHA.

## Releases

- **Tooling:** semantic-release (`.releaserc.json`; deps pinned in
  `devDependencies`). Every releasable push to `main` — `feat:`, `fix:`,
  `perf:`, or a breaking change — releases immediately: version computed from
  commits since the last tag, `CHANGELOG.md` + `package.json` committed back
  `[skip ci]`, tag `vX.Y.Z`, GitHub release. No release PR, no batching valve:
  chosen over release-please to avoid granting Actions PR-creation rights.
  Other commit types release nothing. Never bump the version or tag by hand.
- **Version string:** `src/cli.ts` imports `package.json` for `--version`;
  the npm plugin (npmPublish: false) writes the released number there before
  the tag is cut, so the compiled binary reports it with no second edit.
- **Binaries:** `.github/workflows/release.yml` builds on a native-runner
  matrix (linux-x64, linux-arm64, darwin-arm64 — bun cannot reliably
  cross-compile to macOS, oven-sh/bun#29120) and attaches the three binaries
  plus one `SHA256SUMS`. darwin-x64 is deliberately not shipped: no consumer
  runs Intel macOS, and GitHub's x64 macOS runners are on the way out anyway
  (`macos-15-intel` retires Fall 2027). `ci.yml` runs a single-platform compile smoke so a compile
  break surfaces before tag time.
- **Known limitation:** the release commit is pushed with `[skip ci]`, so no CI
  runs on it; `main` was already green, and the build job smoke-tests each
  binary (`--version`, `list-targets`) before publishing.

## Adding a new target

1. Create `src/targets/<name>.ts` exporting a `TargetAdapter`. Use the shared
   Agent Skills constructor unless the target diverges. Each supported
   artifact goes under `artifacts.<artifact>` with its own `installLocations`,
   `resourceSubdirs`, `outputFrontmatterSchema`,
   and optional `bundle`.
2. Add the literal to `TargetName` and `TARGET_NAMES` in `src/types.ts`.
3. Register in `REGISTRY` in `src/targets/registry.ts`. If the target owns a
   marketplace format, attach that optional capability in `src/targets/index.ts`.
4. `render.test.ts` automatically picks up the new target via
   `TARGET_NAMES`; re-run with `bun test --update-snapshots` and review the
   diff before committing. Unsupported (target, artifact) pairs assert a
   thrown error instead of producing a snapshot.

## Adding a new artifact

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
- `tests/codex-agent-surface.test.ts` suppresses it file-wide, on the
  `src/capabilities.ts` precedent rather than the two-line one: every
  `${CLAUDE_*}` in it is a capability-table key or a construct under assertion,
  and six line-level suppressions would bury what they annotate.

## Document class

`PACKAGE.yaml` may declare `documents: [{class, pattern}]`, where `class` is
`reference` or `diagnostic`. Both mark a file whose Claude-only constructs are
documentation *about* Claude rather than instructions to a model — an API gotcha
reference, or a skill that probes a specific endpoint — so the file is exempt
from body scanning. This is deliberately **not** an `artifacts:` entry: document
class is orthogonal to artifact type, and overloading `artifacts` would emit a
spurious `unsupported-artifact-projection` for a file never meant to translate.

## Root manifest

`MARKETPLACE.yaml` publications may declare `root-manifest: true` (kebab, on the
`authoring-keys` precedent). It adds one output anchored to the **marketplace
root** — the directory holding `MARKETPLACE.yaml` — beside the usual
`<out>/<publication.id>/…` tree.

- **Why.** Claude Code's `plugin marketplace add owner/repo` reads only
  `<clone-root>/.claude-plugin/marketplace.json` and resolves each plugin
  `source` relative to the directory containing `.claude-plugin/` (`../` is
  forbidden). A registry that lives only under `<out>/<id>/` cannot be
  installed from a clone, and a hand-placed root copy would resolve
  `./plugins/ndr` to the *uncompiled canonical source*.
- **What changes.** Nothing under `<out>/` — the nested registry keeps its
  `./<package-dir>` sources, because a local-directory install resolves
  against the nested root. The root copy is identical except that every plugin
  `source` (Claude) / `source.path` (Codex) is rewritten to
  `./<out relative to the marketplace root>/<publication.id>/<package-dir>`.
  Only `./`-relative sources are re-anchored — an object form's discriminator
  (`github`, `git-subdir`), a remote URL, or an absolute path already resolves
  independently of the manifest's location and passes through unchanged.
  A source walking upward (`../`) is refused.
- **Preconditions.** `--out` must be inside the marketplace root, checked before
  anything is materialized; otherwise a rewritten source would start with `../`.
  Two publications may not declare `root-manifest` at the same `destination`
  (rejected in `src/definitions.ts` when the definition loads, beside the
  duplicate-publication-id check): the root holds one copy, so the later one
  would silently overwrite the earlier.
- **Plumbing.** `compileMarketplace` produces `rootOutputs` itself, given the
  output root via its options argument, so every caller gets the second anchor
  rather than only the CLI. `src/root-manifest.ts` builds the copy;
  `CompilationPlan.rootOutputs` carries it as a separate list rather than a flag
  inside `outputs`, so every consumer that assumes "everything is under the
  output root" stays correct and opts into the second anchor deliberately. The
  materializer writes that one file directly (no staging swap, no sibling
  management — the marketplace root is the user's repo), `check` reports its
  drift/absence under the publication id with a `<root>/…` path, and
  `--claude-native` validates the marketplace root as a second plugin root.

## Output content checks

`check` reads every managed output's bytes for the drift comparison already, so
two content gates ride on that same read — covering **copied passthrough
resources**, not only generated documents:

- `unsafe-output-content` — the output contains an absolute home directory
  (`/Users/<name>/`, `/home/<name>/`), or a string listed in the marketplace's
  optional `redactions:` block. Redactions are **literal strings, not patterns**:
  a declaration names a vocabulary, and a regex invites an author to encode
  matching logic the compiler then has to defend against. The patterned class
  that generalizes across every repository (the home directory) is built in.
  Binary outputs are skipped — a file with no text has nothing to leak in it.
- `invalid-output-document` — a `.json` output that is not one of the native
  documents (which have their own `invalid-native-document` code) fails to parse.
  Both harnesses parse these at load time, so a file that does not parse is one
  the runtime rejects.

Both are gates on `check`, never on `compile`: compilation stays total, and
whether a tree is publishable is a judgement about a finished tree (ndr:tfee0d).
A leak that reaches disk under `--out` has not been published; one that survives
`check` is about to be.

Deliberately **not** ported from the repo-local linter these replace: an empty
or short markdown file, and an allowed-extension list. Neither is a runtime
failure on either harness, and turning one repository's house style into every
consumer's build error is the overreach ndr:17dhph rejected for strict target
schemas. A publishing repo that wants those keeps them as its own pre-push hook,
alongside the repo-wide secret scan that cannot move here — agentforge only ever
sees files a publication declares.

## Collaborator references

A body naming an agent the target does not register is the `agent-reference`
construct family, declarable as `body-agent-reference` (ndr:c5haze). Codex
registers no agent role from a plugin package (`docs/limitations.md` L-010), so
a Codex body saying `@vault-reader` instructs a dispatch that cannot resolve —
the model confabulates rather than degrades. That loss is unconditional, which
is what puts it inside the declared-loss gate rather than beside it (ndr:5ymhmg).

**Matched against data, not shape.** Every other family is a regex over body
text. This one resolves each `@token` against the agents the *same package*
declares — frontmatter `name:`, or the filename stem when that key is absent.
A declared name is a collaborator reference; anything else is prose. That is why
the detector has no heuristic in it, and why the leading guard can afford to
admit `` `@name` ``, `(@name)` and `[@name]` when the shape-keyed
`file-reference` matcher cannot.

The `file-reference` family is untouched. Its path-separator requirement is a
deliberate exclusion, and the two families stay disjoint: `@name` never matches
when a `/` follows.

**Package-local, deliberately.** A body naming a *sibling* package's agent is
not detected — Teach naming Librarian's `@vault-reader` is the motivating case
this does **not** cover. Widening resolution to the whole publication would make
a package's diagnostics depend on its siblings' contents, which is its own fork;
it is tracked as Fibery Charting #23, not decided here.

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

- Plugin-scope `agent` installation, remaining non-Claude/Codex projections,
  and marketplace reuse of the Codex leaf projection (blocked upstream —
  `docs/limitations.md` L-010) remain in the 0.8 work in
  [docs/roadmap.md](docs/roadmap.md). MCP artifacts remain later work.
- Watch mode.
- Multi-artifact source directory rendering (each source dir contains
  exactly one canonical file).
- Translating Claude-only body features (`$ARGUMENTS`, dynamic shell
  injection) into target-native forms — current behavior is warn-only.
- Nix integration; the tool runs as a plain `bun run` invocation.

## VCS notes

- The repo is jj-colocated: use `jj` commands for local history (a hook
  rejects bare `git`). The user's `git-workflow.md` rules apply.
- Two remotes, and they are not interchangeable:
  - `origin` is `ssh://git@forgejo-ssh.taileff4c.ts.net/jacob/agentforge.git`
    — a **private** Forgejo instance reachable over Tailscale, tracked by
    `main`. This is the default push target.
  - `github` is `git@github.com:jdh313/agentforge.git` — the **public** mirror.
    It carries CI (`.github/workflows/ci.yml`: tests, typecheck, lint) and the
    semantic-release automation, so a push there publishes and can cut a
    release.
- Push only when asked, and push to the remote named in the request. "Push"
  with no remote named means `origin` (private Forgejo), never `github`.

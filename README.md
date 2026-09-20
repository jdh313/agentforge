# agentforge

Define and render canonical AI agent artifacts for multiple harnesses.

Takes a single canonical source (e.g. a `SKILL.md`) and emits harness-specific
outputs for Claude Code, OpenCode, Codex, and Pi — each with the right path,
frontmatter shape, and optional per-target body overrides. Marketplace
compilation also translates Claude agent and command behaviors into direct
Claude artifacts or inferred Codex procedures and skills.

AgentForge has two layers:

- Collection definitions (`PACKAGE.yaml`, `MARKETPLACE.yaml`) describe package
  identity, artifact projections, target support, and marketplace publication.
- Leaf artifact rendering turns canonical files such as `SKILL.md` into
  harness-native outputs.

## Status

Skill and output-style rendering is snapshot-tested. Version 1 package and
marketplace definitions can be loaded, validated, and compiled into a pure,
deterministic output plan through the library API. Production Claude and Codex
adapters emit validated native marketplace registries, plugin manifests, and
package payloads, including agent and command translations for the
representative marketplace corpus. The CLI materializes those plans as atomic,
complete-snapshot marketplace builds and checks materialized trees for native
validity and drift without writing. Directory artifacts install as owned
snapshots; file-layout artifacts install only their planned paths inside shared
runtime directories, preserving sibling files (`ndr:hjnabw`).

The canonical-agent roadmap slice is underway. The leaf renderer accepts an
`AGENT.md` artifact and projects it to Claude's native named Markdown format and
Codex's native agent-role TOML. Both install at user or project scope with
sibling-preserving ownership. Codex plugin packages cannot register agent roles
as of codex-cli 0.154.0, so marketplace packages retain an explicitly inert
Markdown procedure rather than claiming native registration. See
[the roadmap](docs/roadmap.md) for the implementation boundary and acceptance
sequence through 1.0.

## Requirements

- [Bun](https://bun.sh) 1.3 or newer — the runtime, test runner, and bundler.
  No Node.js toolchain is required.
- No other system dependencies. Optional integrations (the `claude` CLI, a
  sibling `cc-marketplace` checkout) are called out where they apply.

## Quick start

```sh
bun install
bun test

bun run src/cli.ts list-targets
bun run src/cli.ts render tests/fixtures/claude-rich --all-targets --out-base /tmp/agentforge-spike
bun run src/cli.ts validate tests/fixtures/claude-rich
bun run src/cli.ts compile tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-marketplace
bun run src/cli.ts check tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-marketplace
bun run src/cli.ts install tests/fixtures/common-subset --target pi --scope project --project-root /tmp/example-project
bun run src/cli.ts check-install tests/fixtures/common-subset --target pi --scope project --project-root /tmp/example-project
```

### Compilation reports

`compile` accepts `--report <path>`, writing one compile's diagnostics to a file
instead of leaving them in terminal scrollback. The format is taken from the
extension — `.json` for machine consumers, `.md` for reading — and an
unrecognized extension is an error rather than a guess.

```sh
bun run src/cli.ts compile <marketplace> --out /tmp/out --report /tmp/report.md
bun run src/cli.ts compile <marketplace> --out /tmp/out --report /tmp/report.json
```

The report is written to its own path, never under `--out`, so it is not an
output and never ships to an installer. Paths inside it are relative to the
marketplace root, and key order is deterministic, so two compiles of unchanged
input produce byte-identical reports.

Both formats are organised around **disposition** — what actually became of the
thing — rather than severity, which does not track it: `declared-loss` is a note
and is a real loss, while `translated-construct` is also a note and is not one.

| Disposition | Meaning |
| --- | --- |
| `lost-undeclared` | destroyed in translation, with nothing declaring it |
| `lost-declared` | destroyed, but acknowledged in the package's `losses` |
| `carried-form-changed` | survives as a native equivalent |
| `carried-unenforced` | survives in the output, unenforced by the target |
| `nothing-to-carry` | there was nothing to translate, and nothing was lost |
| `gated` | outcome depends on a known, actionable condition |
| `not-established` | construct-shaped, and never ruled on |

Disposition is derived from the diagnostic code rather than stored on the
diagnostic, so the compiler stays unaware a report exists. The mapping is total
over the diagnostic code union, so adding a code without classifying it fails
the build rather than resolving to `not-established` — and `not-established`
means the construct was genuinely never ruled on, never that a loss went
unasserted. Asserting otherwise is the error the severity axis made.

The JSON carries `schemaVersion` (currently `2`), marketplace-wide `counts`, and diagnostics
nested by target, then package (with a sibling `publication` key for any that
are not package-scoped). Markdown adds a third level, grouping by source file so
a reader can ask "what did this file lose, to this target?". Each entry keeps
its `retainedSource`, so a finding traces back to the canonical file that
produced it.

Target is a grouping level even though only Codex reports today. Claude is the
source dialect and passes source through, so it contributes nothing — a
single-key map says that plainly where a flat one would imply the distinction
does not exist.

**What a report does not cover.** It is built from the compiler's diagnostics,
so it records translation — what survived and what was lost in it — and says
nothing about *omission*: a source file or declaration absent from output with no
diagnostic naming it. Every report states this limit in its own header. See
`docs/limitations.md` L-007.

## Build and install

AgentForge can be compiled into a standalone Bun binary. `bun run install:bin`
builds `dist/agentforge` and symlinks it into `~/.local/bin/agentforge`:

```sh
bun run install:bin
agentforge list-targets
```

Run `bun run build` to compile the binary without installing it. The `dist/`
directory is gitignored; because the installed command is a symlink, later
builds update it in place without another install step.

AgentForge is not published to npm. Install it via `bun link` (development),
`bun run install:bin` (compiled binary), or a release binary (below).

### Release binaries

Every GitHub release carries one compiled binary per platform —
`agentforge-{linux-x64,linux-arm64,darwin-arm64}` — plus a
`SHA256SUMS` file. Pin a version and a checksum rather than a commit; consumer
CI then needs neither a checkout of this repository nor a Bun toolchain:

```sh
VERSION=0.4.0
ASSET=agentforge-linux-x64
BASE=https://github.com/jdh313/agentforge/releases/download/v${VERSION}
curl -fsSLO "${BASE}/${ASSET}"
curl -fsSLO "${BASE}/SHA256SUMS"
sha256sum --check --ignore-missing SHA256SUMS   # shasum -a 256 -c on macOS
chmod +x "${ASSET}" && ./"${ASSET}" --version
```

### npm packages

Each release also publishes to the GitHub Packages npm registry as
`@jdh313/agentforge`, with the binary itself in a per-platform package
(`@jdh313/agentforge-<platform>-<arch>`) declared as an optional dependency and
guarded by `os`/`cpu`. A package manager installs only the binary matching the
host — two packages, not four.

This registry requires a token even for a public package, so it serves
consumers that already authenticate to GitHub; the release binaries above stay
the anonymous path. The token needs the `read:packages` scope
(`gh auth refresh -h github.com -s read:packages` adds it to an existing
`gh` login).

With npm, in a project-local `.npmrc`:

```ini
@jdh313:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

With Bun, in `bunfig.toml`:

```toml
[install.scopes]
"@jdh313" = { url = "https://npm.pkg.github.com/", token = "$NODE_AUTH_TOKEN" }
```

Then install it as a dependency and run the installed binary:

```sh
export NODE_AUTH_TOKEN="$(gh auth token)"
bun install @jdh313/agentforge@0.4.0    # or: npm install @jdh313/agentforge@0.4.0
bunx agentforge --version               # or: ./node_modules/.bin/agentforge --version
```

Install first, then run — do not reach for a one-shot
`bunx @jdh313/agentforge@0.4.0`. `bunx` resolves a not-yet-installed remote
package against the default registry and honours neither `bunfig.toml`'s
`[install.scopes]` nor a scoped `.npmrc` entry, so it fails with a 404 against
`registry.npmjs.org`. Once the package is installed, `bunx agentforge` resolves
it from `node_modules` and works.

In GitHub Actions, a workflow in another repository authenticates with its own
`GITHUB_TOKEN` under `permissions: packages: read` — but only after that
repository has been granted access under the package's **Manage Actions
access**. Automatic access covers only the repository the package is published
from.

Releases are cut by [semantic-release](https://github.com/semantic-release/semantic-release):
every releasable push to `main` (`feat:`, `fix:`, `perf:`, or a breaking
change) computes the next version from the commits since the last tag, commits
`CHANGELOG.md` + `package.json`, tags `vX.Y.Z`, publishes the GitHub release,
and builds the binaries on native runners per platform
(`.github/workflows/release.yml`). Other commit types release nothing.

## Guided plugin onboarding

Invoke `$agentforge-onboard-plugin` from this repository to migrate an existing
Claude, Codex, or dual-runtime plugin into canonical `PACKAGE.yaml` and
`MARKETPLACE.yaml` definitions. The project-local skill inventories every source
path and previews proposed definitions plus target compatibility losses
before modifying plugin or marketplace sources.

## Package and marketplace definitions

Collection definitions are uppercase standalone YAML files. They are not leaf
artifacts and are not part of `ArtifactType`.

```ts
import {
  loadMarketplaceDefinition,
  loadPackageDefinition,
} from 'agentforge/definitions';

const packageResult = await loadPackageDefinition('/path/to/PACKAGE.yaml');
const marketplaceResult = await loadMarketplaceDefinition('/path/to/MARKETPLACE.yaml');
```

Loading a package validates its schema and requires every declared artifact
pattern to match at least one file. Loading a marketplace also resolves its
declared package universe, rejects package ID collisions, and validates every
explicit publication enrollment against package target support.

### `PACKAGE.yaml`

```yaml
schema: agentforge.package/v1
id: librarian
defaults:
  name: librarian
  version: 0.17.1
  description: Curate and retrieve notes.
  author:
    name: Jacob Hoehler
  license: Apache-2.0
  keywords: [obsidian, notes]
artifacts:
  - type: skill
    pattern: skills/*/SKILL.md
  - type: agent
    pattern: agents/*.md
  - type: command
    pattern: commands/*.md
  - type: hook
    pattern: hooks/hooks.json
documents:
  - class: reference
    pattern: references/*.md
payloads:
  include:
    - source: LICENSE
    - source: templates/
      destination: resources/templates/
      exclude: [templates/private/**]
  exclude: ['**/*.test.md']
targets:
  claude:
    payloads:
      include:
        - source: hooks/*.json
          destination: hooks/
  codex:
    overrides:
      description: Curate notes through shared workflows and isolated roles.
    losses:
      - construct: agent-tools-filter
        state: stripped
        note: Codex role procedures carry no tool allowlist.
    native:
      interface:
        displayName: Librarian
```

- `documents` is optional and marks files whose Claude-only constructs are
  documentation *about* Claude rather than instructions to a model — an API
  gotcha reference, or a skill that probes a specific endpoint. `class` is
  `reference` or `diagnostic`; both exempt the file from construct scanning, and
  the name records why. This is deliberately separate from `artifacts`, because
  document class is orthogonal to whether a file projects to a target.
- `id` is the stable AgentForge identity and cannot be changed by target data.
- `defaults` is the normalized shared metadata set: `name`, `version`,
  `description`, `author`, `license`, and `keywords`.
- `artifacts` declares open package-level projection types and patterns. Leaf
  `ArtifactType` remains the smaller canonical renderer vocabulary; package-level
  types such as `hook` do not expand it. How a type is projected is the target's
  call: Claude copies `hook` through untouched, while Codex translates it into
  its own handler schema.
- `targets.<name>.losses` declares what happens to a Claude-only construct
  that the target cannot express and that would otherwise disappear with nothing
  reported. **Compilation fails when a detected construct has no declaration**,
  naming the construct and the file. Each declaration that matches also emits a
  `declared-loss` note on every compile and check, so the loss
  stays visible rather than being silenced by having been declared once.
  Constructs detected today, in frontmatter: `agent-tools-filter` (an agent's
  `tools:`) and `command-tools-filter` (a command's `allowed-tools:`). In
  artifact bodies and text resource files: `mcp-tool-reference` (an `mcp__*`
  tool name), `body-template-variable` (`$ARGUMENTS`, `$1`–`$9`,
  `${CLAUDE_*}`), `body-shell-injection` (`` !`…` `` and ` ```! `), and
  `body-file-reference` (an `@dir/file` reference). Two things this scan
  deliberately does not see: `$1`–`$9` inside a shell resource — a file under
  `scripts/` or named `*.sh` / `*.bash` — is that script's own positional
  argument, and a file marked by `documents` is exempt whatever it contains.
  A construct-shaped string the capability table does not classify — a bare
  `$UPPER` such as `$PATH` — is reported as an `unclassified-construct`
  warning and never gated, because a declaration is only meaningful when there
  is a confirmed loss to record.
  `state` is `stripped` or
  `retained-unenforced`; the optional `note` is what a user of that target does
  not get. **The declared `state` is checked against what the compiler actually
  emitted**, rather than taken on the author's word: a construct declared
  `stripped` that in fact survives into the output — or the reverse — fails
  compilation, naming both states and every occurrence site. A construct that is
  translated rather than lost — a hook handler's
  `args` folded into Codex's single `command` string — warns instead of
  requiring a declaration.
- A construct the target's translator carries into a native form is **not** a
  loss, so it never takes a declaration. The capability table records what each
  one becomes, and every occurrence emits a `translated-construct` note on each
  compile and check — otherwise a handled construct and one nothing ever scanned
  look identical in the report. Translated today, both on Codex:
  `disable-model-invocation` becomes an `agents/openai.yaml` invocation policy,
  and `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` in a hook configuration
  become `${PLUGIN_ROOT}` / `${PLUGIN_DATA}`. Other `${CLAUDE_*}` variables are
  untranslated and stay a declarable loss.
- `payloads.include` is an ordered list of package-relative source/destination
  entries. Exact files keep their source path by default; directories and globs
  preserve paths below their static source root and require directory
  destinations ending in `/` when remapped.
- `payloads.exclude` applies to every include in that declaration, while an
  include's own `exclude` narrows only that entry. Shared payloads are combined
  with optional `targets.<name>.payloads` before normalization.
- Loading expands payload declarations against the package file inventory into
  deterministic per-target plans. Escaping, non-portable, unmatched,
  ambiguous, symbolic-link, and colliding destinations fail before
  materialization. Collisions include file/directory conflicts and conflicts
  with generated artifacts.
- Compilation copies each declared payload to its exact planned destination.
  Executable source intent is normalized to mode `0755`; other payloads use
  `0644`. The complete output is staged and atomically replaces the previous
  tree only after every file succeeds.
- Supplied, translated, and generated outputs have no implicit precedence and
  are never merged. An exact destination collision fails with producer-aware
  diagnostics by default. A supplied payload entry may set
  `collision: override` to replace a generated or translated output at the same
  exact path in the same package; the compiler records the replacement as a
  note. This opt-in never masks supplied/supplied, cross-package, or
  file/directory conflicts.
- Loading retains declared artifact source text plus the package file inventory,
  so later compilation can remain free of filesystem I/O.
- Keys under `targets` declare target support. `overrides` changes normalized
  defaults for one target.
- `native` accepts any JSON-compatible object. A future compiler applies it
  last, with unrestricted last-write-wins behavior, including native `name` and
  `version` fields.

### `MARKETPLACE.yaml`

```yaml
schema: agentforge.marketplace/v1
id: cc-marketplace
defaults:
  name: cc-marketplace
  description: Personal dual-runtime marketplace
packages:
  - packages/*/PACKAGE.yaml
publications:
  - id: claude
    target: claude
    destination: .claude-plugin/marketplace.json
    enrollment:
      mode: all-compatible
  - id: codex
    target: codex
    destination: .agents/plugins/marketplace.json
    enrollment:
      mode: include
      packages: [commit, craft, linear, librarian, spec-flow]
    native:
      interface:
        displayName: CC Marketplace
```

- `packages` is the explicit definition universe; paths and glob patterns are
  resolved relative to `MARKETPLACE.yaml`.
- Each publication has its own target, destination, enrollment, and native
  metadata. Publication `id` values must be unique.
- `all-compatible` enrolls every package declaring the publication target.
  `include` names an explicit subset and rejects missing or incompatible IDs.
- Marketplace defaults are shared identity metadata. Publication `native` data
  is the future registry escape hatch and applies last.
- These models validate inputs only. Native emission, translation,
  materialization, and read-only drift checking remain separate pipeline
  concerns.

## Marketplace compiler

The compiler resolves publication enrollment and target-specific package
metadata before calling an injected target adapter. Adapters return generated
or copied output proposals plus nonfatal diagnostics; the compiler adds
provenance, orders the plan, and rejects unsafe or colliding destinations.

```ts
import {
  compileMarketplace,
  type TargetCompilerAdapter,
} from 'agentforge/compiler';

const compileRegistry: TargetCompilerAdapter['compilePublication'] = (input) => ({
  outputs: [
    {
      kind: 'generated',
      destination: input.publication.destination,
      content: JSON.stringify({ name: input.marketplace.metadata.name }),
    },
  ],
});

const plan = compileMarketplace(marketplaceResult, [
  { target: 'claude', compilePublication: compileRegistry },
  { target: 'codex', compilePublication: compileRegistry },
]);
```

- Compilation is synchronous and performs no filesystem I/O.
- `all-compatible` enrollment includes every package declaring the target;
  explicit enrollment remains validated and deterministic.
- Package `metadata` contains canonical defaults merged with normalized target
  overrides. Package and publication `native` overlays remain separate so an
  adapter can apply them last.
- Destinations must be normalized relative file paths with forward-slash
  separators. Collision checks are case-insensitive and Unicode-normalized;
  failures identify both producers.
- A translation gap can be returned as a diagnostic with `retainedSource`,
  keeping the source payload visible without synthesizing a native document.

Use the production adapters to compile the canonical collection into Claude and
Codex marketplace documents:

```ts
import { compileMarketplace } from 'agentforge/compiler';
import {
  claudeMarketplaceAdapter,
  codexMarketplaceAdapter,
} from 'agentforge/marketplace-adapters';

const plan = compileMarketplace(marketplaceResult, [
  claudeMarketplaceAdapter,
  codexMarketplaceAdapter,
]);
```

- Both targets emit per-package rendered skills plus copied `scripts/`,
  `references/`, and `assets/` resources alongside their marketplace and plugin
  documents.
- Claude emits declared `agent` and `command` sources directly as
  `agents/*.md` and `commands/*.md`. Codex infers reusable role procedures from
  agents and explicit-invocation skills from commands; inferred command skills
  receive skill-local `agents/openai.yaml` policy.
- Codex skill projections translate `disable-model-invocation: true` into a
  skill-local `agents/openai.yaml` policy that disables implicit invocation.
  Explicitly supplied policy sidecars use the normal payload collision rules.
- Claude passes declared `hook` artifacts through to the package tree. Codex
  retains them as structured unsupported-projection diagnostics.
- Inferred Codex translations emit structured diagnostics naming behavior that
  is not runtime-enforced and retain the source declaration for inspection.
- Other unsupported artifact declarations remain visible through diagnostics
  carrying their source path and artifact type.
- Package document destinations and registry source paths follow each loaded
  `PACKAGE.yaml` directory relative to `MARKETPLACE.yaml`.
- Known native fields are type-checked with open target schemas; unrecognized
  native keys remain available for target evolution.

## CLI

```
agentforge compile <MARKETPLACE.yaml> --out <out-dir>
agentforge compile <MARKETPLACE.yaml> --out <out-dir> --publication <id>
agentforge check <MARKETPLACE.yaml> --out <out-dir>
agentforge check <MARKETPLACE.yaml> --out <out-dir> --publication <id>
agentforge check <MARKETPLACE.yaml> --out <out-dir> --claude-native
agentforge install <artifact-source-dir> --target <name> --scope <user|project|plugin>
agentforge check-install <artifact-source-dir> --target <name> --scope <user|project|plugin>
agentforge render <artifact-source-dir> --target <name> --out <out-dir>
agentforge render <artifact-source-dir> --all-targets --out-base <out-base>
agentforge validate <artifact-source-dir>
agentforge list-targets
```

- `compile` builds every publication when no filter is provided. Repeat
  `--publication <id>` to select a deterministic subset.
- Each publication is isolated under `<out-dir>/<publication-id>/`, preserving
  its compiled relative destinations without allowing cross-target package
  projections to collide.
- The output directory is a complete snapshot. AgentForge stages every
  generated document and copied artifact before replacing an existing build;
  planning or staging failures leave the prior output intact.
- `render` follows the same complete-snapshot contract for its `--out`
  directory. It uses the shared compilation plan and materializer, so stale
  files are removed, executable intent is normalized, unsafe resource symlinks
  are rejected, and a failed rebuild leaves the prior render intact. Bundled
  targets first publish a temporary directory tree, then build and publish the
  archive from those exact bytes.
- Notes and warnings are printed in deterministic plan order and do not make a
  successful compile exit nonzero.
- Claude agents support `user`, `project`, and `plugin` installation. A plugin
  install requires `--plugin-root <package-dir>` and owns only its planned
  files: `<package-dir>/agents/<name>.md` plus declared `references/`,
  `scripts/`, and `assets/` at the package root. User/project agent installs
  remain one-file and warn when their body relies on `${CLAUDE_PLUGIN_ROOT}`.
- `check` derives the same expected publication plans in memory, validates
  registries, plugin manifests, local plugin references, package identity and
  version parity, and projected skill frontmatter, then reports missing,
  changed, permission-drifted, and unexpected managed files without modifying
  the output tree.
- `check` mirrors repeatable `--publication` selection. Only selected
  `<out-dir>/<publication-id>/` trees are managed; paths outside them are left
  alone. Validation errors and drift exit nonzero, while translation notes and
  warnings remain nonfatal.
- `--claude-native` additionally runs `claude plugin validate --strict` for
  selected Claude publications, and for a `root-manifest` publication also
  validates the marketplace root. It is opt-in so the default check does not
  require Claude Code to be installed.
- `--json` emits the result as a single JSON document on stdout instead of the
  human lines, for a CI job or a consuming tool that would otherwise parse the
  diagnostic stream back apart. The document carries a `schemaVersion`, a
  hoisted `status` (`ok` / `failed`), a per-publication status and file count,
  the issues in their stable path-then-code order, and the compilation
  diagnostics. Read `status` rather than inferring success from an empty
  `issues` array. Exit codes are unchanged.
- `install` requires an explicit scope. User and project scopes resolve through
  the selected target; project scope uses the current repository root (or the
  current directory outside a repository) unless `--project-root` is supplied.
  Plugin scope requires `--plugin-root` and is
  available only where the target declares a package skill directory.
- A directory-layout install owns exactly one artifact root. It stages the
  complete projection, atomically replaces that root, removes stale files
  inside it, and leaves sibling artifacts untouched.
- A file-layout install owns only the paths in its plan inside the shared target
  directory. It may replace a regular file at the identity-derived path, but
  refuses symlinks and directories, preserves every sibling, and does not prune
  an old filename after a rename.
- `check-install` resolves and builds the same plan without writing. Snapshot
  installs report unexpected files inside their owned root; planned-file
  installs check only their owned paths and ignore unrelated siblings.

### `root-manifest` publications

A publication may declare `root-manifest: true`:

```yaml
publications:
  - id: claude
    target: claude
    destination: .claude-plugin/marketplace.json
    root-manifest: true
```

- **Why.** `claude plugin marketplace add owner/repo` reads only
  `<clone-root>/.claude-plugin/marketplace.json` and resolves each plugin
  `source` against the directory holding `.claude-plugin/`. A registry that
  exists only at `<out-dir>/<publication-id>/.claude-plugin/marketplace.json`
  is therefore not installable from a clone.
- **What it writes.** Everything under `<out-dir>/<publication-id>/` is
  unchanged, nested registry included. A *second* copy of that registry is
  written at `<marketplace-dir>/<destination>` with every plugin `source`
  (Claude) or `source.path` (Codex) rewritten from `./<package-dir>` to
  `./<out-dir relative to the marketplace>/<publication-id>/<package-dir>`.
  Only `./`-relative sources are re-anchored: an object form's discriminator,
  a remote URL, or an absolute path already resolves without reference to the
  manifest's location and passes through untouched. A source that walks
  upward (`../`) is rejected.
- **Why both.** The nested copy stays byte-identical because a local install
  (`claude plugin marketplace add ./marketplaces/claude`) resolves against the
  nested root; the root copy serves the clone-root install.
- **Preconditions.** `--out` must be inside the marketplace directory, so a
  rewritten source never starts with `../`; the compile fails before
  materializing anything otherwise. No two publications may declare
  `root-manifest` at the same `destination` — the marketplace root holds one
  copy, and the second would silently overwrite the first — which is rejected
  when the definition loads.
- **Blast radius.** Only that one file is written at the marketplace root.
  AgentForge never stages, prunes, or otherwise manages its siblings, and
  `check` reports drift or absence of the root copy without treating unrelated
  root files as unexpected output.
- `compile` lists it as `[<publication>] root manifest <root>/<destination>`,
  and `compile --report` records it under `rootManifests`.

## Beta acceptance corpus

The canonical five-package fixture represents `commit`, `craft`, `linear`,
`librarian`, and `spec-flow`, including package-root files, arbitrary nested
skill sidecars, executable scripts, target-native files, agents, commands,
hooks, target overrides, and target-native metadata. Its exact generated trees
are committed under `tests/fixtures/expected/cc-marketplace`; the acceptance
test compares every relative path, byte, and normalized mode (`0755` for the
declared executable, `0644` otherwise). From a clean AgentForge checkout,
compile and validate both publications with:

```sh
bun run src/cli.ts compile tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-beta
bun run src/cli.ts check tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-beta
bun run src/cli.ts check tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-beta --publication claude --claude-native
UV_PROJECT_ENVIRONMENT=/tmp/agentforge-cc-marketplace-venv uv run --frozen --project ../cc-marketplace marketplace validate --format codex --manifest /tmp/agentforge-beta/codex/.agents/plugins/marketplace.json --plugins-root /tmp/agentforge-beta/codex/packages
AGENTFORGE_CC_MARKETPLACE_PROJECT=../cc-marketplace bun test tests/cli.test.ts
```

- The first check is AgentForge's always-on validation and drift gate for both
  publications.
- The Claude command requires the `claude` CLI.
- The Codex cross-check requires a sibling `../cc-marketplace` checkout and is
  read-only; it does not modify that repository or the compiled publication.
- The focused acceptance test always checks the committed trees and AgentForge
  clean/drift behavior. It also runs the installed Claude validator; setting
  `AGENTFORGE_CC_MARKETPLACE_PROJECT` enables the read-only Codex validator test.
- `bun test`, `bun run typecheck`, `bun run lint`, and `bun run build` are the
  repository gates.

## Targets

| Target | User skill root | Project skill root | User agent root | Project agent root | Plugin package root |
|---|---|---|---|---|---|
| `claude` | `~/.claude/skills` | `.claude/skills` | `~/.claude/agents` | `.claude/agents` | `skills` |
| `opencode` | `~/.config/opencode/skills` | `.opencode/skills` | unsupported | unsupported | unsupported |
| `codex` | `~/.agents/skills` | `.agents/skills` | `~/.codex/agents` | `.codex/agents` | `skills` |
| `pi` | `~/.pi/agent/skills` | `.pi/skills` | unsupported | unsupported | `skills` |
| `claude-chat` | unsupported | unsupported | unsupported | unsupported | unsupported |

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```sh
bun install
bun test
bun run typecheck
bun run lint
```

Snapshots are committed; regenerate intentional output changes with
`bun test --update-snapshots` and review the diff before committing.

Architectural decisions live in `decisions/` as atomic records rather than in
commit messages or docs — see `docs/limitations.md` for the companion register
of known gaps. A change that reverses a recorded decision should say so.

Code comments and commit messages cite these records as `ndr:<id>`, where the
id is the filename prefix under `decisions/` (for example `ndr:4nshwv` is
`decisions/4nshwv-*.md`). Older commits and tests also mention `JUN-<n>` and
`SC-<n>`; those are ids from a private issue tracker, kept for history, and do
not resolve to anything public.

## License

Apache-2.0. See [LICENSE](LICENSE).

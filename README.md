# agentforge

Define and render canonical AI agent artifacts for multiple harnesses.

Takes a single canonical source (e.g. a `SKILL.md`) and emits harness-specific
outputs for Claude Code, OpenCode, and Codex — each with the right path,
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
validity and drift without writing.

## Quick start

```sh
bun install
bun test

bun run src/cli.ts list-targets
bun run src/cli.ts render tests/fixtures/claude-rich --all-targets --out-base /tmp/agentforge-spike
bun run src/cli.ts validate tests/fixtures/claude-rich
bun run src/cli.ts compile tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-marketplace
bun run src/cli.ts check tests/fixtures/definitions/cc-marketplace/MARKETPLACE.yaml --out /tmp/agentforge-marketplace
```

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
    native:
      interface:
        displayName: Librarian
```

- `id` is the stable AgentForge identity and cannot be changed by target data.
- `defaults` is the normalized shared metadata set: `name`, `version`,
  `description`, `author`, `license`, and `keywords`.
- `artifacts` declares open package-level projection types and patterns. Leaf
  `ArtifactType` remains the smaller canonical renderer vocabulary; native
  passthrough types such as `hook` do not expand it.
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
agentforge render <skill-source-dir> --target <name> --out <out-dir>
agentforge render <skill-source-dir> --all-targets --out-base <out-base>
agentforge validate <skill-source-dir>
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
- Notes and warnings are printed in deterministic plan order and do not make a
  successful compile exit nonzero.
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
  selected Claude publications. It is opt-in so the default check does not
  require Claude Code to be installed.

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
- `bun test`, `bun run typecheck`, and `bun run lint` are the repository gates.

## Targets

| Target | Output base dir |
|---|---|
| `claude` | `~/.claude/skills` |
| `opencode` | `~/.config/opencode/skills` |
| `codex` | `~/.agents/skills` |
| `claude-chat` | `~/Downloads/claude-skills` |

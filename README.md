# agentforge

Define and render canonical AI agent artifacts for multiple harnesses.

Takes a single canonical source (e.g. a `SKILL.md`) and emits harness-specific
outputs for Claude Code, OpenCode, and Codex — each with the right path,
frontmatter shape, and optional per-target body overrides.

AgentForge has two layers:

- Collection definitions (`PACKAGE.yaml`, `MARKETPLACE.yaml`) describe package
  identity, artifact projections, target support, and marketplace publication.
- Leaf artifact rendering turns canonical files such as `SKILL.md` into
  harness-native outputs.

## Status

Skill and output-style rendering is snapshot-tested. Version 1 package and
marketplace definitions can be loaded and validated through the library API;
compiling those definitions into native manifests and registries is planned.

## Quick start

```sh
bun install
bun test

bun run src/cli.ts list-targets
bun run src/cli.ts render tests/fixtures/claude-rich --all-targets --out-base /tmp/agentforge-spike
bun run src/cli.ts validate tests/fixtures/claude-rich
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
targets:
  claude: {}
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
- `artifacts` declares projection patterns. It does not exclude other package
  contents from a future compiler.
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
- These models validate inputs only. Native manifest/registry emission,
  translators, drift checks, and output management are not implemented yet.

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
| `claude-chat` | `~/Downloads/claude-skills` |

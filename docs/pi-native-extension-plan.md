# Plan: package existing Pi-native extensions

Status: implemented and verified 2026-10-12. Standalone compilation/checking,
regression tests, and isolated Pi 1.1.0 acceptance are complete. See
[the acceptance report](pi-extension-acceptance.md) for observed gates and
remaining runtime gaps; this document retains the approved implementation scope.

## Goal

Compile an existing Pi extension from canonical package source into a directory
Pi can load or install. Extension modules may implement lifecycle handlers,
tool-call guards, or other Pi behavior; AgentForge packages their code without
translating or claiming to verify its semantics.

## Evidence and current gaps

- Pi 1.1.0 documents ordinary packages with a `package.json` containing a `pi`
  resource manifest. `pi.extensions` names extension entry points relative to
  the package root. Pi also supports conventional resource discovery.
- Local package installation registers the resolved path; it does not copy the
  package or install its dependencies. Project installation uses `--local` and
  remains subject to project trust.
- Pi extensions run with the Pi process's operating-system permissions.
- AgentForge already has target-specific `native` metadata, normalized payload
  routing, copy provenance, collision checks, and staged materialization.
- `CanonicalPackage.artifacts` currently requires a nonempty list, preventing a
  package containing only native extensions and supporting payloads.
- Pi has leaf skill/agent projection but no package compiler. Its agent files
  are for pi-subagents, whose loader does not discover agents inside packages.
- The existing marketplace compiler/checker assumes native registries and plugin
  references in several places. Pi must not be given a fabricated marketplace
  registry simply to reuse that pipeline.

Sources checked while preparing this plan:

- [Pi package documentation](https://pi.dev/docs/latest/packages)
- [Pi extension documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- Installed Pi 1.1.0 `docs/packages.md`, `docs/extensions.md`, and `docs/cli.md`.
- `src/definitions.ts`, `src/compiler.ts`, `src/check.ts`,
  `src/package-payload-plan.ts`, `src/target-adapter.ts`, and `src/targets/pi.ts`.

These sources informed the packaging contract. Fresh runtime acceptance is now
recorded separately in [the acceptance report](pi-extension-acceptance.md).
Recheck the installed API and documentation before extending support.

## Scope

### Include

- Pi-native TypeScript/JavaScript extension entry points, copied byte-for-byte.
- Explicitly declared helper modules, assets, scripts, and dependency metadata.
- Extension-only packages and packages combining extensions with canonical skills.
- Generated Pi `package.json` with explicit resource lists.
- Static package integrity checks and isolated executable acceptance.

### Exclude

- Translation of Claude/Codex hook JSON, event names, matchers, or payloads.
- Automatic discovery of every source file as an executable entry point.
- Bundling/transpiling extensions or resolving their import graphs.
- Running extension code, package managers, or lifecycle scripts during compile/check.
- Registering packages in Pi settings or modifying trust automatically.
- Pi package-contained agents, prompt/theme projection, and a Pi marketplace.
- npm/git publishing automation or a new AgentForge install/update/remove lifecycle.

## Proposed authoring contract

Reuse `targets.pi.native` for Pi/npm manifest metadata and `targets.pi.payloads`
for files. No new canonical hook or extension artifact is required.

```yaml
schema: agentforge.package/v1
id: tool-guard

defaults:
  name: tool-guard
  version: 1.0.0
  description: A native Pi tool guard

artifacts: []

targets:
  pi:
    native:
      keywords: [pi-package]
      peerDependencies:
        '@earendil-works/pi-coding-agent': '*'
      pi:
        extensions: ['./extensions/tool-guard.ts']
        skills: []
        prompts: []
        themes: []
    payloads:
      include:
        - source: pi/extensions/
          destination: extensions/
        - source: pi/lib/
          destination: lib/
```

- Manifest entry points refer to **output paths**, after payload routing.
- The author declares all files needed by relative imports and asset lookups.
  Preserve their relative layout; do not rewrite imports or code.
- For a mixed package, declare canonical skills through existing `artifacts`
  patterns. The Pi compiler projects them with existing skill semantics and
  includes the resulting skill roots in the manifest.
- Generate one `package.json` from resolved defaults/overrides and explicit
  native metadata. Preserve unknown native fields using an open schema, but
  validate the known resource and dependency fields.
- Keep package name/version consistent with the resolved canonical metadata.
  Reject conflicting identity rather than silently changing package ownership.
- No implicit merge with a copied source `package.json`. Reserve the generated
  manifest destination; reject a supplied replacement that bypasses resource
  and identity validation in this first slice.
- First slice: support exact extension files and directory entry points with a
  verified `index.ts`/`index.js`. Defer glob/exclusion entry-point syntax until
  it can be implemented and tested against Pi's actual discovery rules.
- Emit explicit resource lists, including empty lists for excluded resource
  types, to prevent conventional discovery from accidentally activating helper
  files or undeclared resources. Exact mixed-skill list behavior requires the
  discovery acceptance gate below.

## CLI and output

```sh
agentforge package compile ./PACKAGE.yaml --target pi --out ./dist/tool-guard
agentforge package check ./PACKAGE.yaml --target pi --out ./dist/tool-guard

# Separate, user-initiated activation; not performed by AgentForge:
pi install ./dist/tool-guard
# Or, from the intended consumer project:
pi install --local /absolute/path/to/dist/tool-guard
```

Output is a standalone package root:

```text
dist/tool-guard/
  package.json
  extensions/tool-guard.ts
  lib/...
  skills/...                  # only when canonical skills are declared
```

`--out` is an AgentForge-owned complete snapshot. Refuse overlap with source
and do not use a live consumer directory containing unmanaged dependencies.
Local Pi registration points at this directory, so later rebuilds affect the
next load/reload; document that this is not an installed immutable copy.

## Implementation sequence

### 1. Establish the package boundary and schema

- Resolve governing decisions through `ndr` before implementation, especially
  `w3z7h3`, `nes397`, `wvs5an`, `3772zz`, `7rmqea`, `cp4rfn`, and `jmeae1`.
- Record the standalone package compilation and explicit-resource contract as
  a decision before fixing its schema/API.
- Allow explicit `artifacts: []` in `src/definitions.ts` when the package has a
  producing payload declaration; continue rejecting metadata-only shells.
  Check meaningful loadable Pi resources at target compilation, not by trying
  to infer arbitrary native metadata in the shared schema.
- Add an optional package compilation capability to `TargetAdapter`; leave
  `pi.marketplace` unset and reject unsupported package targets clearly.
- Extract only the shared package-input resolution required from
  `src/compiler.ts`: metadata overrides, native fields, artifacts, payloads,
  authoring keys, and provenance. Do not create fake marketplace files.

### 2. Implement pure Pi package planning

- Add target-owned Pi package compilation, preferably `src/targets/pi-package.ts`.
- Generate the manifest and copy payloads without reading/importing code in the
  pure compiler. Loading supplies any required source data beforehand.
- Reuse normalized payload routing and existing collision, symlink, containment,
  executable-mode, diagnostic, and staged materialization mechanisms.
- Produce package-root-relative outputs and a compilation plan with explicit
  provenance. Keep any plan-type extension minimal; shared code must not invent
  Pi policy or require a runtime registry.
- Project declared skills through the existing Pi projection, including warnings
  and authoring-key stripping; refuse unsupported artifacts such as package
  agents rather than implying leaf support means package support.
- Inspect `src/targets/package-payload.ts` for marketplace-root assumptions and
  extract an explicit package destination input where necessary.

### 3. Add checks and CLI

- Add `package compile` and read-only `package check`; keep existing commands unchanged.
- Reuse snapshot drift/mode/redaction/JSON checks without invoking marketplace
  registry validation. Ensure native manifest schema/identity checks also run
  for the standalone package path; current snapshot checks need extension here.
- Validate that every declared extension entry point and skill root resolves
  inside the output and exists in the plan/on disk as appropriate.
- Make target-owned resource validation plan-derived, not dependent on a CLI-only
  option, so library callers receive the same checks.
- Diagnose missing dependencies/unsupported manifest configurations only where
  static evidence permits. Do not promise that arbitrary imports will resolve.

### 4. Verify packaging in Pi and document the boundary

- Add `scripts/pi-extension-acceptance.ts` and a corresponding npm script.
- Pin and record the acceptance runtime version; 1.1.0 is the starting candidate,
  not a compatibility claim about every Pi version.
- Run from disposable package and consumer directories with isolated Pi state.
  Do not touch personal settings, credentials, or existing extensions.
- First exercise extension loading without a model call using a deterministic
  registration/session-start marker. Then verify actual event-handler behavior
  and a blocked tool call through a deterministic SDK harness or explicitly
  authorized isolated model run.
- Exercise local user/project registration, project trust behavior, disable/remove,
  reload/shutdown cleanup, relative helper imports, assets, and mixed skill discovery.
- Exit nonzero on any failed assertion; missing runtime prerequisites must not
  produce a success verdict. Record unexercised cases as gaps.
- Update README/package examples, CLI help tests, `docs/limitations.md`, and a
  new `docs/pi-extension-acceptance.md`. Hook translation remains unsupported.

## Dependency and execution policy

- Runtime third-party imports belong in native `dependencies`.
- Host-provided Pi packages belong in `peerDependencies`, not copied dependencies
  or vendored `node_modules`. Verify the host list against the pinned runtime.
- Compilation does not install dependencies. For a local package, provision
  them separately in a disposable consumer copy before acceptance.
- npm/git consumers may have dependency installation/lifecycle behavior owned
  by Pi/the package manager. Shipping a lifecycle script is not executing it
  during AgentForge compile/check; document the distinction.
- Static checks establish package integrity only. They do not certify extension
  safety, blocking semantics, import compatibility, or event correctness.

## Test and acceptance checklist

- [x] Extension-only and mixed skill/extension fixtures compile deterministically.
- [x] Extension/supporting payload bytes and intended executable modes survive.
- [x] Helper modules are not accidentally registered as extensions.
- [x] Metadata identity, explicit resource lists, and open native fields are tested.
- [x] Missing entry points, traversal, symlinks, output/source overlap, duplicate
      destinations, case-insensitive collisions, and manifest replacement fail safely.
- [x] Unsupported package artifacts fail before any staged output is published.
- [x] Existing output survives failed compilation/staging; successful rebuild prunes stale files.
- [x] Check reports changed/missing/unexpected files, invalid manifests, unsafe
      content, and broken resource references without writing.
- [x] Payloads and lifecycle scripts that leave execution markers are never run
      by compile/check; package manager invocation is also prohibited in those paths.
- [x] Missing local dependencies fail visibly at runtime; provisioning them in
      an isolated consumer copy permits successful loading.
- [x] Pinned Pi acceptance establishes loading, discovery, handler behavior,
      blocking where tested, trust/disable behavior, reload and SDK cleanup.
      Native terminal-exit/signal cleanup and `index.ts` directory-entry-point
      acceptance remain unexercised; see the acceptance report.
- [x] Full tests (649 pass, one optional native-validator skip), 127 unchanged
      snapshots, typecheck, lint, decision-ledger health, and compiled-binary smoke pass.
      Lint retains the pre-existing informational Biome schema-version mismatch.

## Definition of done

A package author can declare existing Pi-native extension source, compile a
standalone package, check its integrity, and explicitly load/install it through
Pi. Extension bytes remain unchanged, resource discovery is verified, builds
execute no supplied code, and documentation distinguishes packaging support
from hook translation and runtime guarantees.

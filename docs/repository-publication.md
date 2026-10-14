# Repository publication

`agentforge.yaml` is the lowercase repository orchestration definition. It
combines existing Claude/Codex marketplace compilation and standalone Pi package
compilation without inventing a native Pi marketplace or changing the legacy
`MARKETPLACE.yaml` / standalone package interfaces.

```sh
agentforge compile ./agentforge.yaml
agentforge check ./agentforge.yaml
agentforge check ./agentforge.yaml --json
```

These commands take the config path explicitly. Output locations belong to the
configuration: there is no `--out` override or report-file option in this first
interface. `check --json` writes its report to stdout. Neither command installs
packages, runs source code, evaluates extensions, invokes package managers, or
performs runtime acceptance.

## Governing decisions

- ndr:r8pc2n — additive repository schema and explicit publication roots.
- ndr:a6vt9k — per-target artifact-list replacement.
- ndr:u7mp3c — whole-repository preflight and sequential snapshot failure boundary.
- ndr:c9rq4w — aggregated read-only checks with a versioned repository envelope.

These add repository-specific contracts; legacy ndr:nt12pb, ndr:gf2904,
ndr:s1g5yf, and ndr:yxz3mj remain current within their existing scope.

## Configuration

```yaml
schema: agentforge.repository/v1
id: example-agents
defaults:
  name: example-agents
  description: Shared Claude, Codex, and Pi sources
  owner:
    name: Example Author
packages:
  - plugins/commit/PACKAGE.yaml
publications:
  - id: claude
    kind: marketplace
    target: claude
    out: marketplaces/claude
    destination: .claude-plugin/marketplace.json
    enrollment:
      mode: all-compatible
    root-manifest: true
  - id: codex
    kind: marketplace
    target: codex
    out: marketplaces/codex
    destination: .agents/plugins/marketplace.json
    enrollment:
      mode: include
      packages: [commit]
  - id: commit-pi
    kind: package
    target: pi
    package: commit
    out: packages/pi/commit
redactions:
  - private-repository-term
```

- The schema is strict: unknown configuration keys are errors. `id` is a slug.
- `packages` is a nonempty explicit list of canonical `PACKAGE.yaml` paths,
  relative to the directory containing `agentforge.yaml`. No globs or adjacent
  `PACKAGE.pi.yaml` entries are accepted here. Package IDs must be unique.
- `defaults` uses the existing marketplace metadata shape (`name`, optional
  `description` and `owner`). It is required when any marketplace publication
  exists, and optional for a repository containing only package publications.
  Standalone package metadata still comes from that package's own defaults.
- Publications are distinguished by `kind`. IDs are unique across both kinds.
  A marketplace entry retains the existing `id`, `target`, `destination`,
  `enrollment`, optional `native`, and optional `root-manifest` fields, and
  requires `out`. A package entry has exactly `id`, `kind`, `target`, `package`,
  and `out`; `package` selects a canonical package ID from the declared universe.
- Marketplace targets remain Claude and Codex; standalone package compilation
  remains Pi-only. Configuring a publication does not grant a target a capability.
- `all-compatible` enrollment selects packages declaring the marketplace target;
  `include` validates the named subset against that same universe and support.
- Optional `redactions` are literal substring vocabulary, not regular expressions,
  and use the existing output-content check semantics. They do not rewrite output.

## Per-target artifact selection

A canonical package can select a different artifact list for each target without
forking the package definition or duplicating sources:

```yaml
schema: agentforge.package/v1
id: commit
defaults:
  name: commit
  version: 1.0.0
artifacts:
  - type: skill
    pattern: skills/*/SKILL.md
  - type: hook
    pattern: hooks/hooks.json
targets:
  claude: {}
  codex:
    native:
      interface:
        displayName: Commit
        category: Development
  pi:
    artifacts:
      - type: skill
        pattern: skills/*/SKILL.md
    native:
      pi:
        extensions: ['./pi/guard.ts']
    payloads:
      include:
        - source: pi/guard.ts
```

`targets.<target>.artifacts` **replaces**, rather than merges with, the top-level
`artifacts` list. Omission inherits the shared list; an explicit `[]` selects no
artifacts for that target. Empty selection is useful for native payload-only
packages but does not waive producing-payload or loadable-resource validation.
Selected declarations still use existing pattern matching, projection,
compatibility/loss, payload, and collision rules. Artifact matches must stay
inside their package directory, including physical containment; escaped matches
are refused before their contents are read. An omitted artifact that still ships
as a skill resource or supplied resource payload remains subject to that target's
compatibility checks. Unsupported artifacts are not silently filtered. This is package authoring behavior, not a new target capability
and not automatic selection based on an adjacent filename.

## Explicit outputs and ownership

Every `out` is a normalized, portable, config-relative owned snapshot root. The
publication writes directly beneath that root: **no implicit publication-ID
prefix** is added. In the example, the Claude registry is
`marketplaces/claude/.claude-plugin/marketplace.json`, and the Pi manifest is
`packages/pi/commit/package.json`.

Do not place dependencies, unrelated consumer data, or canonical sources in an
owned output root. Snapshot replacement removes stale files inside it. Publication
IDs identify reports and planning entries, not filesystem layout.

For a marketplace publication with `root-manifest: true`, AgentForge additionally
owns the exact registry file at `<config-root>/<destination>`. Its local package
sources point into the actual declared `out`, not an assumed `<out>/<id>` tree.
The registry inside the snapshot remains suitable for installation from that
snapshot's own root. Only the root registry file is managed at config root;
its siblings are neither pruned nor counted as unexpected output.

The legacy interface is unchanged: `marketplace compile/check <MARKETPLACE.yaml>
--out <base>` still uses `<base>/<publication-id>/` and its existing root-manifest
rewriting. Standalone `package compile/check` still takes `--target` and `--out`
and still supports explicitly selected target-suffixed definitions through
`loadStandalonePackageDefinition`. Marketplace and repository loading remain
canonical-only. See ndr:nt12pb, ndr:gf2904, ndr:s1g5yf, and ndr:yxz3mj.

## Planning and failure boundary

`compile` completes a read-only **whole-repository preflight before any write**:
load the declared packages, derive every publication plan, and validate all source
and destination boundaries together. It rejects:

- Absolute paths, traversal, nonnormalized or nonportable paths, and symbolic-link
  paths beneath the config root.
- Duplicate or nested output roots, aliases (including case/Unicode portability
  aliases), and overlapping owned paths.
- Output roots overlapping canonical source directories, or named root outputs
  overlapping the repository configuration itself.
- Root-registry named-file collisions with another managed output, output root,
  or source directory, including file/directory conflicts.
- Invalid enrollment, unsupported target capabilities, and the existing per-plan
  artifact, payload, native-document, and destination collisions.

A preflight failure writes nothing. After successful preflight, publications are
materialized sequentially in deterministic order using recoverable complete
snapshots. The first runtime publication failure stops compilation; earlier
successful publications remain published. Recovery protects each snapshot, not
an all-or-nothing transaction across the repository or its root registry files.
Root registries retain the existing exact-file writer: they are written after
the snapshot publishes and are not part of its rollback. A root-registry write
failure can therefore leave that publication's new snapshot in place.

There are no publication receipts and no orphan-output deletion. Removing a
publication or changing its `out` does not remove its former tree or root registry.
Review and remove those paths separately; do not treat a successful check as proof
that the repository contains no old publication outputs.

## Read-only check and JSON

`check` derives the same plans and checks native validity, managed bytes, modes,
missing files, and unexpected files within each current owned snapshot, plus exact
root-registry drift where declared. It aggregates planning failures and drift
findings across publications rather than stopping at the first bad entry. Invalid
configuration and any planning or drift error yield a nonzero exit; nonfatal
translation notes and warnings retain their existing behavior.

`check --json` emits a **versioned repository envelope** (`schemaVersion: 1`),
with `config`, optional `repositoryId`, aggregate `status`, an `errors` array,
and `publications` entries. Entries identify `id`, `target`, `out`, and `status`;
successfully planned checks nest the existing check report under `report`.
Planning failures appear in `errors`, associated with a source or publication
where available. Nested reports
retain their own version and existing issue/diagnostic contract; the envelope is
not a relabeled marketplace check report. Consumers must inspect the repository
status and entry outcomes, not infer success from one nested empty issue list.
No writes, source evaluation, extension execution, or package-manager processes
are required to check a repository.

## Migration boundary

Adoption is opt-in. All existing artifact, marketplace, standalone package, and
Codex agent lifecycle commands remain available with their existing contracts.
The earlier removal of flat resource-command aliases is unrelated to these new
top-level repository commands.

Consumer repository migration is **separate and pending**: this change does not
rewrite another repository's definitions, workflows, generated trees, root
registries, or runtime registrations. Before a future migration, preview package
selection and output ownership, preserve existing native installation paths,
review stale-output cleanup explicitly, then compile/check and perform separately
authorized runtime acceptance. A successful static check is not runtime evidence.

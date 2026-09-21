# AgentForge roadmap to 1.0

The numbered roadmap labels are implementation slices, not released package
versions. Semantic-release assigns package versions from commits on `main`.

## Completed foundation

- **0.5 — target projection architecture:** one target registry and one adapter
  per harness, with marketplace compilation as an optional target capability.
- **0.6 — scoped skill installation:** explicit user, project, and plugin
  scopes; Pi skill support; plan-derived installed-state checks.
- **0.7 — materialization convergence:** standalone render and install produce
  compilation plans and publish through the same staged materializer. Recorded
  as change `rsuzoxko`, commit `2cbcb8ff`.

## 0.8 — canonical agents

Make `agent` a first-class leaf artifact and use that same canonical model from
marketplace compilation.

Current progress: `AGENT.md` is registered as a file-layout leaf artifact and
renders to Claude's native named Markdown format and Codex's native agent-role
TOML, both using the package parser's canonical agent schema. Codex plugin
packages cannot register agent roles as of codex-cli 0.155.1
(`docs/limitations.md` L-010), so marketplace agent translation keeps the
Markdown-procedure fallback for Codex until that changes upstream. Claude leaf
agents install at user, project, and plugin scope; Codex leaf agents install at
user and project scope. Every file-layout install owns only its planned paths
(`ndr:hjnabw`). At Claude plugin scope, the plan is anchored at the package root
so the agent lands under `agents/` and its declared resources land under
`references/`, `scripts/`, and `assets/`, where `${CLAUDE_PLUGIN_ROOT}` resolves
them. User/project installs remain one-file and report plugin-root references
as scope-gated through the typed capability result (`ndr:k58f71`); reports
classify that condition after settled non-losses and before unknowns
(`ndr:7r7n44`). Other target projections and marketplace reuse of the Codex
leaf projection remain. The filename, required identity, and default layout are
recorded in `ndr:2t36rb`.

### Boundary

1. Extend `ArtifactType`, `ARTIFACT_DEFS`, projection, installation, and checks
   for one canonical agent artifact.
2. Reuse or lift `CanonicalAgentBehavior` from `src/agent-command.ts`. Do not
   create a second agent schema beside the package parser.
3. Preserve the existing authoring contract: target frontmatter is a field-level
   deep merge over shared frontmatter, while `targets.<name>.body` replaces the
   complete body. AgentForge does not add partial templates.
4. Keep native mapping in each target adapter. Shared code carries AgentForge's
   canonical meaning; it does not enumerate vendor-specific model or tool
   dialects.
5. Once leaf projection is stable, make marketplace agent translation consume
   it. The current Codex reusable-procedure mapping remains the fallback only
   where native registration is unavailable or deliberately unsupported.

### Semantics to represent

- Shared description and instruction body.
- Per-target model and reasoning-effort selection.
- Turn limits.
- Tool allowlists or permissions.
- Native registration and invocation role.
- Isolation, delegation, and same-agent follow-up where the runtime establishes
  them.

Successful file generation is not evidence that these semantics work. A target
must translate them to a native equivalent, retain them with an explicit
unenforced diagnostic, or reject/omit the projection when required behavior
would disappear.

### Start here

- `src/types.ts` and `src/schema.ts` — artifact enumeration and canonical schema.
- `src/agent-command.ts` — existing canonical agent behavior parsed from package
  sources.
- `src/target-adapter.ts` and `src/targets/*.ts` — leaf projections, native
  schemas, install locations, and target-owned policy.
- `src/targets/claude-marketplace.ts` and
  `src/targets/codex-marketplace.ts` — current package agent translations.
- `src/compatibility.ts`, `src/capabilities.ts`, and
  `docs/limitations.md` L-008 — execution settings currently lost or
  under-reported.
- `tests/agent-command.test.ts`, `tests/render.test.ts`, and
  `tests/fixtures/definitions/cc-marketplace/packages/librarian/` — existing
  parser, projection matrix, and representative package fixture.

### Governing decisions

- `ndr:9n1m1a` — model a target as an agent that cites and constrains a file
  specification.
- `ndr:w3z7h3` — give each target one adapter, with marketplace compilation as
  an optional capability.
- `ndr:nes397` — admit adapter members only for questions about the target.
- `ndr:h3aggj` — use field-level frontmatter merge and full body replacement;
  do not add templating.
- `ndr:66z1f5` — declare construct surfaces per target and artifact.
- `ndr:msdg46` — current Codex role-procedure mapping, explicitly revisitable
  when registered agents have stable package semantics.

Resolve these references through the `ndr` CLI before implementation so
supersession is applied. Capture a new decision before fixing a canonical
filename or schema rule that the current heads do not decide.

### Evidence still required

- Complete fresh installed-runtime acceptance for Claude Code and Codex. Their
  documented leaf formats and discovery locations are encoded; generated files
  alone do not prove discovery or enforcement.
- Establish which runtimes enforce model, effort, turns, tools, isolation,
  delegation, and follow-up continuity. Prompt prose does not count as
  enforcement.
- Keep OpenCode and Pi agent support explicitly deferred beyond 1.0; non-agent
  target presence does not imply agent support.

### Validation gates

- Add a target-by-agent fixture matrix with explicit unsupported cases.
- Keep projection pure and route every write through the shared compilation
  plan and materializer.
- Test field-level overrides and whole-body replacement.
- Test diagnostics for each execution setting that cannot be preserved.
- Reuse the agent projection from marketplace compilation and reject generated
  destination collisions.
- Run unit tests, snapshots, typecheck, lint, standalone binary smoke, native
  validators, and fresh runtime acceptance where available.

Librarian is the 0.8 acceptance package. Its `vault-reader` role exercises
model/effort/turn settings, read-only tool restrictions, isolated delegation,
same-agent follow-up, and shared references. Each claim must be recorded as a
documentation claim, generated-artifact finding, or observed runtime result.
The current evidence and target-specific disposition are recorded in
[`librarian-agent-acceptance.md`](librarian-agent-acceptance.md); package and
leaf-agent results must remain separate. Explicit project-role selection is
accepted on codex-cli 0.155.1; plugin registration remains unsupported. See
`docs/limitations.md` L-010 through L-012.

## 0.9 — hooks

Generalize target-native hook projection around Commit. Verify event payloads,
plugin-root paths, executable modes, failure behavior, and actual blocking
semantics separately for each harness. Langfuse follows once lifecycle events
and trust requirements are established. A harness without the required
blocking behavior is explicitly unsupported.

## 1.0 — corpus acceptance and publication

- Use Compass for discovery and explicit-only invocation.
- Use Teach for explicit-only invocation, approval-before-write behavior,
  stateful vault workspaces, and truthful degradation when a source integration
  is unavailable. Track generated and pending runtime evidence in
  [`teach-runtime-acceptance.md`](teach-runtime-acceptance.md).
- Use Librarian for registered agents, execution settings, delegation,
  continuity, and resources. Its collaborator dispatches are covered by the
  `body-agent-reference` gate (ndr:c5haze) and declared as a Codex loss; that
  gate resolves names **package-locally**, so it says nothing about a body
  naming another package's agent. Widening it is Fibery Charting #23, and is
  deliberately outside 1.0.
- Use Commit for hooks, executable scripts, payloads, and blocking.
- `attention-workflow` is out of 1.0 scope. It is unused, and is slated for
  removal from `jdh-agents` rather than for a verified support boundary, so
  proving where its structural guarantee survives projection buys nothing.
  Until it is removed it stays in the corpus and compiles like any other
  package; 1.0 simply makes no claim about it.
- Compile, check, publish, and install the complete `jdh-agents` corpus.
- Retire redundant generated native maintenance only after the replacement
  workflow passes its runtime acceptance gates.

The 1.0 support statement must distinguish intended behavior, emitted native
artifacts, and behavior verified in a fresh harness.

# agentforge

Renders canonical AI agent artifacts into per-harness outputs, and reports what does not survive the translation.

## Language

**Artifact**
The type of canonical thing being rendered. `skill` and `output-style` are implemented today; `agent` and `mcp` name planned artifact types and do not yet belong to `ArtifactType`. Each implemented artifact has a canonical filename, a canonical schema, and a layout.

**Target**
The harness consuming the output: `claude`, `opencode`, `codex`, `pi`, `claude-chat`. A target may support a subset of artifacts.

**Scope**
Where an installed artifact lands on a target: `user`, `project`, or `plugin`. A target declares an install location per scope it supports, and those declarations are normative — agentforge writes to them. A target with no location a harness reads, such as `claude-chat`, declares none.
_Avoid_: level, tier, location
_See_: ndr:d17fnt

**Publication**
A per-target build: an id, a target, a destination, and an enrollment of packages. Despite the name it is not the published thing — it is the instruction to build one. `compile` reads its publications from a marketplace definition; `install` synthesizes one whose destination is resolved rather than declared.
_Avoid_: release, deployment, build target
_See_: ndr:s1g5yf, ndr:t6sykj

**Package**
One bundle of artifacts with an id, declared by a `PACKAGE.yaml`. This is what a harness calls a *plugin*. The code says `package` throughout, because `plugin` names the harness's installed form rather than the source agentforge compiles.
_Avoid_: plugin
_See_: ndr:3xe5wv

**Install**
Placing an artifact where a harness reads it, at a resolved scope. Not a separate pipeline: an install is a publication whose destination agentforge resolves from `(target, artifact, scope)` instead of the caller naming it.
_Avoid_: deploy, copy, sync
_See_: ndr:d17fnt, ndr:t6sykj

**Projection**
What projecting an artifact onto a target yields before any destination is known: the rendered canonical content, any generated companion files, and the resources to copy — all at paths relative to the artifact's own directory. Pure, with no filesystem access. Both entry points share one projection step.
_Avoid_: render output, result
_See_: ndr:t6sykj

**Desired output**
One file a plan says will exist: a destination plus generated text, generated binary content, or a source path to copy from. Carries the target that produced it, and — when it is a native document — that document's schema, role and grammar accessors. The unit every entry point produces and the materializer consumes.
_Avoid_: file, artifact
_See_: ndr:t6sykj, ndr:zjnfjm

**Surface**
A distinct consumption context within one target, with its own capabilities. Three exist: `skill`, `prompt`, and `hook`; Codex has a capability row for each. Which surface a projected artifact lands on is declared per `(target, artifact)`, not assumed — an artifact type may own a non-skill surface.
_Avoid_: context, channel
_See_: ndr:g6xvyk, ndr:66z1f5

**Construct**
Something that carries meaning on Claude and has no equivalent on another target. An agent's tool allowlist, a command's allowed-tools list, an MCP tool name, a body template variable, shell injection, or a file reference.

**Construct family**
The general shape a construct matches, before any judgement about whether a target supports it. Matching is by family; classification is by lookup.
_See_: ndr:g6xvyk

**Capability table**
The checked-in record of which constructs each `(target, surface)` pair supports, carrying a documentation citation per row.
_See_: ndr:g6xvyk

**Unclassified construct**
A construct-shaped string with no capability-table entry. Reported, never gated.
_See_: ndr:szdn5s

**Loss**
A construct whose meaning does not survive to a target. Either the construct is removed from the output, or it survives as text the target ignores.
_Avoid_: disposition
_See_: ndr:728mf7, ndr:5ymhmg

**Declared loss**
An author's on-the-record acknowledgment of a loss, naming the construct, its state, and what a target's user therefore does not get. Held under a target's `losses` key. Covers only losses that would otherwise be silent — a loss already reported elsewhere never appears.
_Avoid_: disposition, waiver, exemption, exception
_See_: ndr:5ymhmg, ndr:k9r6pc

**State**
What became of a construct on a target: `stripped` (removed from the output) or `retained-unenforced` (present in the output, ignored by the target). A state only ever describes a loss — a construct that survived has no state.
_Avoid_: disposition, effect, outcome, action
_See_: ndr:e9jc29

**Omission**
Something in source that is absent from output with no diagnostic naming it — a file the compiler does not carry, or a declaration it never reads. A sibling of loss, not a kind of it: a loss is a *construct* whose meaning does not survive and therefore has a state, while an omission has no construct and no state, and the thing missing may be a whole file. The two also fail differently — a loss is reported and may be declared; an omission is by definition unreported, which is what makes it hard to notice.
_Avoid_: drop, skip, silent loss
_See_: ndr:5ymhmg, docs/limitations.md L-007

**Translated**
A construct a target's translator carries into a native equivalent, named in the capability table alongside what it becomes. Not a loss, so never declared; still reported, because an unreported translation is indistinguishable from an unscanned file. Distinct from an output's `translated` producer, which says how a *file* was made rather than what became of a *construct*.
_Avoid_: disposition, supported
_See_: ndr:5ymhmg

**Document class**
Whether a file's constructs are described or invoked. `reference` and `diagnostic` both mark a document whose constructs are documentation about Claude; both are exempt from construct scanning. Orthogonal to artifact type.
_See_: ndr:8b6rtp

**Instruction document**
A document that tells a model what to do, as opposed to one that documents a tool. Instruction documents name intent rather than tool identifiers.
_See_: ndr:8b6rtp

**Compilation report**
A file rendering one compilation's diagnostics — and, later, its counts and omissions — for a reader outside the terminal. Written outside the publication tree, so it is never an output. Always two words in prose: bare *report* stays the verb, meaning to emit a single diagnostic. The CLI flag `--report` is exempt, since no second sense competes inside an argv token.
_Avoid_: output report, run report, diagnostics file
_See_: ndr:3qqk1d

## Flagged ambiguities

**`state` against declarative-config convention**
In most declarative config a `state` field names *desired* state. Here it names *resulting* state. The canonical meaning is the resulting one.

**`publication` against its plain reading**
A publication sounds like the thing published. In this codebase it is the per-target *build configuration* — id, target, destination, enrollment — and the nesting a reader expects (artifacts inside a plugin inside a marketplace) is spelled artifacts inside a *package* inside a marketplace. A publication sits outside that nesting rather than naming a level of it. This mismatch caused a real modelling detour while ticket 7 was worked.
_See_: ndr:t6sykj

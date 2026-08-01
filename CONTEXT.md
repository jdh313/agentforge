# agentforge

Renders canonical AI agent artifacts into per-harness outputs, and reports what does not survive the translation.

## Language

**Artifact**
The type of canonical thing being rendered: `skill`, `output-style`, `agent`, `mcp`. Each has a canonical filename, a canonical schema, and a layout.

**Target**
The harness consuming the output: `claude`, `opencode`, `codex`, `claude-chat`. A target may support a subset of artifacts.

**Surface**
A distinct consumption context within one target, with its own capabilities. Codex has two: `skill` and `prompt`.
_See_: ndr:g6xvyk

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
_See_: ndr:rm06pf, ndr:4nshwv

**Declared loss**
An author's on-the-record acknowledgment of a loss, naming the construct, its state, and what a target's user therefore does not get. Held under a target's `losses` key. Covers only losses that would otherwise be silent — a loss already reported elsewhere never appears.
_Avoid_: disposition, waiver, exemption, exception
_See_: ndr:4nshwv, ndr:k9r6pc

**State**
What became of a construct on a target: `stripped` (removed from the output) or `retained-unenforced` (present in the output, ignored by the target).
_Avoid_: disposition, effect, outcome, action
_See_: ndr:e9jc29

**Document class**
Whether a file's constructs are described or invoked. `reference` and `diagnostic` both mark a document whose constructs are documentation about Claude; both are exempt from construct scanning. Orthogonal to artifact type.
_See_: ndr:8b6rtp

**Instruction document**
A document that tells a model what to do, as opposed to one that documents a tool. Instruction documents name intent rather than tool identifiers.
_See_: ndr:grjvxz

## Flagged ambiguities

**`disposition` in code and ledger**
Code (`src/definitions.ts`, `src/targets/package-payload.ts`) and eight ledger atoms use `disposition` for two different things: the declared record, and the field naming what became of the construct. Canonical resolution is **declared loss** for the record and **state** for the field. The code and the `PACKAGE.yaml` key still read `dispositions`/`disposition`; the rename is unscheduled.

**`state` against declarative-config convention**
In most declarative config a `state` field names *desired* state. Here it names *resulting* state. The canonical meaning is the resulting one.

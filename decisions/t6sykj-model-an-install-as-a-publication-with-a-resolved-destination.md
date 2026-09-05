---
id: "t6sykj"
title: Model an install as a publication with a resolved destination
status: current
decision_date: 2026-09-05
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/render.ts
  - src/compiler.ts
  - src/materializer.ts
  - src/cli.ts
  - src/targets/package-payload.ts
  - src/definitions.ts
supersedes:
  - cp4rfn
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/7
informed_by:
  - jmeae1
  - s1g5yf
  - tfee0d
  - 3y1yvr
  - 2z51xz
  - gwxcfm
---

# t6sykj — Model an install as a publication with a resolved destination

## Decision

An install is a publication whose destination is resolved rather than declared.
One builder turns projected artifacts into desired outputs and one materializer
writes them; `compile` reads its publications from a marketplace definition,
and `install` synthesizes one from its arguments.

## Scope

- Binds: the boundary between projection, plan construction, and filesystem
  materialization, on both entry points.
- Does not bind: the registry, manifest and payload documents only a declared
  publication emits.
- Does not bind: how a resolved destination is computed, which is decided
  separately.

## Commitments

- Loading gathers inputs and projection stays free of filesystem I/O; every
  output write goes through the one materializer, and no other caller writes an
  output file itself.
- A synthesized publication carries a degenerate id and a single-artifact
  enrollment rather than a distinct type, so one plan shape serves both entries.
- Standalone output becomes plan-shaped, so a check derived from the plan can
  compare an installed artifact against its source.
- The standalone entry inherits the staged atomic publish, executable-bit
  normalization, symlink refusal and destination-collision rejection the
  marketplace entry already performs.
- Bundling a projected directory into an archive becomes a step over a published
  tree, not a branch inside the writer.

## Revisit if

- An install needs an output the plan shape cannot represent.
- Replacing the destination tree wholesale is wrong for a destination agentforge
  does not own outright.
- Streaming materialization becomes a product requirement.

## Context

- `render.ts:290` and `package-payload.ts:75` both call `projectArtifact` and
  receive the same projection, whose paths are relative and whose construction
  touches no filesystem.
- `render.ts:312-326` writes that projection to disk directly, iterating the
  canonical file, the generated files and the resources.
- `package-payload.ts:76-107` iterates the same three collections, rebasing each
  onto a package directory and emitting desired outputs a materializer writes
  later.
- The standalone path performs no staged publish, sets no executable bit, does
  not validate symlinked sources, and resolves colliding destinations by last
  write.
- `definitions.ts:202` models a publication as an id, a target, a destination and
  an enrollment; the standalone command supplies a target and a destination as
  flags and a source directory as its enrollment.
- `materializer.ts` was added two and a half hours after `projectArtifact` was
  extracted, and its commit records no consideration of the write path that
  already existed.
- A decision recorded that same afternoon requires marketplace output to publish
  as a staged, recoverable whole-plan snapshot; the standalone writer was never
  asked to satisfy it, and the only account the two writers have ever been given
  is that requirement.
- The standalone writer predates package compilation by two and a half months:
  it shipped in the initial commit, with projection and writing fused, and the
  package path arrived only afterwards.
- Each writer resolves artifact layout on its own — the standalone one branches
  on the artifact's layout at `render.ts:301`, the package path handles the skill
  artifact at `package-payload.ts:75` and routes every other artifact type to a
  separate translator — so an added artifact type is taught to both.
- The two write halves have not diverged since; the standalone half changed once
  in seven weeks, through the shared projection.
- The predecessor decision named the standalone renderer as the filesystem
  materialization wrapper and scoped output writes to materialization layers
  such as it.

## Why

That account does not survive inspection. The per-artifact writer cannot publish
a whole-plan snapshot because it has no whole-plan value, and the missing value
is the thing in question — so the contract difference is a consequence of the
shape difference rather than a justification for it. The record says as much by
saying nothing: the second writer arrived without argument, in a tool that had
rendered native files alone for two and a half months before it learned to
assemble packages.

The predecessor's principle survives intact and is strengthened here. Keeping
compilation free of filesystem I/O, keeping projection pure, and concentrating
writes at one boundary are all upheld — and the second entry point now obeys
them too, where before it interleaved projection and writing in a single pass.
What does not survive is the predecessor naming the standalone renderer as that
boundary. After this it plans and no longer writes, which is why this supersedes
rather than clarifies; the predecessor's own wording anticipated the possibility
by scoping writes to materialization layers *such as* that one.

Synthesizing a publication rather than sharing a smaller helper is worth the
degenerate id, because the fields line up with no slack. A publication is a
target, a destination and an enrollment; the standalone command already supplies
exactly those three, as flags instead of as a file. Modelling it any other way
means maintaining a second vocabulary for the same three values.

The payoff is concentrated where the map says the cost is. Adding an artifact
type currently means teaching materialization twice, which is what makes the
artifact axis expensive; after this it is taught once. And a plan is what
derived checks read, so an installed artifact becomes checkable against its
source — something the standalone path structurally could not offer, because it
produced no value for a check to read.

## Alternatives

- **Shared core with two thin callers** — rejected: it converges the writing and
  leaves the modelling split, so a second vocabulary for target, destination and
  enrollment survives with nothing to justify it.
- **Documented two-path split** — rejected: the documented reason is circular,
  and the artifact axis pays the cost of it on every new artifact type.
- **Give the standalone path its own staged publish rather than sharing one** —
  rejected: it duplicates the one piece of this machinery that is genuinely
  subtle, and duplicating failure-recovery logic is where drift is most
  expensive.

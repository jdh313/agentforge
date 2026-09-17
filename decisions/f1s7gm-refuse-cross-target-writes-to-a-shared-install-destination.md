---
id: "f1s7gm"
title: Refuse cross-target writes to a shared install destination
status: current
decision_date: 2026-09-17
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/install-collision.ts
  - src/install.ts
supersedes: []
superseded_by: []
derived_from:
  - "Fibery task #100 — AgentForge: shared-directory install destination"
informed_by:
  - hjnabw
---

# f1s7gm — Refuse cross-target writes to a shared install destination

## Decision

An installation refuses to write a destination that already holds a different target's projection of the same source. Ownership is decided by comparing the bytes on disk against the projection of every other target whose install location resolves to that same destination; no ownership marker is recorded anywhere.

## Scope

- Binds: destination arbitration in `install` and `check-install`.
- Does not bind: `render --out`, which writes a caller-named directory, or marketplace compilation, which plans every output in one pass.
- `install` refuses; `check-install` reports the same finding as a diagnostic, because it is read-only.

## Commitments

- Every install and check-install re-derives the projection of each other target that resolves the same destination, so install cost grows with the number of targets sharing a location.
- The detector must stay total: a destination it cannot read yields no collision rather than an exception, since `check-install` is contracted not to throw.
- Detection and the write are separate steps, so two concurrent installs of different targets can both pass the check and the later one still wins.
- A target's projection must remain a pure function of source and target; a projection that varied per run would make the comparison meaningless.

## Revisit if

- A target gains a plugin-scope location that no longer resolves to `<pluginRoot>/skills`, leaving no shared destination to arbitrate.
- A silent overwrite from an edited-between-installs source is observed in practice.
- agentforge acquires durable install state for some other reason, making a provenance record free.

## Context

- `claude`, `codex` and `pi` each resolve plugin-scope skill installs to `<pluginRoot>/skills`, and all three harnesses read that path unnamespaced.
- Skill installation publishes by renaming the whole destination directory into place, so a second write replaces every byte the first one left.
- `install` accepts exactly one `--target` per invocation and has no `--all-targets`, so no single command ever observes two targets' intent.
- Neither ownership mode records which target wrote a file, and nothing else on disk names a writer.
- A projection is derived from the source directory and the target alone.

## Why

The write that destroys is a directory rename, and a rename carries no provenance — nothing on disk answers "who put this here". Absent new state, the only evidence available at install time is the bytes themselves. Because a projection is derived from source and target alone, re-deriving each candidate target's projection converts that unanswerable question into a comparison the compiler can already perform, which is what makes a stateless answer possible at all.

Refusing rather than merging follows from the directory holding one copy: every harness pointed there reads the same file, so there is no arrangement of bytes that serves two targets whose projections differ. The user is the only party who can resolve it, by choosing separate destinations.

The residual gap — a source edited between two installs matches neither projection and overwrites silently — was accepted rather than closed. Closing it requires a durable ownership record, and that record is a published on-disk format agentforge would then have to version and defend for every consumer, which is a larger commitment than the failure it prevents.

## Alternatives

- **Sidecar install manifest** — rejected: it closes the edited-between-installs gap, but introduces a durable on-disk format that every consumer inherits and agentforge must version indefinitely.
- **Namespace the destination per target** — rejected: each harness reads `<plugin>/skills` unnamespaced, so a per-target subdirectory makes the output invisible to all three.
- **Emit one portable artifact at plugin scope** — rejected: identical bytes make the collision vacuous, but only by dropping the target-specific frontmatter the projection exists to produce.
- **Byte-diff against the destination with no cross-target check** — rejected: it cannot tell a different target's output from the installing target's own stale output, so it fires on every ordinary upgrade.

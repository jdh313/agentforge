---
id: "ckgw7z"
title: Keep target policy in the target's own module
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - repo-shape
binds:
  - src/check.ts
  - src/render.ts
  - src/root-manifest.ts
  - src/cli.ts
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/3
informed_by:
  - gwxcfm
  - ptwe8r
  - pgzfhy
  - wvs5an
  - 0sqm54
---

# ckgw7z — Keep target policy in the target's own module

## Decision

Policy lives in the module of the target that owns it. Code outside `src/targets/` does not branch on target identity: it obtains per-target schemas, paths, and values from the target's adapter and passes them through without inspecting which target supplied them.

## Scope

- Binds: shared modules that consume per-target values, currently `check.ts`, `render.ts`, `root-manifest.ts`, and `cli.ts`.
- Does not bind: how a target's own module is internally organised, nor the adapter construction shape settled by `ndr:ptwe8r`.
- Does not bind: the diagnostic code registry, whose two-family split is settled by `ndr:yxj9c6`.

## Commitments

- A target's adapter is the single source of its manifest paths, document schemas, and native destinations; a literal naming one of them appears in that target's module and nowhere else.
- Adding a target is a registry entry plus its own module. No shared file gains a case.
- A shared module needing new per-target knowledge widens the adapter interface rather than adding a branch, and the widened member is one every target can answer.
- Shared modules iterate the registry rather than naming targets, so a target absent from a shared file's imagination is no longer possible.

## Revisit if

- A shared consumer needs a distinction the adapter interface cannot carry without importing that target's vocabulary into the interface itself.
- Widening the interface for one consumer starts forcing every target to implement members it has no use for.
- A target requires host-specific invocation that no other target can express, as `cli.ts`'s external validator call currently does.

## Context

- `check.ts:367`, `:392`, `:405`, `:448-449`, and `:536-549` each re-derive which manifest path and which document schema belong to Claude versus Codex.
- `root-manifest.ts:119` and `check.ts:482` independently encode the same rule, that Codex nests a plugin source under `path` while other targets nest it under `source`.
- The two sites' path-safety rules have already diverged: `root-manifest.ts:143-149` checks upward escape on every source shape, while `check.ts:489-500` validates only `./`-relative sources and adds backslash and empty-segment rules the other lacks.
- `render.ts:196` gates behavior on one target by name, and `cli.ts:301` spawns the `claude` binary with no equivalent path for any other target.
- The `.claude-plugin` and `.codex-plugin` path segments appear as literals in four files.
- `ndr:ptwe8r` placed target-local policy in each target's file and left open what may read it.
- Five registry formats are expected once pi, hermes, and openClaw land, against two today.

## Why

The duplication that matters is not between the targets; it is outside them. Two marketplace adapters share 28 identical lines, which is cheap. A fifth target instead means edits scattered through `check.ts`, a file no target owns and no target's author would think to open — and that is precisely the hand-threaded edit the extensibility effort exists to remove.

Placement is also what makes the classification enforceable. A test that only labels code leaves the labels unverifiable: policy sitting in `check.ts` is still policy, correctly classified and still in the wrong file, and nothing catches it. Requiring policy to sit with its owner turns the classification into something a reader can check by looking at a path.

The evidence that this is the failing seam is already on disk. The one rule with an external owner — Codex nesting a source under `path` — stayed identical across both copies, because a vendor's format does not drift on its own. The rules agentforge owns, the path-safety checks, drifted apart in the same two files. Copies of policy hold; copies of mechanism rot, and the fix is not to copy either more carefully but to stop having two places that must agree.

Conviction is tentative because the commitment is stated ahead of the work. Nothing has moved yet, and the adapter interface that `check.ts` would consume does not exist, so the first real widening is where this either holds or shows its cost.

## Alternatives

- **Classify only; leave placement to its own ticket** — rejected: it leaves the largest finding of the investigation unaddressed and blocks nothing, so the leak survives untouched.
- **State placement as direction rather than commitment** — rejected: a direction that permits a branch anyway is indistinguishable from the current state, which already had a direction and five branches.
- **A string-keyed registry mapping target names to policy** — rejected: `ndr:ptwe8r` already refused the indirection the type checker cannot follow, and this decision needs no name lookup, only an interface.

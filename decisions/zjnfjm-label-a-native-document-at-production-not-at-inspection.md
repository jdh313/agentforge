---
id: "zjnfjm"
title: Label a native document at production, not at inspection
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - repo-shape
binds:
  - src/check.ts
  - src/compiler.ts
  - src/root-manifest.ts
  - src/targets/**
supersedes:
  - ckgw7z
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/20
informed_by:
  - gwxcfm
  - ptwe8r
  - h64w43
---

# zjnfjm — Label a native document at production, not at inspection

## Decision

The target that generates a native document attaches that document's schema, role, and grammar accessors to the output it produces. Shared consumers read the attached handle and never learn which target produced the file; they do not reconstruct a document's identity from its destination path.

## Scope

- Binds: shared consumers of generated outputs, currently `check.ts` and `root-manifest.ts`, and the generated-output types they read.
- Does not bind: how a target's own module organises what it attaches, nor the render pipeline's per-artifact configuration.
- Does not bind: which of two diverged path-safety implementations is correct, which is a defect and not a decision.

## Commitments

- Placement survives from the superseded decision: policy lives in the module of the target that owns it, and code outside `src/targets/` does not branch on target identity.
- A shared consumer needing new knowledge about a produced document obtains it from that output's handle rather than from a widened adapter member.
- A target that adds a native document type requires no edit to any shared file.
- Reading a document's own grammar is the producing target's job and is exposed as accessors, never as a key name that shared code indexes with.
- Path safety over a plugin source is agentforge's own rule and has exactly one implementation, callable from every site that needs it.

## Revisit if

- A shared consumer must validate a native document that no compilation produced, leaving nothing to have attached a handle.
- Attaching functions to plan outputs blocks a serialization of the plan that becomes necessary.
- Every target's document grammar turns out identical, making per-target accessors an abstraction nobody pays for.

## Context

- `check.ts:367`, `:405`, and `:533-556` each select a document schema by testing a destination suffix against a target name, with `:533-556` restating the whole mapping a second time.
- `check.ts:392` builds a plugin manifest path from a directory segment chosen by target name.
- `check.ts:448-449` recognises a marketplace registry from a two-element list of destination suffixes.
- `check.ts:477-487` and `root-manifest.ts:103-126` independently encode which key nests a plugin's source, one to read it and one to rewrite it.
- Every schema-validating site iterates `plan.outputs`; the directory walk at `check.ts:59` and `:69` only detects extraneous files and feeds no schema.
- The compiler adapter that generated each of those documents knew the document's schema and role at the moment it built it.
- `DesiredOutputBase` already carries a `producer` field describing how an output came to be.
- The predecessor's own revisit trigger named per-consumer interface growth as its failure condition.
- Five registry formats are expected once pi, hermes, and openClaw land, against two today.

## Why

The knowledge was never missing; it was discarded. A target builds a registry document and knows exactly what it built, and that certainty is thrown away so that a reader downstream can guess it back from a filename. Every one of the five duplicated sites is a reconstruction of a fact that was available for free a moment earlier, and reconstruction from a path is strictly weaker than the original — a renamed destination silently reclassifies a document, where an attached handle cannot.

The predecessor's remedy would have preserved the discard and merely made the guess legitimate: consumers would stop naming targets and start querying them instead. That trades five branches for an interface that grows one accessor per question a consumer thinks to ask, which the predecessor itself flagged as the way it would fail. Attaching the answer at production has no such gradient, because there is no shared interface to widen — a target that needs to say something new about its own document says it on the document.

That every schema-validating site already iterates the plan is what makes this safe rather than merely tidy. Nothing checks a file the compiler did not decide to produce, so an output either carries its producer's handle or was never a native document, and the "no adapter for this target" case that a lookup would have to defend against cannot arise.

The grammar accessors follow from the same reasoning one level down. A key name is a policy value that shared code then branches on by indexing, which satisfies the letter of the carrying rule and not its point; and a union of the nesting keys that exist today is a shared enumeration of vendors' alternatives, the ceiling refused on the schema axis and again on version pinning. Splitting grammar from safety also stops the two path-safety copies rotting further apart, without this decision having to say which of them is right.

Conviction is strong because the load-bearing facts were read off disk rather than projected: the adapter never held a document schema, and the plan is always in hand at the point of validation.

## Alternatives

- **Widen the adapter with recognition members and have consumers query it** — rejected: it keeps the production-time discard and grows the interface once per consumer question, the predecessor's own named failure mode.
- **Export the plugin-source nesting key as a `'path' | 'source'` union** — rejected: a shared union of vendors' alternatives that every future target must fit under or widen, and a target nesting its sources differently breaks it rather than widening it.
- **Pass the adapter list into `check`** — rejected: it rebuilds a name-keyed lookup and forces every consumer to handle a missing adapter, a state that cannot occur once the producer labels its own output.
- **Leave the reconstruction and accept the duplication** — rejected: it is already drifting, and a fifth target multiplies it rather than adding to it.

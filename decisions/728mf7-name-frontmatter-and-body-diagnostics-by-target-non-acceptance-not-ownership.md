---
id: "728mf7"
title: Name frontmatter and body diagnostics by target non-acceptance, not ownership
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/render.ts
  - src/types.ts
  - src/report.ts
  - src/schema.ts
  - src/compatibility.ts
  - src/definitions.ts
  - src/targets/package-payload.ts
supersedes:
  - rm06pf
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/2
informed_by:
  - vj6z18
  - g6xvyk
  - e9jc29
---

# 728mf7 — Name frontmatter and body diagnostics by target non-acceptance, not ownership

## Decision

A diagnostic states that a named target does not accept a key or construct, and never
states which target owns it. The declared-loss gate keeps its shape and applies to any
confirmed silent loss, but its subject is per-target non-acceptance resolved against the
key and capability tables rather than a Claude-owned category.

## Scope

- Binds: the vocabulary of frontmatter and body diagnostics and the category they resolve
  against.
- Does not bind: which constructs enter the declared-loss gate, or how a construct is
  translated.

## Commitments

- A diagnostic asserts only what the tables can prove, so its wording is answerable by a
  per-target membership query.
- Ownership of a key is not expressible in a diagnostic, and a future reader wanting it
  must add a table field rather than infer it from a code name.
- The distinction between a table saying no and a table having no row stays visible in the
  names, on both the frontmatter and body sides.

## Revisit if

- A diagnostic genuinely needs to name a key's originating target, and membership cannot
  supply it.
- The key and capability tables merge, collapsing the two vocabularies into one.

## Context

- `CLAUDE_ONLY_KEYS` is a hand-maintained constant whose name asserts single ownership.
- `allowed-tools` sits in that constant and is also defined by the Agent Skills spec, so
  the constant already states a falsehood.
- `disable-model-invocation` is accepted by four agents, none with a better ownership
  claim than the others.
- Per-key target acceptance now resolves against a checked-in key table.
- Claude supports neither the frontmatter superset nor the body superset: Hermes accepts
  inline shell in skill bodies.
- The body side already distinguishes an unsupported construct from an unclassified one,
  while the frontmatter side does not.
- The constant has a single consumer in the renderer.

## Why

Ownership was the load-bearing claim in the old names, and it is the one the tables cannot
substantiate. A membership model answers whether a target accepts a key; it cannot answer
who owns it without picking arbitrarily among agents with equal claims, and a name that
forces an arbitrary pick will be wrong for some reader every time it is read. Naming the
loss instead of the owner asserts exactly what is checkable.

The falsehood is not hypothetical, which is what moves this from tidiness to correctness.
A key the cited spec defines sits inside a constant asserting one agent owns it, and a
body construct a real target supports is reported as that agent's exclusive feature. Both
diagnostics would mislead a reader today.

Keeping the gate while replacing its subject is deliberate. The reason to require a
declaration where something vanishes unreported does not depend on which agent the thing
came from, so the gate survives its predecessor's vocabulary intact.

This supersedes rather than amends because its predecessor bound the gate's subject as
constructs that carry meaning on one named agent and have no equivalent elsewhere. That is
an ownership-framed definition, and redefining it as per-target membership changes what the
predecessor fixed rather than what it was called. An amendment would have been right had
only the vocabulary moved.

Deleting the constant rather than deriving it follows from the same reasoning. A derived
view would exist only to preserve a name whose claim has been rejected, and its sole
consumer can ask the table the question directly.

## Alternatives

- **Name the owner as the spec rather than Claude** — rejected: breaks for any key
  accepted by several agents but absent from the spec, which is already the case.
- **Keep the existing names and correct only the constant's membership** — rejected:
  leaves a name asserting ownership the model no longer has, and preserves the
  frontmatter side's missing distinction.
- **Derive the constant as a view over the key table** — rejected: retains a name for a
  category the decision removes, for one call site that can query directly.

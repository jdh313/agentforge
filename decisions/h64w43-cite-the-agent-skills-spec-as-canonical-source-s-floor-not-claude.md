---
id: "h64w43"
title: Cite the Agent Skills spec as canonical source's floor, not Claude
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/schema.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/2
  - https://agentskills.io/specification
informed_by:
  - 9n1m1a
  - vj6z18
---

# h64w43 — Cite the Agent Skills spec as canonical source's floor, not Claude

## Decision

Canonical source is agentforge's own flat schema, disciplined by the open Agent Skills
spec: keys the spec defines are validated under the spec's own constraints, and keys it
does not define stay at the top level. Canonical source is not itself a valid Agent
Skills document, and no target's dialect defines its shape.

## Scope

- Binds: the canonical frontmatter schemas and the validation applied to shared keys.
- Does not bind: emitted output shape, which the renderer owns, or the marketplace and
  publication layer, which no spec addresses.

## Commitments

- A shared key's validation tracks the cited spec, so tightening upstream is absorbed by
  editing the schema rather than by exempting the corpus.
- Canonical source may be stricter than a lenient target but never looser than the spec,
  so a compiled artifact cannot be rejected by a spec-validating consumer for a rule
  agentforge could have enforced.
- Adding a key the spec does not define is an agentforge-owned extension and needs a key
  table row, not a silent top-level addition.

## Revisit if

- The cited spec adds a constraint that a real target refuses to honor.
- A target agentforge renders to stops claiming compliance with the spec.
- The spec's governance lapses to the point that its constraints stop tracking any
  implementation.

## Context

- Codex and OpenCode both adopted the open Agent Skills spec, and pi and openClaw claim
  compliance too; Claude does not cite it.
- The canonical schema misses three keys the spec defines and carries fourteen invocation
  keys the spec does not model.
- The canonical `name` field permits leading, trailing, and consecutive hyphens that the
  spec forbids, and does not check the parent-directory match the spec requires.
- The canonical `description` field carries no length bound against the spec's 1-1024.
- An audit of all 87 canonical skills in the sole consumer corpus found zero name
  violations and one description 18 characters over the spec bound.
- The spec's `metadata` escape hatch is a free-form string map and cannot hold structured
  values.
- No standard addresses multi-target rendering, capability difference, or translation-loss
  reporting.

## Why

Modeling every non-Claude target as Claude-with-keys-removed described an ecosystem that
no longer exists, and the cost of the fiction was not aesthetic: the schema accepted skill
names that spec-validating consumers reject, so canonical source could already be invalid
for two shipping targets while compiling clean. A superset that under-validates its own
shared keys is not a superset, it is an unchecked union.

Adopting the spec's constraints without adopting its shape is what makes this cheap.
Nesting agentforge's keys under `metadata` would have reintroduced the per-agent namespace
container already rejected, and could not have worked regardless, because the values that
would need nesting are structured and the map holds strings. Keeping canonical flat leaves
projection where it belongs, in the renderer, and leaves the corpus untouched.

The migration cost being one description shortened by eighteen characters settles what
would otherwise be the strongest argument for leniency. Correctness that costs nothing is
not a trade.

## Alternatives

- **Canonical is a valid Agent Skills document** — rejected: requires the per-agent
  namespace container already rejected, and the spec's metadata map holds strings while
  the keys needing a home hold structure.
- **Canonical is spec-independent** — rejected: preserves a defect that lets canonical
  source be invalid for shipping targets, at no saving now that the corpus is known clean.
- **Keep Claude as the privileged superset** — rejected: Claude is demonstrably not the
  superset on frontmatter or on body constructs, so the privilege encodes a false claim.

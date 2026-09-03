---
id: "9n1m1a"
title: Model a target as an agent that cites and constrains a file spec
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/**
  - src/schema.ts
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/9
  - https://junglelan.fibery.io/Charting/Ticket/8
informed_by:
  - 17dhph
  - 0jd29k
---

# 9n1m1a — Model a target as an agent that cites and constrains a file spec

## Decision

A target names one consuming agent, and the unit reused between targets is the file spec a target cites. A target cites a spec and constrains it to the subset it accepts; vocabulary the spec does not carry is emitted under the spec's own metadata escape hatch rather than added to the spec.

## Scope

- Binds: the leaf-renderer target model and the per-artifact schema each target accepts.
- Does not bind: which agents agentforge ships adapters for, or the marketplace publication model, where a publication already names exactly one target.

## Commitments

- Two agents that accept identical output stay two targets; identical rendering is not evidence of one target.
- A target's accepted vocabulary is expressible as a spec subset plus a metadata namespace, or the spec is the wrong one to cite.
- Adopting a spec means adopting its constraints, including ones agentforge currently under-enforces.

## Revisit if

- A target's schema stops being expressible as a subset of a cited spec plus metadata.
- A cited spec starts forbidding the metadata escape hatch that carries agent-private vocabulary.
- Two agents converge on identical output across every artifact type, not only skills.

## Context

- Four consumers — Codex, OpenCode, pi, and openClaw — declare compliance with the open Agent Skills spec, and Claude does not.
- Every one of those four adds keys the spec does not enumerate, and pi additionally relaxes a rule the spec imposes on skill names.
- Hermes and openClaw already carry their private vocabulary in the spec's metadata map rather than at the top level.
- pi, hermes, openClaw, and Codex all read `.agents/skills`, so agent identity and output location are not the same distinction.
- The four existing target adapters were structurally identical for the one artifact type implemented, which invited reading them as one target.

## Why

Agent identity and file format are two distinctions that the single `TargetAdapter` concept had fused, and the fusion is what made the four adapters look interchangeable. Separating them lets the format be shared without claiming two agents are one thing — the reuse the duplication actually justified, without the modeling error it invited.

Constraining rather than extending is what keeps a cited spec worth citing. A target that extends its spec has a schema nobody else can predict, which is the snowflake state citing a spec was meant to escape; a target that constrains one stays legible to anything that knows the spec. That two independent implementations already chose the metadata map for exactly this is stronger evidence than any argument from first principles.

Keeping identical agents separate costs some duplicated output and buys correctness under divergence. The asymmetry favors separation: a wrongly merged pair breaks the day either agent adds a key, and the break surfaces as silently wrong output rather than a compile error, while a wrongly separated pair costs only redundant bytes.

## Alternatives

- **A target is a consuming agent, with no shared spec layer** — rejected: it preserves the modeling but keeps every schema a snowflake, which is the duplication that provoked the question.
- **A target is a distinct transformation, merging agents that render identically** — rejected: today's identity is an artifact of only the skill artifact being implemented; Codex, pi, and openClaw already diverge on the command surface.
- **A target is an output location** — rejected: four agents share `.agents/skills` while disagreeing on frontmatter, so location discriminates nothing.
- **Cite a spec and extend it per target** — rejected: union composition returns each target to a private schema and cannot express pi's relaxation of a spec rule.
- **Treat the spec as a canonical-side validator only** — deferred: honest about there being no reuse, which is the outcome this decision exists to avoid; the validation half is a real and separable question.

---
id: "gwxcfm"
title: Draw the policy line by authority, not variance
status: current
decision_date: 2026-09-04
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - scope
binds:
  - src/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/3
informed_by:
  - pgzfhy
  - wvs5an
  - 0sqm54
  - ptwe8r
  - h64w43
  - 9n1m1a
---

# gwxcfm — Draw the policy line by authority, not variance

## Decision

A piece of code is target-local policy when an authority outside agentforge judges it correct — the target's own installer, loader, or published format. It is shared mechanism when agentforge is that authority, and spec-owned when the judge is a file spec several targets cite. Shared code may carry a policy value it never inspects; branching on one makes it policy.

## Scope

- Binds: how any code under `src/` is classified, including adapter schemas, serialization, install-command construction, and per-target paths and key sets.
- Does not bind: where classified code physically lives, which is decided separately.
- Does not bind: whether duplicated mechanism must be extracted. The test classifies; it does not oblige a refactor.

## Commitments

- Shared code may hold a target-supplied policy value and may not branch on its meaning; a branch that becomes necessary moves into the target's own module.
- A shared surface may not grow a union enumerating targets' policy alternatives, because every future target would have to widen it.
- Two targets agreeing today is not grounds for sharing. A shared owner is: agentforge itself, or a spec both targets cite by name.
- Classifying code as mechanism permits sharing and never requires it; duplicated mechanism is weighed, not treated as a defect.

## Revisit if

- Agentforge publishes a format that targets adopt, making it the external authority for something it previously only consumed.
- Shared code cannot produce a correct output for every target without inspecting the meaning of a policy value.
- A spec several targets cite starts diverging per target in practice, so that citing it stops implying agreement.

## Context

- `claude-marketplace.ts:27-31` and `codex-marketplace.ts:107-111` declare a byte-identical `Author` schema, which neither target's published format presents as shared; both converged on an npm convention independently.
- `serialize()` is byte-identical at `claude-marketplace.ts:131-133` and `codex-marketplace.ts:573-575` and encodes no target's dialect — indentation, key ordering, and sorting do not vary by target.
- The identical set across the two marketplace files is 28 lines; of `codex-marketplace.ts`'s 586 lines, roughly 440 have no Claude counterpart, `translateHookConfiguration` alone accounting for 139.
- Hermes refuses branches and tags at install and requires a 40-character SHA, a constraint not expressible as a value in Claude's version-reference model.
- pi, hermes, and openClaw are all marketplace-capable, making five registry formats with no two alike.
- `ndr:h64w43` removed Claude's standing as the canonical superset on the schema axis and named no replacement.
- Three current decisions place marketplace translation, payload routing, and Codex install policy inside each target without stating a general test, so every dedup proposal argued from taste.

## Why

Variance reads a snapshot; authority reads who can change it. That difference decided all three cases this repository actually presents. Variance calls the byte-identical `Author` schema shared, when Anthropic can change what its `marketplace.json` accepts without consulting OpenAI. It calls `serialize()` shared for the same reason it calls `Author` shared, so it cannot tell a convention agentforge chose from a constraint a vendor imposes. And it called the duplicated path-safety logic in `check.ts` shared, where the copies had already drifted apart.

The carry-versus-branch rule is the half that does real work, because it is where a plausible refactor goes wrong. Passing a target-supplied value through untouched costs the shared layer nothing: it never learns what the value means, so a new target with a new value needs no edit. Inspecting one is different in kind. The moment shared code asks whether a pinning rule is SHA-only, the shared layer holds an opinion about the space of pinning rules, and that opinion is a ceiling every future target must fit under or widen. `ndr:h64w43` refused exactly that ceiling on the schema axis when it declined to let one target's model define the canonical superset; a policy enum in a shared module rebuilds it one axis over.

Naming a spec as a third authority is what keeps the test from collapsing into "agentforge decides everything not obviously target-shaped". `ndr:9n1m1a` already made the reusable unit the file spec a target cites, which is an owner outside agentforge that more than one target names. That gives a principled reason to share a schema and, more usefully, withholds it from coincidence: `Author` is two vendors converging, not two vendors agreeing.

Leaving the test permissive is a concession to what the code actually shows. The prize for sharing between the two marketplace adapters is 28 lines. A prescriptive rule would turn every such coincidence into an obligation and spend the session churning three-line functions, while the expensive part of a fifth target — its translator body — remains irreducibly its own.

## Alternatives

- **Classify by variance** — rejected: it misreads coincidence as agreement, and misread all three cases in this repository.
- **Allow shared code to branch on a closed, checked-in union of policy values** — rejected: the union is a ceiling no target agreed to, and widening it becomes a required edit for every new target.
- **Forbid shared code from carrying a policy value at all** — rejected: it buys nothing over the branching rule and forces duplication of code that never inspects what it carries.
- **Two tiers, folding a cited spec into mechanism** — rejected: it loses the distinction between two targets agreeing and two targets coinciding, which is the only principled ground for sharing a schema.
- **Two tiers, folding a cited spec into target policy** — rejected: each target's compliance would be re-derived per target, discarding `ndr:9n1m1a`'s reusable unit.

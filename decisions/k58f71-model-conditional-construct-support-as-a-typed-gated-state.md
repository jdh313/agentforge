---
id: "k58f71"
title: Model conditional construct support as a typed gated state
status: current
decision_date: 2026-09-20
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
  - src/compatibility.ts
  - src/render.ts
supersedes:
  - 5ymhmg
superseded_by: []
derived_from:
  - "Fibery #123"
informed_by: []
---

# k58f71 — Model conditional construct support as a typed gated state

## Decision

A construct whose support depends on external context resolves to a `gated` support state carrying a typed condition. Gate conditions form a closed discriminated union; configuration gates carry their enabling option, and install-scope gates carry the scopes where the construct resolves.

## Scope

- Binds: capability rows, support lookup, conditional diagnostics, and admission to the declared-loss gate.
- Does not bind: how a target translates a construct once its gate is satisfied, or the report disposition assigned to a gated diagnostic.

## Commitments

- Every gate kind carries enough structured data to state its condition without reconstructing it from prose.
- Adding a gating mechanism requires adding a condition variant and handling it exhaustively, rather than creating a parallel capability authority.
- A gated construct stays outside the declared-loss gate because target-level support is conditional, even when a particular invocation supplies enough context to evaluate the condition.
- A caller that knows the relevant context may suppress a satisfied condition or report an unsatisfied one, but may not collapse the capability row itself into an unconditional claim.

## Revisit if

- A real support condition cannot be expressed as a finite, actionable condition variant.
- Conditional rows become common enough that their diagnostics dominate ordinary capability results.
- Loss declarations gain a condition vocabulary capable of making an equally precise non-global declaration.

## Context

- The capability table exposes four unconditional support results and keeps translation metadata alongside its rows.
- The preceding decision covered consumer-configuration gating and explicitly called for reconsideration when another gating mechanism appeared.
- Claude agent bodies expand plugin-root variables at plugin install scope but leave them literal at user and project scope.
- An install command knows its selected scope, while an unscoped render does not.
- The first install-scope case was implemented in a separate map because the support result could not carry it.

## Why

The durable distinction is not which subsystem owns a switch; it is whether support has a condition. Configuration, install scope, runtime version, and host capability all answer the same capability question with structured context: the construct works when a stated predicate holds. Encoding the predicate makes the result truthful without multiplying top-level states for every new mechanism.

The declared-loss boundary remains conservative. A target that accepts a construct under a real condition has not established an unconditional loss, and a target-level declaration would still overstate what happens in valid contexts. Invocation-specific knowledge improves the diagnostic; it does not rewrite the underlying ecosystem fact.

A closed condition union preserves the forcing function of the capability table. New mechanisms cannot arrive as prose-only exceptions, while callers must confront the data needed to explain or evaluate them.

## Alternatives

- **One support state per gating mechanism** — rejected: precise for today's two cases, but turns every future runtime or host condition into another top-level state with duplicated handling.
- **Keep install-scope gating in a separate map** — rejected: creates two authorities for the fate of one construct and lets ordinary capability callers miss the condition.
- **Resolve known contexts directly to supported or unsupported** — rejected: erases the conditional target-level fact and can admit a source construct to the global declared-loss gate on the basis of one invocation.

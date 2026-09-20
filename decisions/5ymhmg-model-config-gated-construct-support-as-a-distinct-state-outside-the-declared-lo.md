---
id: "5ymhmg"
title: Model config-gated construct support as a distinct state outside the
  declared-loss gate
status: superseded
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/capabilities.ts
  - src/compatibility.ts
  - src/definitions.ts
supersedes:
  - 4nshwv
superseded_by:
  - k58f71
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/2
  - https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills
informed_by:
  - g6xvyk
  - rm06pf
---

# 5ymhmg — Model config-gated construct support as a distinct state outside the declared-loss gate

## Decision

A construct a target supports only when the consumer has enabled a configuration option
resolves to its own support state, carrying the option that enables it. The declared-loss
gate admits a construct only when its loss is unconditional; a gated construct reports its
condition and is never required to declare a loss.

## Scope

- Binds: the support states a capability row can express, and which constructs enter the
  declared-loss gate.
- Does not bind: what a declaration emits once made, or how a supported construct is
  translated.

## Commitments

- A capability row claiming gated support names the configuration option, so the
  diagnostic can state the condition rather than assert an outcome.
- A gated construct's diagnostic is phrased as a condition on the reader's configuration
  and never as a loss.
- Adding a gated row is a table edit, so the option name is rechecked with the row's
  citation rather than trusted from memory.

## Revisit if

- A target gates a construct on something other than its own configuration, such as a
  runtime version or a host capability.
- Gated constructs become common enough that conditional diagnostics are the majority and
  readers stop reading them.

## Context

- Hermes accepts inline shell in skill bodies only when `skills.inline_shell` is enabled,
  which is off by default, with a 4000-character output cap.
- The support union already carries four states, including one for a construct that is
  rewritten rather than lost.
- A construct recorded as supported would misstate the default configuration, and one
  recorded as unsupported would misstate an enabled one.
- The declared-loss gate admits a construct whose meaning is lost with nothing reported.
- Its predecessor's flip condition anticipated a construct a target cannot express at all
  and that no diagnostic covers.

## Why

The gate's admission test asks whether something was lost in silence, and a gated
construct answers neither yes nor no: whether it was lost is a fact about the reader's
configuration, which is not available at compile time. Forcing it through the gate would
make an author declare a loss they cannot know occurred, and a declaration that may be
false is worse than the silence declarations exist to end, because it teaches readers that
declarations are paperwork.

Adding the state rather than approximating it with an existing one is the same reasoning
that put capability claims in a table at all. A row that averages over the reader's
configuration states something untrue of some installs no matter which way it rounds, and
the whole point of keying the table finely was to stop it encoding falsehoods it could
have avoided.

This supersedes rather than amends its predecessor because it changes the gate's admission
rule, which that decision explicitly bound. The predecessor narrowed the gate to genuine
silence and anticipated the case of a construct no diagnostic covers; the inverse case, a
construct whose loss is conditional, needs the same narrowing for the same reason and was
not in view.

## Alternatives

- **Record a gated construct as unsupported with an explanatory note** — rejected: admits
  it to the declared-loss gate, forcing a declaration of a loss that may not occur.
- **Record a gated construct as supported** — rejected: fails open on the default
  configuration, which is the silence the capability table exists to end.
- **Gate on the construct but let the author declare the condition** — rejected: moves an
  ecosystem fact into every file that uses the construct, where it goes stale per file.

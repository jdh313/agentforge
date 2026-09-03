---
id: "4x4yyv"
title: Strip unrecognized frontmatter on every target, Claude included
status: current
decision_date: 2026-09-03
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - write-side
  - scope
binds:
  - src/targets/**
supersedes: []
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/2
informed_by:
  - vj6z18
---

# 4x4yyv — Strip unrecognized frontmatter on every target, Claude included

## Decision

A frontmatter key no artifact schema enumerates is stripped from every target's output
without exception, and reported on every target as it is today. No target retains an
unrecognized key on the grounds of being the dialect canonical source was written in.

## Scope

- Binds: the disposition of unrecognized frontmatter keys in leaf-rendered output.
- Does not bind: keys a declaration covers, which are stripped and reported nowhere, or
  the marketplace translation layer, where retained source frontmatter stays deliberately
  un-normalized.

## Commitments

- A key worth keeping in output earns a key table row rather than surviving on one
  target's leniency.
- Round-tripping canonical source through a rendered artifact is not supported, and
  nothing may come to depend on it.
- The retain option stays absent rather than unused, so reintroducing it requires stating
  a reason.

## Revisit if

- A workflow needs to recover canonical source from rendered output.
- A target documents that it reads keys agentforge cannot enumerate in advance.

## Context

- Emitting a key is a claim that the target accepts it.
- Retention was set on one target only, on the grounds that it was the source dialect.
- The other three targets inherit stripping as a default rather than declaring it.
- Per-key acceptance now resolves against a checked-in key table.
- No workflow reconstructs canonical source from rendered output.

## Why

The rule that emitting a key claims the target accepts it was already the codebase's
stated reason for stripping, and nothing in it is target-specific. It held for three
targets on the strength of an argument that applies equally to the fourth; the exception
survived only because that fourth target was privileged, and the privilege is gone.

An asymmetry that outlives its justification is worse than one that never existed, because
a reader reasonably infers a reason from its presence and there is none to find. Removing
it costs two lines and whatever snapshots carry a retained unknown key.

Round-tripping is the only rationale that would have rescued the exception, and it is not
a thing agentforge does. Preserving a capability for a workflow nobody has is how an
option becomes load-bearing by accident.

## Alternatives

- **Retain unrecognized keys on every target** — rejected: inverts the codebase's own rule
  and makes every target assert acceptance it cannot back.
- **Keep retention on the source dialect for round-tripping** — rejected: no workflow
  round-trips, and a key worth preserving can earn a table row instead.

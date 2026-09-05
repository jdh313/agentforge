---
id: "d17fnt"
title: Resolve an artifact's destination from target, artifact and scope
status: current
decision_date: 2026-09-05
author: Jacob Hoehler
conviction: strong
project: agentforge
labels:
  - architecture
  - write-side
binds:
  - src/targets/**
  - src/cli.ts
supersedes:
  - cdpejz
superseded_by: []
derived_from:
  - https://junglelan.fibery.io/Charting/Ticket/7
informed_by:
  - nes397
  - zjnfjm
  - gwxcfm
  - h64w43
---

# d17fnt — Resolve an artifact's destination from target, artifact and scope

## Decision

An artifact's output destination resolves from three values: the target, the
artifact type, and a scope of `user`, `project` or `plugin`. Each target declares
its install locations keyed by scope, and those declarations are normative —
agentforge writes to them rather than printing them.

## Scope

- Binds: how any output destination is derived, and the adapter field that
  records a target's on-machine locations.
- Does not bind: which scope a given invocation selects, or the default when none
  is named.
- Does not bind: the registry and manifest documents only a declared publication
  emits, which have no scope.

## Commitments

- A target declares every scope it supports and omits every scope it does not; a
  target with no location a harness reads declares none, and an install against
  it fails rather than inventing a destination.
- Each declared path is verified against the target's own loader, because a wrong
  value now writes to the wrong place instead of printing a wrong hint.
- Plugin scope resolves against a package directory the publication supplies;
  user and project scope resolve against the machine and the working repository.
- Shared code carries a resolved destination and never inspects the scope that
  produced it.

## Revisit if

- A target reads an artifact from a location that is neither user-, project- nor
  plugin-scoped.
- Two targets resolve one scope to the same directory and the collision must be
  resolved rather than reported.
- A scope's root stops being derivable without consulting the target's own
  configuration.

## Context

- `outputBaseDir` recorded exactly one personal directory per target, no code
  wrote to it, and the render path took its destination from a caller-supplied
  `--out` instead.
- The marketplace path computes its own destination at `package-payload.ts:87`,
  deriving the skill directory from the projected artifact name.
- Claude reads skills from a user directory, from a project directory, and from
  installed plugins.
- Four of five prospective targets read from two locations each, one personal and
  one project-scoped.
- `claude-chat` has no local directory a harness reads; its recorded location is a
  downloads folder a human uploads from.
- agentforge rendered native files for two and a half months before it grew
  marketplace compilation, and the two halves acquired separate destination rules.
- The predecessor decision named an install command writing to these locations as
  the condition that would make them normative.

## Why

Naming the scope is what makes one implementation possible. Without it the two
halves of the tool appear to do different things — one places a file where a
harness reads it, the other assembles a package — and the difference is really a
single expression, the directory the projection is rebased onto. With the axis
named, `package-payload.ts:87` and `render.ts:313` are the same computation at
two scope values, and the question of whether they should share code stops being
a matter of taste.

Scope belongs to the target because the target is what decides it. Claude reads
skills from three places; that is a fact about Claude, true before any output
exists, which is exactly the admission test `nes397` states. The scope vocabulary
itself is agentforge's own and shared across every target, not one vendor's
answer set placed beside another's, so it does not rebuild the ceiling
`h64w43` refused — the same reasoning that admitted a document's `role`.

Making the field normative is forced rather than chosen. Once agentforge places
files, a recorded location either is where the write lands or is a second,
unverifiable copy of that knowledge. The predecessor kept it non-normative
because nothing wrote to it, and said so plainly; that condition no longer holds.
The cost is real and worth stating: a wrong value used to mislead a reader who
could check it, and now misplaces a file.

Refusing rather than approximating for `claude-chat` follows the same discipline
that produced the predecessor. Its recorded directory was already a build output
a human carries elsewhere, and treating it as an install location would restate
the error the predecessor caught in Codex's value — naming a directory as though
one target owned what it does not.

## Alternatives

- **Keep destinations caller-supplied** — rejected: it leaves the native path
  outsourcing destination-choosing to the user while the plugin path computes its
  own, which is the asymmetry that produced two implementations.
- **Personal scope only** — rejected: it discards the case a skill authored in a
  repository most obviously wants, and reshaping the field afterwards repeats the
  predecessor's own failure mode.
- **Treat plugin membership as orthogonal to location rather than a third scope**
  — rejected: it splits one destination computation into two rules that agree,
  and gives the shared materializer two callers again for no gain.

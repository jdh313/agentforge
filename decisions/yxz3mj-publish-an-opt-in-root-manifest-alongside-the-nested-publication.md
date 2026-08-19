---
id: "yxz3mj"
title: Publish an opt-in root manifest alongside the nested publication
status: current
decision_date: 2026-08-19
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - repo-shape
  - write-side
binds:
  - src/root-manifest.ts
  - src/cli.ts
  - src/check.ts
supersedes: []
superseded_by: []
derived_from:
  - https://github.com/jdh313/ndr/issues/19
  - "commit 009e3b91 feat(marketplace): add root-manifest to publish an
    installable root copy"
informed_by:
  - s1g5yf
  - 3xe5wv
---

# yxz3mj — Publish an opt-in root manifest alongside the nested publication

## Decision

A publication may declare `root-manifest: true`. The compiler then writes a second copy of that publication's marketplace registry at `<marketplace-root>/<destination>` with every plugin source rewritten relative to the marketplace root (`./<out>/<id>/plugins/<name>`), while the nested `<out>/<id>/` tree and its own manifest are emitted unchanged.

## Scope

- Binds: the compile, check, and report paths for a publication that opts in; any target, though the motivating one is `claude`.
- Does not bind: the nested publication layout (`s1g5yf` still governs) or how the nested manifest derives `source` (`3xe5wv` still governs).

## Commitments

- `--out` must resolve inside the marketplace directory; a root-manifest publication hard-errors otherwise, so a rewritten source never begins with `../`.
- The root copy is a managed output: `check` reports drift on it and `--claude-native` validates the marketplace root as well as the nested tree.
- The compiler writes exactly one file at the marketplace root and never manages its siblings.
- Consumers opt in per publication; an undeclared publication keeps today's layout byte-for-byte.

## Revisit if

- Claude Code gains a supported way to install a marketplace whose manifest lives in a subdirectory, or to resolve plugin sources against the manifest's directory.
- A consumer needs the root copy for a publication whose registry is not a generated JSON document.

## Context

- Claude Code's `plugin marketplace add owner/repo` reads only `<clone-root>/.claude-plugin/marketplace.json`; refresh, install, and startup ignore any configured `path`.
- Claude Code resolves a plugin's `source` against the directory containing `.claude-plugin/`, and forbids `../`.
- Every consumer (ndr, cc-marketplace, clearance-driven-dev) commits publications under `marketplaces/<id>/`, keeps canonical packages at `plugins/<name>/`, and emits `source: ./plugins/<name>` in the nested manifest.
- A hand-placed root manifest carrying `./plugins/<name>` resolves to canonical source rather than compiled output, the same wrong-path install recorded as L-006 for Codex.
- Codex takes the marketplace root from the `add` argument, so a subdirectory root already works there.

## Why

The only runtime that hardcodes a root manifest is Claude Code, so the fix belongs at the manifest, not the tree: a second registry whose sources point into the existing nested publication makes `owner/repo` installs and auto-update work without moving a single compiled or canonical file. Keeping the nested copy is what makes the change additive — local-directory installs against `marketplaces/claude` keep working, `check` keeps its existing contract, and each manifest's sources are correct relative to its own root, so neither copy is a trap. Making it opt-in rather than default preserves byte-for-byte output for consumers that have not asked for it, and the inside-the-marketplace precondition keeps the rewritten path expressible without `../`.

## Alternatives

- **Compile the Claude publication into the repo root** — rejected: forces every consumer to move canonical packages out of `plugins/` and teaches `check` to manage repo-root paths; far larger blast radius for the same install result.
- **Symlink `.claude-plugin` to the nested copy** — rejected: the nested sources still resolve against the clone root and install canonical source silently.
- **`metadata.pluginRoot` on the nested manifest** — rejected: relocates sources but not the manifest, which is the half Claude Code hardcodes.
- **Replace the nested manifest with the root one** — rejected: breaks local-directory installs and removes the one manifest that is correct from inside `marketplaces/claude`.

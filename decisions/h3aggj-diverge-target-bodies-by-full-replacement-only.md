---
id: "h3aggj"
title: Diverge target bodies by full replacement only
status: current
decision_date: 2026-07-31
author: Jacob Hoehler
conviction: tentative
project: agentforge
labels:
  - architecture
  - scope
  - write-side
binds:
  - src/render.ts
supersedes: []
superseded_by: []
derived_from:
  - linear:JUN-354
  - .docs/2026-07-31-per-target-body-templating-companion.md
informed_by:
  - cp4rfn
---

# h3aggj — Diverge target bodies by full replacement only

## Decision

Canonical artifact bodies diverge per target only by full replacement through `targets.<name>.body`. agentforge offers no partial templating: no inline variable substitution, no conditional regions, no template engine.

## Scope

- Binds: body projection, for every artifact type and every target.
- Does not bind: frontmatter, which already diverges per target through the `targets.<name>` deep merge.
- Does not bind: resource files, which remain byte-for-byte passthrough.

## Commitments

- A divergence too small to justify a duplicated document is resolved by rewriting the canonical body to be target-agnostic, not by the compiler.
- Resource files stay byte-for-byte copies, so no escaping or raw-block convention is owed to content containing brace syntax.
- Claude-only construct detection stays a single package-level pass over canonical bodies and never runs per-target over rendered output.
- A document that genuinely differs wholesale on one target carries a duplicated body that can drift from canonical.

## Revisit if

- A body divergence appears that a target-agnostic rewrite cannot express and that is not whole-document shaped.
- Real positional-argument or `$ARGUMENTS` substitution sites accumulate beyond a handful.
- A target arrives whose bodies must differ structurally rather than by a sentence or a section.

## Context

- Across 167 markdown files in the real corpus there are zero loop sites, four duplicated non-trivial lines, and no shared-boilerplate demand.
- 139 of the Claude-only construct occurrences are frontmatter tool allowlists, which body templating cannot reach.
- The `${CLAUDE_PLUGIN_ROOT}` family is already rewritten by an existing alias table during Codex translation.
- Package bodies may be third-party, so an engine evaluating author-supplied template code would run untrusted input inside the compiler.
- Documentation toolchains that apply a template pass to previously unprocessed content corrupt legitimate brace syntax inside code fences.
- Canonical files are consumed in place by Claude Code today, so syntax added to them has a live cost.

## Why

The mechanism was proposed to solve a problem the corpus turned out not to have. Once instruction prose is written to name intent rather than tool identifiers, and the few documents that legitimately keep identifiers carry an adapter paragraph that is harmless wherever it lands, what remains is a single substitution site. A compiler feature is the wrong shape for that.

Declining also buys structural simplicity that would have been expensive to recover later. Detection stays one pass over canonical bodies rather than a per-target pass over rendered output, which keeps a construct's location an ordinary file and line rather than something needing a stable identity across a transform. Resource files stay copies, so the escaping problem that afflicts toolchains which start processing what used to be passthrough never arises. And no author-supplied template code is evaluated in a compiler that ingests third-party packages.

Full replacement remains available for the case it was always right for: a document that differs wholesale on one target. Its cost, a duplicated body free to drift, is real but bounded, and no instance exists today.

## Alternatives

- **Inline named variables with a per-target substitution map** — rejected: the call sites that motivated it are removable by rewriting prose, which costs nothing and survives tool renames, whereas a mapping table must be maintained per target forever.
- **Block conditional regions keyed on declared capabilities** — rejected: the one case that appeared to need them, a per-target adapter paragraph, already ships unconditionally to every target without harm.
- **A general template engine such as Nunjucks** — rejected: buys loops, includes, and macros against zero measured demand, while adding a dependency, an escaping convention, and an untrusted-code surface.

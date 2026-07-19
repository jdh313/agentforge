---
description: NDR coverage — ground coding work in the decision ledger before substantive edits.
---

# NDR coverage

This repository is tracked by the `ndr` plugin. Engineering decisions
that govern this codebase live as atomic markdown files in the decision
ledger pinned by this repo's `.ndr.toml`, with a plain
`project:` frontmatter value naming this repo.

### When the orchestrator should ground itself

Before substantive code work in this repo — refactors, new features,
schema changes, dependency swaps, or delegating to a coding subagent —
invoke `/ground` to surface the current decision heads relevant to the
active area.

Skip grounding for: typo fixes, comment-only changes, single-line
adjustments, or work on areas with no NDR coverage.

### Treat returned decisions as ground truth

When `/ground` (or `/decisions`) returns a head, treat that head as the
current state. Do not re-derive current state from older artifacts —
README snippets, ADR-style docs in `docs/`, code comments, or commit
messages — once a head exists for the topic. The supersession walk is
canonical.

### Pointing at decisions from code

Use `ndr:` references in code comments, commit messages, and PR
descriptions. Two resolvable grains:

- `ndr:0042` — frozen atom-id; "this code exists because of decision
  0042" (historical anchor). Resolve walks to the current head.
- `ndr:<label>` — taxonomy label; resolves to all current atoms
  carrying that label. Use when the whole area governs the call site.

The `/decisions` skill (and `@ndr-reader` agent) resolve all grains.

### Capturing new decisions

When a decision lands in conversation — a choice between alternatives
with a stated rationale — invoke `/capture-decision` at end of chat to
record it. The capture skill scans the conversation, drafts atomic
candidates, asks for confirmation, and writes the file with valid
frontmatter and a new-format body (single altitude, plain markdown).

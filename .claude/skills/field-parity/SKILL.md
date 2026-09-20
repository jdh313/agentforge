---
name: field-parity
description: Refresh docs/field-parity.md against the code it reads from. Use after changing a canonical schema, the frontmatter acceptance table, a target adapter's artifact config or output schema, the capability table, or the Codex native agent serializer — and when bumping the verified codex-cli or Claude Code version.
allowed-tools: Read, Grep, Glob, Edit, Bash(jj diff *), Bash(jj log *), Bash(jj show *), Bash(jj st*), Bash(bun test *), Bash(bunx tsc *)
---

# Keeping docs/field-parity.md true

`docs/field-parity.md` is a **reading of source files**, not an independent
record. Every row must be derivable from the code on disk right now. When the
doc and the code disagree, the code wins and the doc changes — never the
reverse.

## The seven sources

Read these before editing a row. Each owns part of the table:

| Source | What it decides |
| --- | --- |
| `src/schema.ts` | Which canonical fields exist, their types, and `ARTIFACT_DEFS` |
| `src/frontmatter.ts` | `ACCEPTANCE`: which targets retain a key, plus the `source` citation per row |
| `src/targets/claude.ts` | Claude's per-artifact output schema and install locations |
| `src/targets/codex.ts` | Codex's output schema, install locations, and `codexAgentDocument.serialize` (the emitted TOML fields) |
| `src/capabilities.ts` | Translations (`CODEX_SKILL_TRANSLATIONS`) and construct support |
| `src/targets/codex-marketplace.ts` | `codexSkillPolicy` — the `agents/openai.yaml` sidecar keys |
| `docs/limitations.md` | The `L-0NN` ids the doc cites |

A claim with no home in that list does not belong in the doc.

## Procedure

1. **Scope the change.** `jj diff -r @` (or the relevant revset) over the seven
   sources. If none changed, only the provenance line may need a touch — stop
   and say so rather than rewriting prose.
2. **Re-read the changed source in full**, not just the diff hunk. A comment two
   lines above a key usually carries the objection the doc's cell quotes.
3. **Update the affected rows only.** Keep the group order: Shared by both
   harnesses → Claude-only → No canonical field → Authoring layer. A key that
   changes disposition moves between groups; do not leave it in two.
4. **Update the provenance block** at the top — the `codex-cli` and Claude Code
   versions and the date — only when you actually re-verified against those
   versions. Copying a newer version string you did not check is the one edit
   that makes this doc worse than having none.
5. **Check the cross-references still resolve**: every `L-0NN` exists in
   `docs/limitations.md`, every `ndr:<id>` is still cited by the source file the
   row came from.
6. **Report what moved** in one line per row, naming the source file that
   forced it.

## Choosing a disposition

Five values, and they are not interchangeable:

- **Native** — the projection emits it under a name the harness reads.
- **Translated** — emitted under a different name or in a different file.
  Name both the new key and the file.
- **Blocked** — stripped today, but a field on that harness could hold it. The
  cell must name **that field** and **the objection**. "Probably possible" is
  not a Blocked row; if you cannot name the field, it is No analogue.
- **No analogue** — stripped, and the harness has no field for the concept.
  State why the concept cannot land, in terms of what the harness's loader does.
- **Unmapped** — the reverse gap: the harness reads a field no canonical key
  addresses. Canonical column reads *none*.

Two rules govern movement between them:

- **A row moves to Native or Translated only on verified semantics** — the
  harness's own loader accepting the emitted document, not a field name that
  looks right (ndr:d17fnt). A shared field name is not evidence; `skills` on the
  Codex agent role is the worked example of a name that matches and a meaning
  that is unestablished.
- **Blocked vs No analogue is a judgement about the destination, not a
  diagnostic.** Both still emit `claude-only-frontmatter-stripped`. Do not
  introduce a doc distinction the compiler makes, or imply the compiler makes
  this one.

## State obstacles as operations

A cell says what must happen and cannot, not what the field is about. "A skill
takes no invocation-time argument" is checkable; "it's a Claude-specific
concept" is not. When you write an objection, flip its variable and re-read: if
the conclusion is unchanged, the stated reason is carrying none of the argument
and the real obstacle is still unnamed.

## When a new canonical field is added

A new key in `src/schema.ts` needs a row in every group it belongs to and an
`ACCEPTANCE` entry in `src/frontmatter.ts` — if that entry is missing, the key
is silently stripped everywhere, which is a code defect to report, not a doc row
to write.

## What this doc does not hold

- Rationale — that is the NDR ledger. Cite `ndr:<id>`, do not restate.
- Unbuildable gaps — `docs/limitations.md`, cited as `L-0NN`.
- Not built yet — `docs/roadmap.md`. A milestone is not a limitation.
- Per-plugin dispositions — cc-marketplace's own compatibility doc.

## Published mirror

A rendered copy of these tables lives as a private Claude artifact
(`claude.ai/artifact/LZicq1TcNJivPHhmyr1XYw`). It is a snapshot, not a second
source. Update it only when asked, and only from the current doc.

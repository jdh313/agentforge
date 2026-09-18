# Teach runtime acceptance

This record tracks Fibery #103 without treating a clean compilation as proof
that the stateful teaching workflow behaves correctly. Teach is authored in
`jdh-agents/plugins/teach`; AgentForge supplies its target projection and
diagnostics.

Last exercised: 2026-09-16

Harness and source baseline:

- Codex CLI 0.154.0
- AgentForge parent revision `bbfb0d70`
- Teach 0.11.1 from `jdh-agents`

## Evidence classes

- **Documented** is a primary runtime or repository contract.
- **Generated** is an emitted artifact or compiler diagnostic.
- **Observed** is behavior from a fresh installed runtime session.

Generated output and `check` status do not establish runtime discovery,
invocation policy, vault safety, or state continuity.

## Governing decisions

- `ndr:zc7b6k` — establishes skill-local `agents/openai.yaml` as the
  target-owned shape for explicit-only command-derived Codex skills. Teach is a
  canonical skill rather than a command-derived one, but the checked-in
  capability translation deliberately emits the same native policy.
- `ndr:h3aggj` — a target body override replaces the complete body; AgentForge
  does not provide partial body templating.
- `ndr:zjnfjm` — target policy remains attached to the target at production.
- `ndr:728mf7` — diagnostics describe target non-acceptance, not ownership.
- `ndr:xx9w1b` — a native validator is opt-in evidence, not runtime acceptance.

No new decision is required for the current content corrections and runtime
acceptance. A decision would be required before introducing a new canonical
collaborator abstraction or changing the declared-loss policy.

## Static mapping review

| Procedure | Canonical instruction | Codex disposition | Current status |
|---|---|---|---|
| Obsidian | Read and write vault notes with `obsidian-cli`; use a targeted patch tool for surgical edits | The CLI is portable. The allowed/disallowed tool fences and MCP patch tool are stripped | Generated; runtime I/O not yet accepted |
| DEVONthink | Search owned textbooks before web sources using read-only MCP tools | Integration is unavailable; the retained references are declared unenforced and the interface says Codex falls back to web sources | Explicit declared loss |
| Reader/editor collaboration | `@vault-reader` may read learning style; complex restructuring goes to `@note-editor` | The names do not register Codex agents. Teach carries no local Codex role procedure, and the Librarian package's agent Markdown is inert | Undetected here, by design — see below |
| User input | Propose and confirm the workspace path before creation; confirm mission changes and source choices | Ordinary conversation or structured input can preserve the pause | Requires a no-write-before-confirmation runtime trace |
| Vault guidance | Read the learning-style note and the vault's `.claude/CLAUDE.md` Location Decision Tree | A literal content read may work, but there is no tested Codex fallback | Requires an observed read and path proposal |

The source should prefer target-neutral intent where only a small phrase
differs. A full `targets.codex.body` copy of the long Teach procedure would
create avoidable drift and is not justified by the current gaps.

### Why the reader/editor row is still unresolved

AgentForge now carries `body-agent-reference` (ndr:c5haze), so a body naming an
agent the target cannot register is a declarable loss rather than silent prose.
That closed the row for `librarian` (71 occurrences) and `skillsmith` (2), where
each body names an agent its **own package** declares.

It does not close it for Teach. Teach declares no agents; `@vault-reader` and
`@note-editor` belong to `librarian`, and resolution is package-local, so the
gate is silent on Teach's body by design rather than by oversight. Widening
resolution to the whole publication is Fibery Charting #23 — deferred, and
explicitly outside the 1.0 gate.

Two consequences for this record:

- The row cannot be closed by a compiler diagnostic today. It closes when the
  runtime acceptance plan below produces a trace showing what a Codex session
  actually does with those two names — the evidence this document exists to
  demand.
- Teach's collaborator prose stays unchanged meanwhile. It is correct on Claude,
  and nothing here establishes a better Codex form to replace it with.

## Generated artifact findings

`agentforge check` reports the Codex publication clean at 212 managed files.
For Teach it reports four distinct dispositions:

1. The body retains DEVONthink MCP references without a Codex body override.
2. `argument-hint`, `allowed-tools`, `disallowed-tools`, and `effort` are
   stripped.
3. The DEVONthink `mcp-tool-reference` loss is declared
   `retained-unenforced`.
4. `disable-model-invocation: true` is translated to
   `agents/openai.yaml` with `policy.allow_implicit_invocation: false`.

The generated package contains the projected skill, its format documents,
`UPSTREAM.md`, the lesson CSS asset, and the explicit-only policy sidecar.

One content defect remains outside the compiler's semantic checks:

- The generated Codex body still names Claude's Obsidian MCP integration and
  `@note-editor`, even though neither is a working Codex dispatch contract.

Two defects recorded here earlier are now closed in `jdh-agents` and are kept
only so the record shows what moved. The Codex interface `longDescription` said
lessons were self-contained HTML; it now says Markdown lessons and wiki pages.
The dual-runtime status document said Codex was limited to four pilots while the
authoritative publication enrolled more; the counts are reconciled. Neither
correction is runtime evidence for anything.

## Runtime acceptance plan

The following gates remain deliberately unclaimed:

1. **Fresh install and discovery.** Reinstall Teach from the local Codex
   publication, inspect the installed cache rather than only publication
   bytes, and verify the projected sidecar is present.
2. **Explicit-only invocation.** In a fresh task, verify natural-language
   prompting does not inject Teach and explicit `$teach` selection does.
3. **Pre-write safety gate.** Invoke Teach explicitly, have it read the
   learning-style and location guidance, propose a disposable workspace path,
   and prove it stops before the first write for user confirmation.
4. **Stateful Codex flow.** With approval, create a disposable Mission,
   Resources, Glossary, Records, and lesson set, then advance the same workspace
   from a second fresh session. Record the exact vault diff.
5. **Collaborator degradation.** Verify the session does not claim to dispatch
   `@vault-reader` or `@note-editor`, and performs the delegated vault work
   inline instead. No compiler diagnostic covers this — the reference is
   cross-package, so `body-agent-reference` is silent on it by design — which
   makes an observed trace the only evidence available.
6. **Truthful fallback.** Verify the session says DEVONthink is unavailable and
   uses web sources without claiming it searched owned textbooks.
7. **Claude regression.** Validate and exercise the corresponding Claude
   workflow separately.

The disposable vault workflow is a persistent external change. It must not run
without an approved path and cleanup plan. A successful smoke test would prove
the observed workflow was non-destructive; it would not prove universal tool
enforcement because Codex does not retain Teach's tool filters.

## Current disposition

Teach is compiled and enrolled for Codex, and its explicit-only sidecar is
generated correctly. Runtime acceptance is not complete.

Before the live smoke:

- correct the stale Codex interface description and regenerate `jdh-agents`;
- disposition the Claude-native reader/editor dispatch, noting that the
  `body-agent-reference` gate does not cover it (see above) and that gate 5
  below is what settles it;
- state the Codex tool boundary as advisory rather than mechanically enforced;
  and
- reconcile the stale pilot-status documentation with the authoritative
  marketplace definition.

The final live gate requires explicit approval because it creates notes in the
user's vault.

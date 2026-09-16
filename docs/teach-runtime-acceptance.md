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
| Reader/editor collaboration | `@vault-reader` may read learning style; complex restructuring goes to `@note-editor` | The names do not register Codex agents. Teach carries no local Codex role procedure, and the Librarian package's agent Markdown is inert | Unsupported until rewritten or given a demonstrated runtime-subagent path |
| User input | Propose and confirm the workspace path before creation; confirm mission changes and source choices | Ordinary conversation or structured input can preserve the pause | Requires a no-write-before-confirmation runtime trace |
| Vault guidance | Read the learning-style note and the vault's `.claude/CLAUDE.md` Location Decision Tree | A literal content read may work, but there is no tested Codex fallback | Requires an observed read and path proposal |

The source should prefer target-neutral intent where only a small phrase
differs. A full `targets.codex.body` copy of the long Teach procedure would
create avoidable drift and is not justified by the current gaps.

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

Two content defects remain outside the compiler's semantic checks:

- The Codex interface `longDescription` says lessons and cheat sheets are
  self-contained HTML. The current workflow stores Markdown lessons and wiki
  pages and explicitly says there is no HTML.
- The generated Codex body still names Claude's Obsidian MCP integration and
  `@note-editor`, even though neither is a working Codex dispatch contract.

The repository's dual-runtime status document also says Codex is limited to
four pilots while the authoritative all-compatible publication already enrolls
Teach. That status text must not be used as runtime evidence.

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
5. **Truthful fallback.** Verify the session says DEVONthink is unavailable and
   uses web sources without claiming it searched owned textbooks.
6. **Claude regression.** Validate and exercise the corresponding Claude
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
- replace or explicitly disposition the Claude-native reader/editor dispatch;
- state the Codex tool boundary as advisory rather than mechanically enforced;
  and
- reconcile the stale pilot-status documentation with the authoritative
  marketplace definition.

The final live gate requires explicit approval because it creates notes in the
user's vault.

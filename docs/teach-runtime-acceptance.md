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
| Obsidian | Read and write vault notes with `obsidian-cli`; use whichever targeted note-patch tool the runtime offers for surgical edits | The CLI is portable. The shared wording no longer names Claude's Obsidian MCP integration; the allowed/disallowed tool fences are still stripped | Static mapping closed; runtime I/O not yet accepted |
| DEVONthink | Search owned textbooks before web sources using read-only MCP tools | Integration is unavailable; the retained references are declared unenforced and the interface says Codex falls back to web sources | Explicit declared loss |
| Reader/editor collaboration | A registered read-only vault collaborator may read learning style, and a registered bounded vault-editor collaborator may handle complex restructuring when available | The wording is capability-conditional and names no runtime-specific collaborator. Without one, the CLI/direct-edit paths remain explicit and the runtime must not invent a collaborator | Static mapping closed; runtime behavior not yet accepted |
| User input | Propose and confirm the workspace path before creation; confirm mission changes and source choices | Ordinary conversation or structured input can preserve the pause | Requires a no-write-before-confirmation runtime trace |
| Vault guidance | Read the learning-style note and the vault's `.claude/CLAUDE.md` Location Decision Tree | A literal content read may work, but there is no tested Codex fallback | Requires an observed read and path proposal |

The source should prefer target-neutral intent where only a small phrase
differs. A full `targets.codex.body` copy of the long Teach procedure would
create avoidable drift and is not justified by the current gaps.

### Task 2 static mapping correction

Task 2 closed the static mapping gap in Teach's canonical body. The named
`@vault-reader` and `@note-editor` instructions were replaced with
capability-conditional collaborator wording: delegate only when the runtime
exposes an appropriate registered collaborator, otherwise use the explicit
CLI/direct-edit fallback and do not invent one. The surgical-edit instruction
now asks for whichever targeted note-patch tool the runtime offers rather than
naming Claude's Obsidian MCP integration.

That shared wording preserves Claude's available path without claiming the same
capability exists on Codex, so a full `targets.codex.body` fork remains
unjustified. This closes a source-mapping defect, not the runtime acceptance
gates below: only a fresh session can show which capabilities are actually
available and whether the fallback is followed.

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

The generated Codex body now carries the task 2 corrections: collaborator use
is conditional on a registered runtime capability, and surgical edits use
target-neutral patch-tool wording. It no longer names `@vault-reader`,
`@note-editor`, or Claude's Obsidian MCP integration.

Two defects recorded here earlier are now closed in `jdh-agents` and are kept
only so the record shows what moved. The Codex interface `longDescription` said
lessons were self-contained HTML; it now says Markdown lessons and wiki pages.
The dual-runtime status documentation said Codex was limited to a fixed pilot
set while the authoritative publication enrolled more; the counts and lists are
reconciled against `MARKETPLACE.yaml` and the packages' own `targets.codex`
declarations. Neither correction is runtime evidence for anything.

## Tool boundary: advisory, not mechanically enforced

Teach's Codex tool boundary is **advisory**. This is a statement about the
generated artifacts, not a prediction about a runtime session.

- **Codex retains none of Teach's canonical tool policy.** `allowed-tools` and
  `disallowed-tools` are stripped by the projection — finding 2 above. The
  installed Codex skill therefore carries no allowlist and no deny-list from
  Teach, and there is no Codex-side field these could have been mapped onto.
- **What still constrains a session is the parent/session sandbox.** Codex's
  own sandbox and approval policy continue to apply, exactly as they would to
  any other skill. That boundary is owned by the user's runtime configuration;
  it is neither supplied by Teach nor tightened by anything Teach declares, and
  nothing here changes it.
- **The remaining fences in the body are prose.** The projected body still
  instructs which tools to prefer and which operations to avoid — the
  `obsidian-cli` preference, the destructive-subcommand caution, the read-only
  DEVONthink references retained as a declared unenforced loss. A model may
  follow them. Nothing rejects a call that does not. **Prompt instructions are
  not evidence of mechanical enforcement**, and this record does not treat them
  as such.
- **The one mechanically enforced Codex policy Teach ships is about
  invocation, not tools.** `agents/openai.yaml` carries
  `policy.allow_implicit_invocation: false` — finding 4 above. It governs
  whether the skill can be injected without explicit selection, and says
  nothing about what the skill may call once selected.

The consequence for the plan below: no gate can be read as establishing tool
enforcement. A gate that records a clean session records **compliance in that
run**, by that model, under that sandbox. It does not demonstrate that a
violating call would have been refused, because on the current evidence nothing
in the projection would refuse it.

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
5. **Capability-conditional collaboration.** Verify the session delegates vault
   work only when an appropriate registered collaborator is actually available;
   otherwise it must follow the CLI/direct-edit fallback and must not invent a
   collaborator. The static wording is corrected, but only an observed trace
   establishes runtime behavior.
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

The pre-smoke documentation work is done. For the record, what each item
settled:

- the stale Codex interface description was corrected and `jdh-agents`
  regenerated;
- task 2 replaced the Claude-native reader/editor names with
  capability-conditional collaborator wording and made the patch-tool wording
  target-neutral; gate 5 still supplies the outstanding runtime evidence;
- the Codex tool boundary is stated as advisory rather than mechanically
  enforced, under its own heading above; and
- the stale pilot-status documentation in `jdh-agents` is reconciled against
  the authoritative marketplace definition, with declared enrollment described
  separately from runtime acceptance.

None of that is runtime evidence. It only stops the record from claiming
things the artifacts do not support.

The final live gate requires explicit approval because it creates notes in the
user's vault.

# Teach runtime acceptance

This record tracks Fibery #103 without treating a clean compilation as proof
that the stateful teaching workflow behaves correctly. Teach is authored in
`jdh-agents/plugins/teach`; AgentForge supplies its target projection and
diagnostics.

Last exercised: 2026-09-18

Harness and source baseline:

- Codex CLI 0.154.0
- AgentForge parent revision `029f2e69`
- Teach 0.11.5 from `jdh-agents`
- Fresh Codex sessions using `gpt-5.6-luna` for the neutral, explicit, and
  continuation traces

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
| Obsidian | Read and write vault notes with `obsidian-cli`; use whichever targeted note-patch tool the runtime offers for surgical edits | The CLI is portable. The shared wording no longer names Claude's Obsidian MCP integration; the allowed/disallowed tool fences are still stripped | Static mapping closed; observed Codex I/O accepted for the dated baseline below |
| DEVONthink | Search owned textbooks before web sources using read-only MCP tools | Integration is unavailable; the retained references are declared unenforced and the interface says Codex falls back to web sources | Explicit declared loss |
| Reader/editor collaboration | A registered read-only vault collaborator may read learning style, and a registered bounded vault-editor collaborator may handle complex restructuring when available | The wording is capability-conditional and names no runtime-specific collaborator. Without one, the CLI/direct-edit paths remain explicit and the runtime must not invent a collaborator | Static mapping closed; the observed Codex run used the direct fallback and invented no collaborator |
| User input | Propose and confirm the workspace path before creation; confirm mission changes and source choices | Ordinary conversation or structured input can preserve the pause | Observed pause before the first write |
| Vault guidance | Read the learning-style note and the vault's `.claude/CLAUDE.md` Location Decision Tree | The Codex run can use literal, path-qualified reads | Observed full reads and a compliant path proposal |

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

## Runtime acceptance result

The seven gates were exercised against the baselines above, with the Claude
regression supplied by its separate 2026-09-16 trace:

1. **Fresh install and discovery — passed.** Teach was removed and reinstalled
   from the local `jdh-agents` Codex publication. The installed 0.11.5 cache was
   byte-for-byte identical to the publication and contained
   `skills/teach/agents/openai.yaml` with
   `policy.allow_implicit_invocation: false`.
2. **Explicit-only invocation — passed.** In a fresh neutral directory, the
   natural-language request “Teach me how Bloom filters work as a multi-session
   course” produced an ordinary in-chat course. The session did not load Teach,
   inspect vault guidance, propose a workspace, or write a file. A separate
   fresh session selected with `$teach` loaded and followed the installed
   skill. An earlier natural-language trial inside the `jdh-agents-teach-103`
   source worktree is excluded: source search let that agent find and manually
   load Teach, so the trial cannot establish invocation policy either way.
3. **Pre-write safety gate — passed.** The explicit session found the vault,
   read the complete learning-style note and 661-line vault guidance, proposed
   `Reference/Developer/Bloom Filters/`, and stopped for confirmation. The path
   did not exist before approval.
4. **Stateful Codex flow — passed.** After approval, the first session created
   only `Mission.md`, `Resources.md`, `Glossary.md`, an empty `Records/`, and
   `lessons/0001-bloom-filter-membership.md` in the confirmed workspace. A
   second fresh session reconstructed that state and added only
   `lessons/0002-bloom-filter-saturation.md`; the existing three top-level notes
   were unchanged and `Records/` remained empty.
5. **Capability-conditional collaboration — passed for the observed run.** No
   applicable registered vault collaborator was available. Both Codex sessions
   used the CLI/direct path and invented no collaborator.
6. **Truthful fallback — passed.** The explicit session said DEVONthink was
   unavailable and had not been searched, then used direct web links. It made
   no claim about searching owned textbooks.
7. **Claude regression — passed separately.** The 2026-09-16 fresh Claude
   0.11.5 trace loaded the generated plugin, invoked `/teach:teach`, read the
   full vault guidance, waited for path confirmation, and created the expected
   five Markdown notes. That trace was not rerun as part of the Codex exercise.

The final observed Codex workspace inventory was:

```text
Glossary.md
Mission.md
Records/
Resources.md
lessons/
lessons/0001-bloom-filter-membership.md
lessons/0002-bloom-filter-saturation.md
```

This is dated runtime evidence, not a claim of universal enforcement. In
particular, gate 5 shows compliance by these sessions under their parent
sandbox; it does not change the advisory tool boundary described above.

### Test-environment notes

The disposable workspace remains in the approved vault path pending explicit
cleanup. Installation also exposed a stale `cc-marketplace` source in the user
configuration. The test controller repaired it reversibly with a compatibility
marketplace at `~/.codex/marketplaces/cc-marketplace-compat`, preserving prior
plugin enablement states, and backed up the original configuration before
registering the live `jdh-agents` publication. Those environment changes made
the test possible; they are not Teach product behavior.

## Current disposition

Teach 0.11.5 is accepted on the observed Claude and Codex baselines. The Codex
publication was freshly installed, explicit-only invocation held in a neutral
directory, the approval boundary held before the first vault write, and a fresh
continuation session advanced the same workspace without disturbing its prior
state.

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

The live trace also resolves the remaining ownership question without a body
fork: the shared, capability-conditional procedure degraded correctly when the
Codex session had no registered vault collaborator. A full
`targets.codex.body` copy would still create avoidable drift, and the trace
supplies no reason to remove a Claude feature merely because Codex lacks it.

Acceptance remains scoped to the versions and dated observations in this
record. It does not turn Teach's prose tool fences into enforcement, promise
that future runtime versions behave identically, or erase the declared
DEVONthink loss.

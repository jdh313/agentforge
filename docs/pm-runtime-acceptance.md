# PM runtime acceptance

This record tracks Fibery #104 without treating a clean compilation as proof
that PM's Linear workflows behave correctly on Codex. PM is authored in
`jdh-agents/plugins/pm`; AgentForge supplies its target projection and
diagnostics.

Result: accepted on both runtimes at PM 0.13.1 — see § Current disposition.

Last exercised: 2026-09-20

Harness and source baseline:

- Codex CLI 0.154.0 (the update to 0.155.1 was declined for the duration, so
  every session in this record ran on one pinned harness)
- AgentForge parent revision `5cb1b1b5`; the compiler `jdh-agents` actually
  ran is the pinned release binary v1.0.0, not this working copy
- PM 0.13.1 from `jdh-agents`
- Four fresh Codex sessions using `gpt-5.6-terra`, one per scenario, each
  closed before the next was opened
- One fresh Claude Code session for the regression leg, after updating that
  harness's plugin cache from a stale 0.7.0

## Evidence classes

Five classes are kept apart throughout, and a claim never borrows support from
a class that cannot carry it:

1. **Source** — what the canonical files say.
2. **Generated** — an emitted artifact or compiler diagnostic.
3. **Automated** — a test or checker result.
4. **Observed (Claude)** — behavior from a Claude Code session.
5. **Observed (Codex)** — behavior from a fresh installed Codex session.

Generated output and a clean `check` do not establish runtime discovery,
tool availability, or degradation behavior. Neither does a model's account of
its own capabilities — see § A model's self-report is not evidence.

## Governing decisions

- `ndr:k58f71` — a construct whose support depends on external context resolves
  to a `gated` state carrying a typed condition. This is the decision that
  describes PM's Linear surface on Codex most exactly: Linear is neither
  unconditionally present nor unconditionally absent there, it is present
  when a connector is configured.
- `ndr:h3aggj` — a target body override replaces the complete body; AgentForge
  provides no partial templating. This is why none of the corrections below
  became a `targets.codex.body` fork.
- `ndr:728mf7` — diagnostics describe target non-acceptance, not ownership.
- `ndr:zjnfjm` — target policy is attached at production.
- `ndr:xx9w1b` — a native validator is opt-in evidence, not runtime acceptance.

No new decision is required for the source corrections recorded here. A
decision would be required before forking a `targets.codex.body` for PM, or
before changing the declared-loss policy on `mcp-tool-reference`.

## A model's self-report is not evidence

The first Codex probe in this exercise asked the session to enumerate the tools
available to it whose names contained `linear`. It answered: "none. Evidence:
my session tool list contains no tool name with linear." That answer was wrong.
The same runtime exposes 327 tools through a `codex_apps` connector, among them
the full `linear.*` read and write surface.

The error was in the probe, not the model. A session's account of its own tool
list is a claim about its context window, not an observation of the runtime.
The reliable probe is to **call the tool** and report what came back, which is
what every gate below does.

This is recorded because the wrong answer was confidently worded and briefly
believed, and because the same probe shape would mislead the next reader of
this document.

## Static mapping review

| Surface | Canonical instruction | Codex disposition | Current status |
|---|---|---|---|
| Linear reads | Pull cycles, issues, labels, statuses, projects by MCP tool name | The tools exist under different names — `mcp__codex_apps__linear_*`, never `mcp__linear-server__*`. Both observed sessions resolved the intent without being told | Static mapping closed; the names in the body are wrong on Codex and the sessions adapted anyway |
| Linear writes | Every write goes through the `linear-ops` collaborator | Codex registers no agent role from a plugin package (L-010), so no dispatchable collaborator exists. The procedure document still ships | Corrected — see § The `linear-ops` fallback correction |
| NDR composition | Resolve `ndr:` references and ground against heads via the `ndr` skills | The `ndr` plugin is installed; its skills are instruction documents, and the session drove the `ndr` CLI directly | Static mapping closed for `groom` and `breakdown`; `retro` diverged — see § An inconsistency between two gates |
| Librarian / vault | An optional `vault-reader` collaborator for the vault-unfiled and session-note passes | No registered collaborator and no vault tool. The wording is already capability-conditional and names the inline fallback | Static mapping closed; observed skip with no invented collaborator |
| Ledger scope | Resolve a ticket's `ndr:` references | The references often belong to another repository's ledger, and the step names none. Claude passed `--ledger` and resolved all seven; Codex did not and reported `unknown` | Open — follow-up 3 |
| Repository guidance | Read the project's own agent guidance | Codex reads `AGENTS.md`; the canonical text named Claude's file | Corrected — see § Source corrections |
| Skill dispatch | `Skill(ndr:decisions)` and similar | A Claude invocation form. Codex selects skills differently and the compiler does not flag the shape | Corrected — see § Source corrections |

## Source corrections

Four defects in PM's canonical source were found by this review and fixed in
`jdh-agents` at PM 0.13.1. None of them is runtime evidence for anything; they
are source-mapping repairs that the gates below then exercised.

1. **`Skill(<plugin>:<skill>)` dispatch form** — 19 occurrences across `groom`,
   `breakdown`, `chart`, and `to-questionnaire`. Rewritten to name the skill
   (``the `ndr:decisions` skill``), which is the form the same files already
   used in their own "Composes with" sections.
2. **`Project CLAUDE.md`** in `references/layer-policy.md` and
   `skills/breakdown/SKILL.md` — rewritten to **Project agent guidance**
   (`AGENTS.md` / `CLAUDE.md`). The gates below confirm this matches what a
   Codex session actually reads.
3. **The `linear-ops` structural fallback** in `author`, `breakdown`, and
   `chart` — see the next section.
4. **A misattributed decision citation.** All three fallback paragraphs ended
   "Cross-plugin references resolve only when both plugins are installed
   (`ndr:m7pd8d`)." `ndr:m7pd8d` says shared vocabulary belongs in a
   plugin-root reference rather than a skill; it says nothing about
   install-time resolution. The atom that did govern cross-plugin references,
   `ndr:sa0z0q`, was retracted in 2026-08 when the public-export mechanism was
   retired. The citation was dropped rather than replaced, and the obstacle is
   now stated as the operation it actually is.

## The `linear-ops` fallback correction

The pre-0.13.1 text read:

> **Structural fallback:** if the `linear-ops` agent is not available — the
> linear plugin is not installed — do not reimplement the write. Say the agent
> is missing, and hand the composed ticket to the `linear` skill's create
> operation, or to the user to paste.

The em-dashed clause asserts that agent unavailability *means* the plugin is
absent. On Codex both halves come apart: the plugin is installed and its
`agents/linear-ops.md` ships with it, while no dispatchable agent role is
registered at all (L-010). A Codex session following that sentence literally
would announce a missing agent and stop, on a false premise, for every write
`author`, `breakdown`, and `chart` perform — which is all of them.

Flipping the variable exposes it: with the plugin genuinely absent the
conclusion is unchanged, so plugin-absence was never the discriminator. The
real obstacle is that **dispatch requires a registered role and some runtimes
register none, while reading a file requires only that the file exist.** The
replacement text says that, and routes the session to the shipped procedure.

Observed effect (class 5, breakdown gate): with no registered collaborator, the
session located and read
`/Users/jacob/.codex/plugins/cache/cc-marketplace/linear/0.7.0/agents/linear-ops.md`,
followed it to compose intent blocks, and reported them in the shape the
collaborator would have returned. It did not announce a missing agent, and it
did not improvise a write.

## Generated artifact findings

`scripts/agentforge.sh check MARKETPLACE.yaml --out marketplaces --json`
reports `status: ok` with zero issues across both publications, before and
after the corrections. PM contributes eight diagnostics, all on `codex`, and
each has a reviewed disposition:

| # | Code | Subject | Disposition |
|---|---|---|---|
| 1–6 | `claude-only-frontmatter-stripped` | `argument-hint`, `allowed-tools` on all six skills | **Accepted, no action.** Codex has no field to map either onto. Confirmed at runtime: the installed `groom/SKILL.md` carries neither key. The tool boundary that remains is advisory — see § Tool boundary. |
| 7 | `claude-only-body-feature` | `groom` names `mcp__linear-server__list_cycles` with no `targets.codex.body` override | **Accepted, no action.** The diagnostic is correct: that exact name does not exist on Codex. A body fork would be a whole-body copy of a long procedure for one tool name (`ndr:h3aggj`), and both observed sessions resolved the intent unaided. |
| 8 | `declared-loss` | `mcp-tool-reference`, `retained-unenforced`, at `skills/groom/SKILL.md:56` | **Accepted; its stated reason needs revision.** See below. |

Diagnostics 7 and 8 fire at the same occurrence, `groom/SKILL.md:56`. That is
the established shape — Teach's record reports the same pairing — and it is
not a double-count: the warning states what the target does not accept, the
note states that the loss was declared.

### The declared loss's stated reason is settled

The declaration says the Linear MCP gotcha "is tied to the exact Linear MCP
tool shape and may not hold for whatever Linear access a Codex user has
configured." That was written when nobody had looked. Two runs looked, and the
answer is that it **does** hold:

| Runtime | Tool | `cycle: "current"` | resolved `cycle: "1"` |
|---|---|---|---|
| Claude Code | `mcp__linear-server__list_issues` | 0 issues | 5 issues |
| Codex 0.154.0 | `mcp__codex_apps__linear_list_issues` | 0 issues | 5 issues |

Both return an empty list with no error, against a cycle that demonstrably
holds five issues. The underlying advice — resolve the current cycle's numeric
name first — is therefore not merely still applicable on Codex, it is
*required* there for exactly the reason the Claude-facing text gives.

The declaration's `retained-unenforced` state stays correct: the tool name in
the body does not exist on Codex, so nothing enforces the advice. Only the
note's hedge is wrong, and it should be rewritten to say what was found.

An earlier attempt at this test was void: the workspace had no current cycle,
and an empty cycle returns `[]` for the same reason a mis-filtered query does.
Five issues were moved into the cycle before the second attempt.

## Tool boundary: advisory, not mechanically enforced

PM's Codex tool boundary is **advisory**, and this is a statement about the
generated artifacts rather than a prediction about any session.

- Codex retains none of PM's canonical tool policy: `allowed-tools` is stripped
  on all six skills (diagnostics 1–6), and there is no Codex-side field it
  could map onto.
- PM ships no `agents/openai.yaml`, so unlike Teach it carries **no**
  mechanically enforced Codex policy of any kind — not even on invocation.
- What still constrains a session is Codex's own sandbox and approval policy,
  owned by the user's configuration. Nothing PM declares tightens it.
- The read-only discipline in both gates below was supplied by the **prompt**,
  not by the projection. Both sessions honored it; neither was prevented from
  doing otherwise. A clean run records compliance in that run, by that model,
  under that sandbox.

## Runtime acceptance result

### Observed (Codex)

1. **Fresh install and discovery — passed.** PM 0.13.1 was installed with
   `codex plugin add pm@jdh-agents`. The installed tree at
   `~/.codex/plugins/cache/jdh-agents/pm/0.13.1` is byte-for-byte identical to
   the compiled publication (`diff -r`, no differences). A fresh session listed
   all six skills under plugin `pm` with correct descriptions.
2. **Projection reached the runtime — passed.** The installed `groom/SKILL.md`
   contains no `allowed-tools`, no `argument-hint`, and no `Skill(`
   occurrences, confirming corrections 1 and 2 landed in the artifact a session
   actually reads.
3. **Linear tool mapping — passed with a naming gap.** Nineteen Linear calls in
   the groom gate and six in the breakdown gate, all
   `mcp__codex_apps__linear_*`. Both sessions stated plainly that no
   `mcp__linear-server__*` tool exists and proceeded. Neither was told the
   mapping.
4. **`linear-ops` degradation — passed.** See § The `linear-ops` fallback
   correction. This is the gate the 0.13.1 rewrite exists for.
5. **Collaborator degradation — passed.** No registered `vault-reader` and no
   vault tool. The groom session skipped the vault-unfiled pass and said so;
   the breakdown session had no vault step to skip. Neither invented a
   collaborator.
6. **NDR composition — passed.** Both sessions drove the `ndr` CLI. The
   breakdown session resolved six heads (`ndr:9n1m1a`, `ndr:w3z7h3`,
   `ndr:nes397`, `ndr:h3aggj`, `ndr:66z1f5`, `ndr:msdg46`) and used them to
   justify its first slice as a Spike. The groom session failed one resolution
   — `ndr:kknnpe`, cited by JUN-416, lives in a different repository's ledger —
   and marked the NDR-moot classification `unknown` rather than guessing.
7. **Repository guidance — passed.** The groom session read
   `jdh-agents/AGENTS.md` and `jdh-agents/CLAUDE.md`. The breakdown session
   read those plus `agentforge/AGENTS.md`, `agentforge/CLAUDE.md`, and
   `agentforge/CONTEXT.md`. `AGENTS.md` was read first in both, which is what
   correction 2 was aimed at.
8. **`breakdown` end-to-end — passed.** Three dependency-ordered vertical
   slices (Spike → Feature → Feature), each with a body conforming to
   `references/issue-body.md`, labels drawn from the workspace's real label
   set, and a complete intent block for the first. It declined to resolve
   `project`, because the matching project is canceled and several unrelated
   ones are open — a refusal the procedure calls for.
9. **`groom` end-to-end — passed.** Against a cycle holding five issues, the
   session classified every in-cycle ticket with a named criterion, produced
   the per-person WIP map (`@Jacob Hoehler: 0 in progress, 2 todo` /
   `Unassigned: 3`), and emitted the punch list in the skill's format: one
   Pull-in, one Push-out, thirteen Missing-fields. Where two criteria matched
   it named both and applied the precedence rule explicitly — Missing fields
   over Push-out, three times.
10. **`retro` end-to-end — passed as a mid-cycle stand-in.** Cycle 1 is the
    team's first and is still open, so this is not the end-of-cycle scenario
    the skill is written for. The session said so unprompted, marked `carried`
    unreachable with the reason, found no prior retros, omitted the Patterns
    section as the skill requires for a first retro, and drafted a
    deliberately thin retro rather than manufacturing content. It declined to
    choose a write target, because the cycle spans three projects.

### A taxonomy gap the groom gate exposed

`groom` instructs: "Classify each ticket into exactly ONE bucket per the
taxonomy below." Its taxonomy has no healthy / no-action bucket. For a ticket
that is in-cycle, unblocked, fully-fielded and fresh — JUN-401, plus thirteen
well-formed backlog tickets — the instruction is unsatisfiable.

Both runtimes reported it independently, on the same ticket. Codex named it
"no stated taxonomy bucket"; Claude walked all six buckets in turn, showed
why each fails for JUN-401, and wrote "No bucket applies... I am not
inventing one." Two models, two harnesses, one conclusion — so this is a PM
skill defect rather than a projection defect or a model artifact, and the
correct behavior against an impossible instruction is what both produced.

### An inconsistency between two gates

`groom` resolved `ndr:` references by driving the `ndr` CLI. `retro` reported
"no NDR tool is registered" and fell back to scanning a vault decisions folder
directly. Same runtime, same installed plugins, different conclusion — so the
difference is in how the two skills word their NDR step, not in what was
available. `retro`'s wording does not lead a session to the CLI that `groom`'s
does.

### Observed (Claude)

**Passed.** Claude Code's plugin cache held PM 0.7.0 — six minor versions
stale — so the leg was blocked until `claude plugin marketplace update
jdh-agents` plus `claude plugin update pm@jdh-agents` brought it to 0.13.1.
A fresh Claude Code session then ran `breakdown` and `groom` under the same
read-only prohibitions as the Codex gates, and confirmed it had loaded
`~/.claude/plugins/cache/jdh-agents/pm/0.13.1/skills/breakdown/SKILL.md` with
zero `Skill(` occurrences.

1. **`breakdown` — passed, and it is the control for the fallback rewrite.**
   A registered `linear:linear-ops` collaborator **was** available, so the
   session took the dispatch path and never reached the structural fallback,
   never opening `agents/linear-ops.md`. Paired with the Codex run, where no
   collaborator existed and the session read and followed that same file, this
   is the evidence that the 0.13.1 wording routes each runtime to the path it
   actually has. Six dependency-ordered slices, bodies composed to spec.
2. **`groom` — passed.** Same five in-cycle tickets, same buckets as the Codex
   run, same precedence call on JUN-420 (Missing fields over Push-out), same
   WIP map.
3. **The cycle gotcha held a third time**, on `mcp__linear-server__*`, inside
   the skill's own procedure rather than as an isolated probe.
4. **NDR composition — passed, and went further than Codex.** The session
   resolved all seven `ndr:` references in the cycle bodies by passing
   `--ledger` for the two external ledgers that own them
   (`homelab/decisions`, `lifeops/decisions`), and confirmed every one
   resolves to a current head — so `NDR-moot` is legitimately empty rather
   than unknown. The Codex `groom` run hit the same references, ran
   `ndr resolve` without `--ledger`, got "no atom with id" for all of them,
   and marked the classification `unknown`. Both sessions behaved correctly
   given what they tried; the skill's step 5 names no ledger, so which
   runtime succeeds is left to chance. A fifth follow-up.
5. **A second, undocumented gotcha.** `list_cycles` rejects the team *key*
   with a 400 Argument Validation Error and requires a UUID, so resolving the
   numeric cycle name needs a `list_teams` hop first. `groom`'s step 2 warns
   about the `cycle: "current"` trap and says nothing about this one, which
   sits directly in front of it.

### Automated

`bun test`, typecheck, and lint were not re-run for this record: no AgentForge
source changed. The corrections are confined to `jdh-agents` content, and the
compiler that produced the checked output is the pinned v1.0.0 release binary.

## Current disposition

**PM 0.13.1 is accepted on both runtimes.** All four of #104's Done-when
bullets are met:

| Done-when | Evidence |
|---|---|
| Linear/Obsidian ops, NDR composition, Librarian calls, repo guidance have working Codex equivalents | Static mapping review plus gates 3, 5, 6, 7 |
| Every compiler diagnostic has a reviewed disposition | 8 of 8, § Generated artifact findings |
| Groom, breakdown, retro each pass a fresh Codex smoke test | Gates 8, 9, 10 — four fresh sessions, one per scenario |
| The corresponding Claude Code workflows still pass | § Observed (Claude) — `breakdown` and `groom` on a fresh session at 0.13.1 |

The strongest single result is the fallback pair: on Codex, with no registered
collaborator, the session read and followed the shipped `linear-ops` procedure;
on Claude, with one registered, the session dispatched and never touched that
file. One sentence, two runtimes, each routed to the path it actually has —
which the pre-0.13.1 wording could not do, because it asserted that the absence
of the first implied the absence of the second.

Five follow-ups, none blocking acceptance, and the first four affect Claude and
Codex alike:

1. **Give `groom`'s taxonomy a healthy / no-action bucket**, or drop "exactly
   ONE bucket". Independently reported by both runtimes on JUN-401.
2. **Document the second cycle gotcha.** `list_cycles` rejects a team key and
   requires a UUID, so resolving the numeric cycle name needs a `list_teams`
   hop first. `groom`'s step 2 warns about the trap immediately after it and
   not about this one.
3. **Name the ledger in `groom`'s step 5.** A cycle's `ndr:` references
   frequently belong to other repositories' ledgers. Claude passed `--ledger`
   and resolved all seven; Codex did not and marked the classification
   `unknown`. Both behaved correctly given what they tried.
4. **Align `retro`'s NDR step with `groom`'s** so both reach the `ndr` CLI —
   see § An inconsistency between two gates.
5. **Rewrite the `mcp-tool-reference` declared-loss note** to state what the
   gotcha test found rather than hedging about what might hold.

One finding outside PM's scope, recorded so it is not lost: the Claude
`breakdown` session observed that `src/capabilities.ts:221` marks
`agent-reference` unsupported on `opencode/skill` on the stated grounds that
AgentForge projects no `agent` artifact to OpenCode. That is a citation whose
truth depends on a condition that Fibery #118 would change. It belongs to
#118, not here.

### Test-environment notes

`~/.codex/config.toml` was backed up before any change and `pm@jdh-agents` was
enabled in it. The Codex update prompt was answered "skip until next version",
pinning 0.154.0 for the exercise. Both are reversible and neither is PM
behavior.

The Linear workspace was modified once, deliberately, to make the `groom` and
`retro` gates runnable at all: five issues — JUN-97, JUN-401, JUN-416, JUN-419,
JUN-420 — were assigned to Cycle 1 from a Claude Code session with the user's
explicit approval. Linear moved all five from Backlog to Todo as a side effect
of cycle assignment. **No Codex session made a Linear write at any point**, in
any gate; every Codex run was held read-only by its prompt, and each reported
its own write-free status.

# Pi agent runtime acceptance

Fibery #141. Question: does an agent installed by AgentForge get discovered by
`@gotgenes/pi-subagents`, delegated to, and run under the controls it
declares? Result: **discovered, delegated to, and run under `model`,
`thinking`, `tools` and `max_turns`; `resume` works; three behaviors differ
from what an author would assume** (L-015 revised, L-016 new).

Last exercised: 2026-10-08.

- pi: 1.0.2
- `@gotgenes/pi-subagents`: 23.2.0 (`PI_SUBAGENTS_VERSION` in `src/targets/pi.ts`)
- Bun: 1.4.2
- Parent model `openai/gpt-6-luna`; the settings probe declares
  `openai/gpt-5.6-terra` so the declared model is distinguishable. Both run on
  the local ChatGPT-account OAuth credential.

## Re-running it

```sh
bun run acceptance:pi-agents          # exit code is the verdict
bun run acceptance:pi-agents --keep   # keep the throwaway directory
```

The script (`scripts/pi-agent-acceptance.ts`) installs the fixtures in
`tests/fixtures/pi-acceptance/` with `agentforge install --target pi` into a
throwaway project and a throwaway `PI_CODING_AGENT_DIR`, then runs seven fresh
`pi -p --mode json` sessions with the extension loaded through `-e`. It reads
what the extension reports on each `subagent` tool result (`modelName`, `tags`,
`turnBudget`, `agentId`) and what the child did to the filesystem. The agent
dir symlinks `auth.json` and `npm/` from `~/.pi/agent`; nothing is copied. The
script writes nothing in the real agent dir itself, but pi refreshes an expired
OAuth token in place through the `auth.json` link, so the real file can be
written during a run (see Credentials). On exit, SIGINT, SIGTERM or an uncaught
error the script unlinks both symlinks first, then removes the temp directory.
Before any scenario runs it refuses (exit 2) a parent model equal to the
declared child model, since the `model` row could not then tell a honored
declaration from an inherited one.

Exit 0 means every row matches its recorded expectation. A control that does
not hold is listed in the script's `EXPECTED` table with its limitation id, so
it passes only while it shows the specific recorded symptom: `max_turns` 1
reported as `turnBudget.maxTurns` 2, a caller's `max_turns: 5` winning (the
call args must carry 5 and `turnBudget.maxTurns` must be 5), and the
`Unknown agent type "acc-settings"` general-purpose fallback from a
subdirectory. Any other outcome (missing `turnBudget`, a timeout, a provider
error) is inconclusive and fails the run. The day a later extension honors the
control, the row reports `DIVERGED: ... no longer reproduces` and the run exits
1, which is the revisit trigger of the entry. Exit 1 also covers an
inconclusive scenario: the parent did not make the expected calls, a positive
control did not run, or pi timed out or exited non-zero (the scenario's rows
are all inconclusive; its stderr is kept beside the `.jsonl` under `--keep`).
The `extension absent` row reads only the assistant's own text, not the prompt
echoed in the JSON log. Exit 2 means setup failed (`pi` missing, the
extension absent or not at the pinned version, no credentials) and no verdict
was reached.

## Evidence

Each row has three separate entries: the claim as the extension documents it
(`docs/configuration.md` and `README.md` of 23.2.0), the artifact AgentForge
generated, and what the run observed.

| Control | Documented claim | Generated artifact | Observed |
| --- | --- | --- | --- |
| Project discovery | A project agent in `<cwd>/.pi/agents/<name>.md` is available as a `subagent_type`. | `.pi/agents/acc-settings.md` from `install --scope project`. | **Holds.** Found with no settings file in the agent dir and no `--approve`; also found under `--no-approve` (one extra manual run: that flag gates Pi's own project files, not the extension's scan). |
| Delegation | The parent delegates through the `subagent` tool. | The same file. | **Holds.** The parent called `subagent` with `subagent_type: "acc-settings"`; the result was `status completed` and the child's `ACC_SETTINGS_OK`. |
| `model` | The agent runs on its `model`; the caller may override. | `model: openai/gpt-5.6-terra` (from `targets.pi.model`). | **Holds.** Result details `modelName: openai/gpt-5.6-terra` under a `openai/gpt-6-luna` parent. |
| `thinking` | The agent runs at its `thinking` level. | `thinking: low` (from `effort: low`). | **Holds.** Result details `tags` include `thinking: low` under a parent at `off`. |
| `tools` allowlist | `tools` is the complete allowlist; a tool outside it is not available. | `tools: [read]` (from `targets.pi.tools`); control `acc-allpi` has no `tools` key. | **Holds.** Told to `touch` a marker with the bash tool, the `[read]` agent replied `NO_BASH_TOOL` and no file appeared; the control agent ran the same command and the file appeared. |
| `max_turns` ceiling | The harness stops the agent after `max_turns` turns. | `max_turns: 3`; control `acc-free` has none. | **Holds.** `turnBudget {maxTurns 3, used 3, phase exhausted}`, 3 tool uses, no `ALL_READ`; the control read all six files in 6 tool uses. A ceiling stop is reported to the parent as `Agent failed: This operation was aborted`. |
| `max_turns` of 1 | A limit below 2 is raised to 2 (minimum 2). | `max_turns: 1`. | **As documented; the render still emits 1.** `turnBudget.maxTurns` was 2, and the tool result says `max_turns 1 is below the minimum of 2 ... so the subagent runs with 2`. Already diagnosed by `pi-max-turns-raised` (L-015). |
| Caller override | A `subagent` call's `model`, `thinking` and `max_turns` win over the agent file unless the file sets `locked`. | `max_turns: 3`, no `locked` key (AgentForge emits none). | **Holds as documented, so the file value is not a bound.** A call passing `max_turns: 5` ran `turnBudget.maxTurns 5` against the file's 3. Diagnosed by `pi-caller-may-override` (L-016). |
| `resume` | A call with `resume: <Agent ID>` continues the same subagent with its context. | None: a tool parameter, no frontmatter key. | **Holds.** The resumed call kept the same `agentId` and answered `PELICAN-42`; a fresh `acc-memory` call without `resume` did not know it. |
| User scope | Agents in `$PI_CODING_AGENT_DIR/agents` are available from any directory. | `$PI_CODING_AGENT_DIR/agents/acc-user.md` from `install --scope user`. | **Holds.** Found from a directory with no `.pi/agents`. The default `~/.pi/agent` was not exercised; it is the same `getAgentDir()` call. |
| Project agents from a subdirectory | Discovery reads `<cwd>/.pi/agents` (the extension does not mention walking up). | `<root>/.pi/agents/acc-settings.md`, as AgentForge's project scope installs at the repository root. | **Does not load, and the failure is a fallback, not an error.** With pi started in `<root>/sub`, the result began `Note: Unknown agent type "acc-settings" — using general-purpose.` and ran a child on the parent model with the default tools and none of the file's controls. Confirms L-015's cwd-only claim and adds the fallback. |
| Extension absent | Not documented by the extension; core Pi reads no agent files (`README.md` of pi 1.0.2). | `.pi/agents/acc-settings.md` present. | **Holds, with the weaker evidence.** With `--no-extensions` and no `-e`, the parent reported it had no `subagent` tool and made no call; the same prompt shape delegates when the extension is loaded. A file read cannot be observed from outside, so "nothing reads the files" rests on the missing tool plus the core README, not on a trace. |

## Not covered

- `display_name`, `prompt_mode`, `inherit_context`, `enabled`, `locked`:
  AgentForge emits none of them (`src/targets/pi.ts`), so there is no artifact
  to accept. `run_in_background` is emitted only from `background`; not probed.
- An unknown tool name in `tools` and malformed YAML: still inferred from the
  loader's code, not run (L-015 evidence).
- `defaultProjectTrust: ask` in an interactive session. The runs were
  non-interactive with no `settings.json` in the throwaway agent dir.
- Whether the child's system prompt carries the agent body; the runs show the
  controls, and each child answered its fixture's instruction.
- Models: only the two named above. `sonnet`-style fuzzy names are not emitted
  by AgentForge (the Pi `model` is written as `provider/id`).

## Credentials

The throwaway agent dir links the existing `auth.json` (OAuth). The script does
not read or print it. Pi refreshes an OAuth token through the link when it has
expired (it writes `auth.json` in place, not by rename), so the real
`~/.pi/agent/auth.json` can be written during a run and the rotated token lands
there; the link is not replaced and no credential is lost. Pi's refresh lock
resolves to the throwaway directory, so a concurrent real pi session refreshing
at the same moment is not serialized against this run. Do not run the script
while another pi session is active.

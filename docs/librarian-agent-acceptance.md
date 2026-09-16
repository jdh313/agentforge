# Librarian agent runtime acceptance

This record characterizes the Librarian `vault-reader` role without treating
generated files as runtime proof. It separates package and leaf-agent surfaces
because Claude and Codex do not expose equivalent package semantics.

Last exercised: 2026-09-16

Harnesses:

- Claude Code 2.1.273
- Codex CLI 0.154.0
- AgentForge revision parent: `4052a7bd`
- Representative package: `jdh-agents/plugins/librarian` 0.19.0

## Evidence classes

- **Documented** means current primary documentation claims the behavior.
- **Generated** means AgentForge emitted the expected native artifact.
- **Observed** means a fresh harness run produced a trace or result.

No row is supported solely because its native file compiled or validated.

## Surface matrix

| Capability | Claude package | Codex package | Codex leaf agent |
|---|---|---|---|
| Package discovery | Observed in the fresh runtime init event | Plugin loads skills and other supported components | Not applicable |
| Named agent registration | Observed by direct selection and parent delegation | Unsupported: package `agents/*.md` is inert procedure text | Generated, but not observed on 0.154.0 |
| Model | Observed Sonnet selection in runtime usage metadata | Unsupported | A target-specific Codex model can be generated; runtime application not observed |
| Effort | Declared as `medium`; effective value was not exposed by the Claude result | Unsupported | Generated, but the fresh child inherited `medium` instead of the probe's `high` |
| Turn limit | Observed in a spawned synthetic agent stopped after its configured two turns | Unsupported | Unsupported by the current Codex projection |
| Tool/read-only enforcement | Top-level tools were scoped, but `Bash(obsidian-cli *)` did not prevent a delegated child from executing `pwd` | Unsupported and declared as stripped | Unsupported by the current projection; parent sandbox still applies |
| Delegation and isolation | Observed in a distinct `librarian:vault-reader` child with one `Read` call | Impossible through the package role | A separate child thread was observed, but it was a generic named task rather than the configured custom agent |
| Same-agent follow-up | Observed only for a background child; foreground completion discarded the resumable transcript | Impossible through the package role | Harness follow-up exists, but generated Librarian workflow parity is unproven |
| Plugin references | Observed expansion and successful read from the absolute plugin path | Copied but the variable remains literal and unresolved | Out of scope for a standalone leaf agent |

## Documentation claims

Claude documents plugin agents under `agents/*.md`, including `model`,
`effort`, `maxTurns`, and tool filters. It also documents inline substitution
of `${CLAUDE_PLUGIN_ROOT}` in agent content. Resuming a completed subagent uses
`SendMessage` and requires agent teams to be enabled.

- <https://code.claude.com/docs/en/plugins-reference>
- <https://code.claude.com/docs/en/subagents>

Codex documents standalone custom-agent TOML under `~/.codex/agents/` or
`.codex/agents/`. Required fields are `name`, `description`, and
`developer_instructions`; normal session configuration keys such as `model`,
`model_reasoning_effort`, and `sandbox_mode` may also be present. The `name`
field is documented as authoritative rather than the filename.

- <https://learn.chatgpt.com/docs/agent-configuration/subagents>

Codex does not document plugin-bundled agent registration. AgentForge's
package projection therefore retains Librarian's agent Markdown as an inert
procedure and reports the upstream limitation in L-010.

## Generated artifact findings

The representative Claude package retains `vault-reader` frontmatter:

- `model: sonnet`
- `effort: medium`
- `maxTurns: 10`
- its read-only `tools` list
- `${CLAUDE_PLUGIN_ROOT}` and `SendMessage` prose

The representative Codex package emits only
`packages/librarian/agents/vault-reader.md`. It is not registered or spawnable.
Its declared losses correctly say that tool filtering is stripped, MCP names
are retained but unavailable, and `${CLAUDE_PLUGIN_ROOT}` remains unresolved.

The synthetic leaf agent installs at `.codex/agents/vault-reader.toml` without
pruning siblings. Its generated TOML contains identity, instructions, and
`model_reasoning_effort`; Claude's `model: sonnet`, `maxTurns`, and `tools` are
stripped with a diagnostic.

## Fresh runtime observations

All probes used an isolated directory under `/private/tmp`; no user-level
agent installation was made.

### Claude package

The generated Librarian package was loaded with `--plugin-dir`, and the scoped
agent was selected with `--agent librarian:vault-reader`.

With user-level settings enabled, two early direct runs stopped after many
turns and returned empty results. A synthetic inline agent behaved the same
way, so those runs do not establish a Librarian or `maxTurns` defect. The
settings-isolated control used `--setting-sources project` and
`--disable-slash-commands`; it established:

- the scoped name resolved without a registration error;
- runtime metadata reported `claude-sonnet-5`, consistent with `model: sonnet`;
- the real scoped agent completed a no-tool marker request in one turn;
- runtime init listed the four Librarian agents and exposed only `Bash` and
  `Read` to `vault-reader`;
- `${CLAUDE_PLUGIN_ROOT}` expanded to the absolute package path; and
- after that package directory was explicitly allowed, `Read` loaded
  `references/vault-conventions.md` and returned its heading.

A parent-session probe then spawned `librarian:vault-reader`. The trace recorded
the scoped agent type, resolved Sonnet model, a separate child context, one
`Read` call, and a structured result. This establishes native registration,
delegation, isolation, model selection, read-tool restriction, and plugin-root
resource resolution.

Continuity depends on dispatch mode in Claude Code 2.1.273:

- A foreground child returned an agent ID, but `SendMessage` immediately
  failed with `No transcript found` after the child completed.
- A background child completed, was resumed by `SendMessage` using the same
  ID, and answered from retained context without a
  second read. The initial read had deliberately stopped before the requested
  bullet, and the resumed child correctly reported that limitation rather than
  re-reading.

The generated agent file does not encode foreground versus background dispatch.
Librarian's caller workflow must therefore request background execution for any
reader it intends to re-engage. The current prose claim that any completed
subagent can be resumed is not true for the observed foreground path.

A separate settings-isolated synthetic agent used `maxTurns: 2`, exposed only
`Read`, and was instructed to perform three sequential reads. When spawned by a
parent, the child made exactly two `Read` calls and the runtime returned
`NOTE: this agent stopped at its 2-turn limit before finishing.` This isolates
and establishes spawned-agent turn-limit enforcement. Running the same agent
directly with `--agent` did not enforce the limit, so this evidence applies to
delegated subagents rather than to selection as the session's main agent.

Command-pattern enforcement failed its settings-isolated negative control. A
synthetic delegated agent declared only `Bash(obsidian-cli *)` but successfully
executed `pwd`. The real delegated `librarian:vault-reader` did the same under
`dontAsk`, with no permission denial. Claude honored the top-level tool names
by exposing only `Bash` and `Read`, but the observed release did not enforce the
declared Bash subcommand pattern. The role is therefore not runtime-enforced as
read-only against arbitrary shell commands; its prompt remains part of that
boundary.

### Codex leaf agent

AgentForge installed and checked the synthetic leaf successfully. A persistent
`codex exec --json` session then delegated a file-read task. The persisted
rollout trace, rather than the abbreviated stdout JSON, showed:

- a distinct child thread and `/root/vault_reader` agent path;
- a read-only sandbox inherited from the parent;
- the child alone reading the probe file;
- a structured result returned to the parent.

This proves generic Codex delegation and context isolation for the probe. It
does **not** prove custom-agent discovery. The child used the parent's
`gpt-5.6-sol` model and `medium` effort, ignored a distinctive custom
`developer_instructions` marker, and did so even after the project was made a
Git repository and the TOML filename and `name` were both normalized to
`vault_reader`.

This matches open upstream reports that the V2 spawn surface omits the custom
role selector and therefore spawns generic children even when standalone agent
TOML exists. In particular, OpenAI Codex issues
[#26363](https://github.com/openai/codex/issues/26363) and
[#31097](https://github.com/openai/codex/issues/31097) describe the same
inherited-model and ignored-instructions behavior. The source still contains
role loading through `[agents.<role>]` plus `config_file`, but the active V2
tool must expose a role selector before the loaded definition can be selected.

An ephemeral run also produced `collab spawn failed: no thread with id`; the
same probe without `--ephemeral` spawned normally. Ephemeral mode is therefore
not suitable evidence for this version's multi-agent acceptance.

## Disposition

The ticket cannot honestly pass as one cross-runtime parity claim.

- Claude package registration, model selection, scoped tools, delegation,
  isolation, spawned-agent turn limiting, plugin-root resolution, and
  background-child continuity have positive runtime evidence. Effort remains
  unverified, and Bash-pattern enforcement has negative runtime evidence.
- Claude follow-up parity is conditional: the caller must spawn the persistent
  reader in the background. A foreground child cannot be resumed on the tested
  release despite returning an agent ID.
- Codex package agent semantics remain explicitly unsupported.
- Codex leaf installation is supported. Native custom-agent discovery and
  setting application remain unverified on 0.154.0 despite successful generic
  delegation.
- `@vault-reader`, `SendMessage`, and `${CLAUDE_PLUGIN_ROOT}` must be replaced,
  translated, or rejected for a Codex-specific workflow; copied prose is not
  compatibility.

## Next probes

1. Determine whether Codex 0.154.0 can use the older `[agents.<role>]`
   `config_file` registration path or a feature gate before standalone TOML is
   selectable through a V1 spawn surface.
2. Only after native discovery is visible, test same-thread follow-up using a
   retained nonce and stable child thread ID.

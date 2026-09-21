# Field parity: skill and agent

Every frontmatter field the canonical `SKILL.md` and `AGENT.md` schemas accept,
what each one becomes on Claude Code and on Codex, and — where it is dropped —
whether any field on the other side could ever carry it. The last group in each
table reads the other way: harness fields no canonical key can set.

**Sources, and what outranks this file.** Rows are read off `src/schema.ts`
(canonical keys), `src/frontmatter.ts` (per-target acceptance and its cited
`source` strings), `src/targets/claude.ts` and `src/targets/codex.ts` (output
schemas and the native TOML serializer), `src/capabilities.ts` (translations),
and `src/targets/codex-marketplace.ts` (the `agents/openai.yaml` sidecar). Those
are authoritative; this file is a reading of them at one moment and goes stale
the way any table does. Verified against **codex-cli 0.155.1** and **Claude Code
2.1.274**, 2026-09-21; the Agent `skills` row retains its codex-cli 0.154.0
live A/B evidence (L-013), while role selection and project discovery were
re-verified on 0.155.1 (L-011 and L-012).

**Not in scope here:** why a row is the way it is (NDR ledger, cited as
`ndr:<id>` from the source files themselves), what is unbuildable (
[limitations.md](limitations.md), cited as `L-0NN`), and what is merely not
built yet ([roadmap.md](roadmap.md)).

## Dispositions

| Disposition | Meaning |
| --- | --- |
| **Native** | Emitted under a field the harness reads. |
| **Translated** | Renamed or moved to a different native form. |
| **Blocked** | Dropped today, but a field on that harness could hold it. The cell names that field and the objection currently stopping the mapping. These are the rows that can move. |
| **No analogue** | Dropped with nowhere to go: the harness has no field, and often no concept, that could carry it. These move only if the harness grows one. |
| **Unmapped** | The reverse gap: a field the harness reads that no canonical key addresses, so an author cannot set it. Its canonical column reads *none*. |

Blocked and No analogue are both reported as `claude-only-frontmatter-stripped`.
The split is a judgement about the destination, not a distinction agentforge's
diagnostics make. A **Blocked** row moves to Native or Translated only once the
semantics are verified against the harness's own loader: a declared destination
agentforge writes to is a claim the harness reads it (ndr:d17fnt).

## Skill

`SKILL.md` · directory layout · `scripts/` `references/` `assets/`

Claude retains every key it defines. Codex takes the two Agent Skills fields plus
one translated invocation policy. Codex's only other declarative surface for a
skill is the `agents/openai.yaml` sidecar, whose known keys are
`interface.display_name`, `interface.short_description` and
`policy.allow_implicit_invocation` — so that file is the one place a future
mapping could land.

### Shared by both harnesses

| Canonical field | Claude | Codex |
| --- | --- | --- |
| `name` <br> lowercase, ≤64 chars | **Native** — `name` | **Native** — `name` |
| `description` <br> required | **Native** — `description` | **Native** — `description` |
| `disable-model-invocation` <br> boolean | **Native** — `disable-model-invocation` | **Translated** — `agents/openai.yaml` → `policy.allow_implicit_invocation: false`. Sidecar file, not frontmatter. Skill stays runnable from the `$` picker (L-004). |
| `body` <br> markdown below frontmatter | **Native** — SKILL.md body | **Native** — SKILL.md body. No templating: `$ARGUMENTS`, `${CLAUDE_*}`, `` !`…` `` reach the model as literal text and warn. |

### Claude-only

| Canonical field | Claude | Codex |
| --- | --- | --- |
| `allowed-tools` <br> string \| string[] | **Native** — `allowed-tools` | **No analogue.** No tool allowlist on a Codex skill or in `openai.yaml`; `sandbox_mode` is agent-role only and cannot back a per-tool guarantee (L-002). |
| `disallowed-tools` | **Native** — `disallowed-tools` | **No analogue.** No denylist on any Codex skill surface. |
| `when_to_use` | **Native** — `when_to_use` | **Blocked** → `interface.short_description` (openai.yaml), the one Codex field that steers when a skill surfaces. Currently fed from `description` on the marketplace path, so a mapping has to decide which key wins. |
| `argument-hint` | **Native** — `argument-hint` | **No analogue** on the skill surface. Codex substitutes arguments on its *prompt* surface only, which is a different artifact, not a field a skill can set. |
| `arguments` | **Native** — `arguments` | **No analogue.** Same reason as `argument-hint`: a Codex skill takes no invocation-time argument. |
| `user-invocable` | **Native** — `user-invocable` | **Blocked** → the `policy:` block beside `allow_implicit_invocation`, if Codex ever documents the inverse switch. No key hiding a skill from the `$` picker is known today. |
| `model` | **Native** — `model` | **Blocked.** Nothing at skill level — Codex pins a model per *agent role* (`model`), not per skill. Reachable only by authoring the same behavior as an agent. |
| `effort` <br> low \| medium \| high \| xhigh \| max | **Native** — `effort` | **Blocked.** Nothing at skill level; `model_reasoning_effort` exists on the agent role, where agentforge already translates this same key. |
| `context` <br> fork | **Native** — `context` | **No analogue.** Context forking is a Claude Code execution mode with no Codex declarative form. |
| `agent` | **Native** — `agent` | **No analogue** on the skill/plugin surface: a plugin registers no Codex agent role (L-010). Standalone Codex roles are selectable, but a skill cannot name one declaratively through this field. |
| `hooks` | **Native** — `hooks` | **Translated with scope loss** → a separate package hook file and manifest entry during marketplace compilation. Codex loads it for the whole enabled package, including before the skill is invoked; standalone leaf rendering still drops it. `once` is stripped with a warning. Event and matcher parity are tracked in [hook-event-parity.md](hook-event-parity.md) (L-009; ndr:pz1x3e). |
| `paths` | **Native** — `paths` | **No analogue.** No path-scoping key on any Codex skill surface. |
| `shell` <br> bash \| powershell | **Native** — `shell` | **No analogue**, and moot on Codex: hooks are unavailable on Windows there, so the PowerShell half has no runtime. |

### No canonical field — the harness reads it, agentforge cannot set it

| Canonical field | Claude | Codex |
| --- | --- | --- |
| *none* | n/a — Claude derives a skill's display label from `name`; there is no separate display field to miss. | **Unmapped** — `agents/openai.yaml` → `interface.display_name`. Emitted on the marketplace path, humanized from `name`. An author cannot give a Codex skill a display name that differs from its slug. |
| *none* | n/a | **Unmapped** — `agents/openai.yaml` → `interface.short_description`. Emitted from `description`. It is also the standing candidate for `when_to_use` above, which is why a canonical key of its own has to decide which value wins. |

### Authoring layer — never emitted anywhere

| Canonical field | Both targets |
| --- | --- |
| `targets.<name>` <br> per-target override block | **Consumed.** Deep-merged over the top level for that target, then removed. `targets.<name>.body` replaces the body wholesale; no partial templating. |

## Agent

`AGENT.md` · file layout · Claude `.md` / Codex `.toml`

Claude emits Markdown frontmatter under the same key names its own loader reads.
Codex emits a native agent-role TOML whose entire override set is eight fields —
`developer_instructions`, `model`, `model_reasoning_effort`,
`model_reasoning_summary`, `model_verbosity`, `personality`, `service_tier`,
`skills`. That last one shares a name with a canonical key but not its meaning,
so it is No analogue: a role can use it only to remove skills from the child
(L-013). A Blocked answer here names one of the other seven (or `sandbox_mode`
on the same struct), or a Codex surface outside the role document (`mcpServers`,
`hooks`); anything else is No analogue.

### Shared by both harnesses

| Canonical field | Claude (.md) | Codex (.toml) |
| --- | --- | --- |
| `name` <br> lowercase-hyphenated, required | **Native** — `name` | **Native** — `name` |
| `description` <br> required | **Native** — `description` | **Native** — `description` |
| `effort` <br> low \| medium \| high \| xhigh \| max | **Native** — `effort` | **Translated** — `model_reasoning_effort`. All five canonical values are accepted Codex reasoning levels. |
| `model` | **Native** — `model` | **Translated** — `model`, only from `targets.codex.model`. A bare top-level `model:` is a Claude model name and is stripped rather than leaked into Codex's namespace (L-008). |
| `body` <br> markdown below frontmatter | **Native** — Markdown body | **Translated** — `developer_instructions`. TOML string, required non-blank. No substitution of any kind — an agent role has no invocation-time argument. |

### Claude-only

| Canonical field | Claude (.md) | Codex (.toml) |
| --- | --- | --- |
| `skills` <br> string \| string[] | **Native** — `skills` | **No analogue**, though Codex has a same-named field: a role's `skills` is the `config.toml` `[skills]` table, which can only remove skills from the child, never preload them. A Claude-style list is worse than lost: Codex drops the whole role file (L-013). |
| `tools` <br> string \| string[] | **Native** — `tools` | **Blocked** → `sandbox_mode`, the nearest adjacent field on the native struct — deliberately never set from a tool list, because a sandbox mode cannot back the per-tool enforcement guarantee an allowlist claims. |
| `disallowedTools` | **Native** — `disallowedTools` | **Blocked** → `sandbox_mode` only, with the same objection — and a denylist is the harder half to approximate, since a sandbox tightens broadly rather than naming tools. |
| `permissionMode` <br> default \| acceptEdits \| auto \| dontAsk \| bypassPermissions \| plan \| manual | **Native** — `permissionMode`. Honored at user and project scope; Claude's *plugin* agent loader ignores it with a warning. | **Blocked** → `sandbox_mode` as the nearest posture field — but no agent-role field carries permission *policy*, and the two vocabularies do not line up value for value. |
| `maxTurns` <br> positive int | **Native** — `maxTurns` | **No analogue.** No per-role turn limit anywhere in the 0.154.0 field set. |
| `isolation` <br> worktree \| remote | **Native** — `isolation` | **No analogue.** No execution-isolation field on an agent role. |
| `memory` <br> user \| project \| local | **Native** — `memory` | **No analogue.** The `memory` literal in the binary belongs to its Claude Code importer's path list, not to the agent-role document. |
| `background` <br> bool or "true"/"false" | **Native** — `background` | **No analogue**, no declarative form. Codex backgrounding is a spawn-time tool argument, decided by the caller rather than by role metadata. |
| `omitClaudeMd` <br> bool or "true"/"false" | **Native** — `omitClaudeMd` | **No analogue, ever.** It names CLAUDE.md, a Claude Code file, so no equivalent can exist on another harness. |
| `initialPrompt` | **Native** — `initialPrompt` | **Blocked** → `developer_instructions` by appending it — but that field already holds the body, and folding a first user turn into instructions changes what the text is, not just where it sits. |
| `color` | **Native** — `color` | **No analogue.** A Claude Code display affordance; Codex's unused `personality` is behavioral tone, not presentation. |
| `mcpServers` <br> array | **Native** — `mcpServers`. Ignored by the plugin loader, same as `permissionMode`. | **Blocked** → Codex's session-wide MCP configuration — never a per-role field, so carrying it would change a per-agent declaration into a global one. |
| `hooks` | **Native** — `hooks`; Claude converts an agent `Stop` hook to `SubagentStop` while the agent runs. | **Translated with scope loss** → a separate package hook file and manifest entry during marketplace compilation. Agent `Stop` becomes `SubagentStop`, but Codex loads the hook for the whole enabled package, so it can fire outside that agent. Standalone leaf rendering still drops it (ndr:pz1x3e). |
| `experimental` | **Native** — `experimental` | **No analogue.** Experimental by name, so no cross-target equivalent can be claimed for its contents. |

### No canonical field — the harness reads it, agentforge cannot set it

| Canonical field | Claude (.md) | Codex (.toml) |
| --- | --- | --- |
| *none* | **Unmapped** — `observer` · `observerMessage` · `observeSubagents`. Claude Code 2.1.274's loader reads all three, but no published documentation does. Left out on purpose: enumerating them would claim a contract nothing backs. Written today, each reports `unrecognized-frontmatter-key` and is stripped on Claude too. | n/a — no observation fields on an agent role. |
| *none* | n/a — no reasoning-summary control in Claude's agent frontmatter. | **Unmapped** — `model_reasoning_summary`. In the override set, never emitted. A canonical key would have to be authored Codex-first. |
| *none* | n/a | **Unmapped** — `model_verbosity`. In the override set, never emitted. |
| *none* | n/a — Claude's `color` is presentation, not tone; not the same field. | **Unmapped** — `personality`. In the override set, never emitted. |
| *none* | n/a | **Unmapped** — `service_tier`. In the override set, never emitted. An account-level billing/latency pin with no Claude counterpart in frontmatter. |
| *none* | n/a | **Unmapped** — `sandbox_mode`. On the native struct and deliberately unset — it is the standing candidate for `tools`, `disallowedTools` and `permissionMode`, so a canonical key of its own would be the Codex-first way to reach it honestly. |

### Authoring layer — never emitted anywhere

| Canonical field | Both targets |
| --- | --- |
| `targets.<name>` | **Consumed.** Same merge rule as the skill artifact; `targets.codex.model` is the one override read directly by the native-document path. |

## Notes

- **Unmapped rows read in the other direction.** Every other row starts from a
  canonical key and asks what each harness does with it. The Unmapped rows start
  from the harness and ask what agentforge can express — a gap closed by adding a
  canonical key, not by changing a projection. Half of Codex's eight agent-role
  overrides sit there.
- **Unknown keys.** Canonical schemas are `z.looseObject`, so a key neither
  schema enumerates survives parse long enough to report
  `unrecognized-frontmatter-key`, then is stripped on every target including
  Claude (L-001). A key listed in `authoring-keys` in `PACKAGE.yaml` is stripped
  silently instead.
- **Install scope.** Skills reach user, project and plugin scope on both
  harnesses. Claude agents reach all three (resources ride along at plugin scope
  only); Codex agents install at user (`$CODEX_HOME/agents`) and project
  (`.codex/agents`) scope. Plugin packages register no Codex agent role at all
  (L-010), so marketplace agent translation falls back to a Markdown procedure.
- **Other artifacts.** `output-style` is the third leaf artifact and projects to
  Claude only; `mcp` is unimplemented.

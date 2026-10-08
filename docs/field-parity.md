# Field parity: skill and agent

Every frontmatter field the canonical `SKILL.md` and `AGENT.md` schemas accept,
what each one becomes on Claude Code, on Codex and on Pi, and —
where it is dropped — whether any field on the other side could ever carry it. The last group in each
table reads the other way: harness fields no canonical key can set.

**Sources, and what outranks this file.** Rows are read off `src/schema.ts`
(canonical keys), `src/frontmatter.ts` (per-target acceptance and its cited
`source` strings), `src/targets/claude.ts` and `src/targets/codex.ts` (output
schemas and the native TOML serializer), `src/capabilities.ts` (translations),
and `src/targets/codex-marketplace.ts` (the `agents/openai.yaml` sidecar); the Pi agent column also reads `src/targets/pi.ts` (`piAgentDocument.serialize`). Those
are authoritative; this file is a reading of them at one moment and goes stale
the way any table does. The Pi agent column reads `@gotgenes/pi-subagents` **23.2.0** (`PI_SUBAGENTS_VERSION`, `src/targets/pi.ts`) from its source on 2026-10-08, not from a run (L-015). Verified against **codex-cli 0.155.1** and **Claude Code
2.1.274**, 2026-09-21; the Agent `skills` row retains its codex-cli 0.154.0
live A/B evidence (L-013), while role selection and project discovery were
re-verified on 0.155.1 (L-011 and L-012). The Pi skill column was read off `src/targets/pi.ts`,
the `pi/skill` capability row, and Pi's `docs/skills.md` on 2026-10-06.

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
| **Ruled out** | An Unmapped field that was considered for a canonical key and declined. The cell gives the reason and the trigger that reopens it. |

Blocked and No analogue are both reported as `claude-only-frontmatter-stripped`,
except a translation-only key (retained by no target, e.g. `short-description`, `reasoning-summary`, `verbosity`, `sandbox-mode`, `approval-policy`),
which reports nothing where it is not translated — except on Pi's agent projection, which reports the four Codex-only agent keys as keys it does not accept (ndr:az33k6). (`sandbox-mode` and
`approval-policy` do report where they are translated, as
`codex-role-policy-not-applied`, because Codex does not apply them; L-014.)
The split is a judgement about the destination, not a distinction agentforge's
diagnostics make. A **Blocked** row moves to Native or Translated only once the
semantics are verified against the harness's own loader: a declared destination
agentforge writes to is a claim the harness reads it (ndr:d17fnt).

## Skill

`SKILL.md` · directory layout · `scripts/` `references/` `assets/`

Claude retains every key it defines. Codex takes the two Agent Skills fields plus
two translated keys (invocation policy and `short-description`). Codex's only
other declarative surface for a skill is the `agents/openai.yaml` sidecar, whose
known keys are `interface.display_name`, `interface.short_description`,
`interface.icon_small`, `interface.icon_large`, `interface.brand_color`,
`interface.default_prompt`, `dependencies.tools[]` and
`policy.allow_implicit_invocation` — so that file is the one place a future
mapping could land. Pi implements Agent Skills and retains four keys natively:
`name`, `description`, `allowed-tools` and `disable-model-invocation`. Its
documented frontmatter has no other field a Claude-only key could land in.

### Shared by all three harnesses

| Canonical field | Claude | Codex | Pi |
| --- | --- | --- | --- |
| `name` <br> lowercase, ≤64 chars | **Native** — `name` | **Native** — `name` | **Native** — `name`; also the `/skill:name` command. |
| `description` <br> required | **Native** — `description` | **Native** — `description` | **Native** — `description` |
| `disable-model-invocation` <br> boolean | **Native** — `disable-model-invocation` | **Translated** — `agents/openai.yaml` → `policy.allow_implicit_invocation: false`. Sidecar file, not frontmatter. Skill stays runnable from the `$` picker (L-004). | **Native** — `disable-model-invocation`. Hides the skill from automatic model selection. |
| `body` <br> markdown below frontmatter | **Native** — SKILL.md body | **Native** — SKILL.md body. No templating: `$ARGUMENTS`, `${CLAUDE_*}`, `` !`…` `` reach the model as literal text and warn. | **Native** — SKILL.md body. No templating, same warnings as Codex. Text typed after `/skill:name` is appended as a user request, not substituted into the body. |

### Claude-first

| Canonical field | Claude | Codex | Pi |
| --- | --- | --- | --- |
| `allowed-tools` <br> string \| string[] | **Native** — `allowed-tools` | **No analogue.** No tool allowlist on a Codex skill or in `openai.yaml`; `sandbox_mode` is agent-role only and cannot back a per-tool guarantee (L-002). | **Native** — `allowed-tools`. Pi documents it as experimental. |
| `disallowed-tools` | **Native** — `disallowed-tools` | **No analogue.** No denylist on any Codex skill surface. | **No analogue.** Pi's tool field is an allowlist only; nothing removes one named tool. |
| `when_to_use` | **Native** — `when_to_use` | **Blocked** → `description`, Codex's only routing field (`interface.short_description` is a UI blurb and does not steer selection). Concatenating into it rewrites the text the author wrote for every target; `targets.codex.description` is the manual route today. | **Blocked** → `description`, Pi's only routing field. Concatenating into it rewrites the text the author wrote for every target; `targets.pi.description` is the manual route today. |
| `argument-hint` | **Native** — `argument-hint` | **No analogue** on the skill surface. Codex substitutes arguments on its *prompt* surface only, which is a different artifact, not a field a skill can set. | **No analogue.** Pi appends whatever follows `/skill:name` as a user request; no field declares or hints at that text. |
| `arguments` | **Native** — `arguments` | **No analogue.** Same reason as `argument-hint`: a Codex skill takes no invocation-time argument. | **No analogue.** No named arguments and no substitution: trailing text arrives as one appended request. |
| `user-invocable` | **Native** — `user-invocable` | **Blocked** → the `policy:` block beside `allow_implicit_invocation`, if Codex ever documents the inverse switch. No key hiding a skill from the `$` picker is known today. | **No analogue.** Every Pi skill is reachable as `/skill:name`; no documented field hides it. |
| `model` | **Native** — `model` | **Blocked.** Nothing at skill level — Codex pins a model per *agent role* (`model`), not per skill. Reachable only by authoring the same behavior as an agent. | **No analogue.** No per-skill model key. Pi's agent projection carries `model`, but a skill is not an agent. |
| `effort` <br> low \| medium \| high \| xhigh \| max | **Native** — `effort` | **Blocked.** Nothing at skill level; `model_reasoning_effort` exists on the agent role, where agentforge already translates this same key. | **No analogue.** Same reason as `model`. |
| `context` <br> fork | **Native** — `context` | **No analogue.** Context forking is a Claude Code execution mode with no Codex declarative form. | **No analogue.** Pi loads a skill into the current conversation; no documented key forks it. |
| `agent` | **Native** — `agent` | **No analogue** on the skill/plugin surface: a plugin registers no Codex agent role (L-010). Standalone Codex roles are selectable, but a skill cannot name one declaratively through this field. | **No analogue** on the skill surface: a Pi skill cannot name an agent declaratively through this field, and agentforge compiles no Pi package that could register one. |
| `hooks` | **Native** — `hooks` | **Translated with scope loss** → a separate package hook file and manifest entry during marketplace compilation. Codex loads it for the whole enabled package, including before the skill is invoked; standalone leaf rendering still drops it. `once` is stripped with a warning. Event and matcher parity are tracked in [hook-event-parity.md](hook-event-parity.md) (L-009; ndr:pz1x3e). | **No analogue.** Pi skill frontmatter has no hooks key, and agentforge compiles no Pi package that could carry a hook file. |
| `paths` | **Native** — `paths` | **No analogue.** No path-scoping key on any Codex skill surface. | **No analogue.** No path-scoping key. Pi resolves relative file references against the skill directory, which is a different operation. |
| `shell` <br> bash \| powershell | **Native** — `shell` | **No analogue**, and moot on Codex: hooks are unavailable on Windows there, so the PowerShell half has no runtime. | **No analogue**, and moot: Pi runs no `` !`…` `` injection, so there is nothing to pick a shell for. |

### Codex-first

| Canonical field | Claude | Codex | Pi |
| --- | --- | --- | --- |
| `short-description` <br> string, optional | **No analogue.** Claude Code skill frontmatter has no UI-blurb field; the listing text comes from `description`. Stripped silently, not reported: Claude never owned the key. | **Translated** — `agents/openai.yaml` → `interface.short_description` (JSON-quoted), in the same sidecar as the invocation policy. Codex documents 25-64 characters; outside that range, on a skill or a command-derived skill, emits `codex-short-description-length` and still writes the value as given. A command's own Claude output drops the key. Checked against codex-cli 0.160.0 (this row only; the rest of the doc is verified at the version in the header). UI-only: `description` alone drives implicit selection (codex-cli 0.160.0). Never derived from `description`; unset, the key is omitted. | **No analogue.** Pi's skill frontmatter has no UI-blurb field, so the key is stripped silently. |

### No canonical field — the harness reads it, agentforge cannot set it

| Canonical field | Claude | Codex | Pi |
| --- | --- | --- | --- |
| *none* | n/a — Claude derives a skill's display label from `name`; there is no separate display field to miss. | **Unmapped** — `agents/openai.yaml` → `interface.display_name`. Emitted on the marketplace path only, humanized from `name`; no author has needed a label that differs from the slug, so no canonical key exists yet. | n/a — `name` doubles as the display name. |
| *none* | Not checked here. | Not checked here. | **Unmapped** — `license` · `compatibility` · `metadata`. Agent Skills fields Pi documents; `src/schema.ts` enumerates none of them, so each reports `unrecognized-frontmatter-key` and is stripped. |

### Authoring layer — never emitted anywhere

| Canonical field | All targets |
| --- | --- |
| `targets.<name>` <br> per-target override block | **Consumed.** Deep-merged over the top level for that target, then removed. `targets.<name>.body` replaces the body wholesale; no partial templating. |

## Agent

`AGENT.md` · file layout · Claude `.md` / Codex `.toml` / Pi `.md`

Pi has no native agent surface: core Pi 1.0.2 reads no agent files. The Pi
column describes the third-party `@gotgenes/pi-subagents` extension, **pinned at
23.2.0** (`PI_SUBAGENTS_VERSION` in `src/targets/pi.ts`; ndr:az33k6, L-015). Its
loader reads eleven frontmatter keys and ignores every other key without a
warning, so the column is a reading of that one version's source, not a
runtime-verified contract (Fibery #141). `render` writes `<name>.md`; install
and `check-install` own that one file at user and project scope. The Pi-only keys the loader reads
(`display_name`, `prompt_mode`, `inherit_context`, `enabled`, `locked`) have no
canonical source and are not emitted.

Claude emits Markdown frontmatter under the same key names its own loader reads.
Codex's `AgentRoleOverrides` set has nine fields: `developer_instructions`,
`model`, `model_reasoning_effort`, `model_reasoning_summary`, `model_verbosity`,
`personality`, `service_tier`, `skills`, and `features`. `serialize` emits
`model_reasoning_summary` and `model_verbosity` from the translation-only
canonical keys `reasoning-summary` and `verbosity`; `personality` and
`service_tier` are Ruled out below. The flattened config-layer keys
`sandbox_mode` and `approval_policy` are emitted from the translation-only
canonical keys `sandbox-mode` and `approval-policy` (explicit Codex-native
authoring, not translation; see the rows below). `skills` shares a name
with a canonical key but not its meaning: a role can use it only to remove
skills from the child (L-013). A role file is a flattened Codex configuration
layer and can therefore carry fields such as `sandbox_mode`, but sharing a
document does not make their operations equivalent to source agent policy
(ndr:bqyqfd). That is why the two policy keys are authored for Codex on
purpose and never derived from `tools`, `disallowedTools` or `permissionMode`.

### Shared across harnesses

| Canonical field | Claude (.md) | Codex (.toml) | Pi (.md) |
| --- | --- | --- | --- |
| `name` <br> lowercase-hyphenated, required | **Native** — `name` | **Native** — `name` | **Translated** — the filename stem `<name>.md`; no `name` key is emitted. The loader takes the agent name from the filename (`src/config/custom-agents.ts loadFromDir`). |
| `description` <br> required | **Native** — `description` | **Native** — `description` | **Native** — `description` |
| `effort` <br> low \| medium \| high \| xhigh \| max | **Native** — `effort` | **Translated** — `model_reasoning_effort`. All five canonical values are accepted Codex reasoning levels. | **Translated** — `thinking`, identical values. Every canonical value is in the loader's vocabulary; `xhigh` and `max` are clamped per model by Pi. |
| `reasoning-summary` <br> auto \| concise \| detailed \| none | **No analogue.** Claude Code subagent frontmatter has no reasoning-summary control. Stripped silently, not reported: Claude never owned the key. | **Translated** — `model_reasoning_summary`. Values are the codex-cli 0.160.0 `ReasoningSummary` enum; an invalid value is rejected by the canonical schema before projection. Codex-only (translation-only key, retained by no target). | **No analogue.** The loader reads no such key. Reported as `claude-only-frontmatter-stripped` on Pi (unlike Claude, which strips it silently), because Pi is named as not accepting it (ndr:az33k6). |
| `verbosity` <br> low \| medium \| high | **No analogue.** Claude Code subagent frontmatter has no verbosity control. Stripped silently, not reported: Claude never owned the key. | **Translated** — `model_verbosity`. Values are the codex-cli 0.160.0 `Verbosity` enum. Codex ignores it on a model without verbosity support (the binary logs "model_verbosity is set but ignored as the model does not support verbosity"), so agentforge emits it as written and raises no warning. Codex-only (translation-only key). | **No analogue.** Same as `reasoning-summary`: reported on Pi. |
| `sandbox-mode` <br> read-only \| workspace-write \| danger-full-access | **No analogue.** Claude Code subagent frontmatter has no sandbox control. Stripped silently, not reported: Claude never owned the key. | **Translated** — `sandbox_mode`. Explicit Codex-native authoring, not translation from `tools`, `disallowedTools` or `permissionMode`, which stay No analogue and never influence this field (ndr:bqyqfd). Values are the codex-cli 0.160.0 `SandboxMode` enum; an invalid value is rejected by the canonical schema, at top level or under `targets.codex`. Codex-only (translation-only key). **Not applied at runtime by codex-cli 0.160.0:** a spawned child keeps the parent session's sandbox (L-014); setting the key raises `codex-role-policy-not-applied`. The `sandbox_workspace_write` table and `permission_profile` are not modeled. | **No analogue.** The extension has no sandbox concept. Reported on Pi, same as `reasoning-summary`. |
| `approval-policy` <br> on-request \| never | **No analogue.** Claude Code subagent frontmatter has no approval-policy field. Stripped silently, not reported: Claude never owned the key. | **Translated** — `approval_policy`, string forms only. Explicit Codex-native authoring, not translation from `permissionMode` (ndr:bqyqfd). `untrusted` is rejected by codex-cli 0.160.0 ("no longer supported") and `on-failure` is accepted by that binary but documented deprecated, so neither is admitted; the table-shaped `granular` form is not modeled. Codex-only (translation-only key). **Not applied at runtime by codex-cli 0.160.0** (L-014); setting the key raises `codex-role-policy-not-applied`. | **No analogue.** The extension has no approval concept. Reported on Pi, same as `reasoning-summary`. |
| `model` | **Native** — `model` | **Translated** — `model`, only from `targets.codex.model`. A bare top-level `model:` is a Claude model name and is stripped rather than leaked into Codex's namespace (L-008). | **Translated** — `model`, only from `targets.pi.model`. The loader fuzzy-matches across every authenticated provider and silently inherits the parent model on a miss, so a bare Claude alias is stripped rather than emitted (ndr:az33k6; ndr:2pmgn1). |
| `maxTurns` <br> positive int | **Native** — `maxTurns` | **No analogue.** No per-role turn limit anywhere in the 0.154.0 field set. | **Translated** — `max_turns`, verbatim. A value of 1 emits `pi-max-turns-raised`, because the extension runs it as 2 (L-015). |
| `background` <br> bool or "true"/"false" | **Native** — `background` | **No analogue**, no declarative form. Codex backgrounding is a spawn-time tool argument, decided by the caller rather than by role metadata. | **Translated** — `run_in_background`, normalized to a YAML boolean: the loader tests `=== true`, so the canonical "true"/"false" strings would be ignored. |
| `body` <br> markdown below frontmatter | **Native** — Markdown body | **Translated** — `developer_instructions`. TOML string, required non-blank. No substitution of any kind — an agent role has no invocation-time argument. | **Translated** — the Markdown body of `<name>.md` is the agent prompt, wrapped or appended after the inherited parent prompt. Not the whole system prompt. No substitution of any kind; Claude constructs warn as on Codex (`pi/agent` capability row). |

### Claude-native — Codex has no analogue

Pi takes `tools` here via `targets.pi.tools`; the other rows are Claude-only on Pi too.

| Canonical field | Claude (.md) | Codex (.toml) | Pi (.md) |
| --- | --- | --- | --- |
| `skills` <br> string \| string[] | **Native** — `skills` | **No analogue**, though Codex has a same-named field: a role's `skills` is the `config.toml` `[skills]` table, which can only remove skills from the child, never preload them. A Claude-style list is worse than lost: Codex drops the whole role file (L-013). | **No analogue.** Skill preloading was removed from the extension; children inherit the parent's skills. |
| `tools` <br> string \| string[] | **Native** — `tools` | **No analogue.** A named allowlist filters the inherited tool catalog; `sandbox_mode` controls filesystem and network access during command execution and cannot preserve that operation (ndr:bqyqfd). | **Translated** — `tools`, only from `targets.pi.tools`, in Pi tool names. The allowlist is exact-match against lowercase Pi names, so a shared Claude name matches nothing and an omitted list grants all seven built-ins. A shared `tools` with no `targets.pi.tools` **refuses the render** (ndr:jybfry); with the override, the shared value is still reported as stripped. |
| `disallowedTools` | **Native** — `disallowedTools` | **No analogue.** Codex has no role-scoped named-tool denylist. A sandbox cannot remove one tool while preserving unrelated tools (ndr:bqyqfd). | **No analogue.** The extension has no denylist. A non-empty shared `disallowedTools` with no `targets.pi.tools` **refuses the render** (ndr:jybfry); with the override it is reported as stripped. An empty list restricts nothing and renders. |
| `permissionMode` <br> default \| acceptEdits \| auto \| dontAsk \| bypassPermissions \| plan \| manual | **Native** — `permissionMode`. Honored at user and project scope; Claude's *plugin* agent loader ignores it with a warning. | **No analogue.** Codex separates sandbox capability from approval behavior, and no documented total mapping preserves these source-specific modes (ndr:bqyqfd). | **No analogue.** No permission or mode concept; permission policy lives in a separate package. Any value other than `bypassPermissions` with no `targets.pi.tools` **refuses the render** (ndr:jybfry); with the override it is reported as stripped. |
| `isolation` <br> worktree \| remote | **Native** — `isolation` | **No analogue.** No execution-isolation field on an agent role. | **No analogue.** `isolation:` was removed from the extension; worktree isolation is a separate package configured outside frontmatter. |
| `memory` <br> user \| project \| local | **Native** — `memory` | **No analogue.** The `memory` literal in the binary belongs to its Claude Code importer's path list, not to the agent-role document. | **No analogue.** `memory:` frontmatter was removed from the extension. |
| `omitClaudeMd` <br> bool or "true"/"false" | **Native** — `omitClaudeMd` | **No analogue, ever.** It names CLAUDE.md, a Claude Code file, so no equivalent can exist on another harness. | **No analogue, ever.** It names CLAUDE.md, a Claude Code file. |
| `initialPrompt` | **Native** — `initialPrompt` | **Blocked** → `developer_instructions` by appending it — but that field already holds the body, and folding a first user turn into instructions changes what the text is, not just where it sits. | **No analogue.** The loader has no first-turn field; the invoking `subagent` call supplies the prompt. |
| `color` | **Native** — `color` | **No analogue.** A Claude Code display affordance; Codex's unused `personality` is behavioral tone, not presentation. | **No analogue.** The loader reads no display-colour key. |
| `mcpServers` <br> array | **Native** — `mcpServers`. Ignored by the plugin loader, same as `permissionMode`. | **Blocked** → Codex's session-wide MCP configuration — never a per-role field, so carrying it would change a per-agent declaration into a global one. | **No analogue.** MCP is session-level in Pi; a child reaches an MCP tool by naming `mcp__server__tool` in `tools`. |
| `hooks` | **Native** — `hooks`; Claude converts an agent `Stop` hook to `SubagentStop` while the agent runs. | **Translated with scope loss** → a separate package hook file and manifest entry during marketplace compilation. Agent `Stop` becomes `SubagentStop`, but Codex loads the hook for the whole enabled package, so it can fire outside that agent. Standalone leaf rendering still drops it (ndr:pz1x3e). | **No analogue.** The loader reads no hooks key. |
| `experimental` | **Native** — `experimental` | **No analogue.** Experimental by name, so no cross-target equivalent can be claimed for its contents. | **No analogue.** The loader reads no such key. |

### No canonical field — the harness reads it, agentforge cannot set it

| Canonical field | Claude (.md) | Codex (.toml) | Pi (.md) |
| --- | --- | --- | --- |
| *none* | **Unmapped** — `observer` · `observerMessage` · `observeSubagents`. Claude Code 2.1.293's loader reads all three, behind the experimental `CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS` gate, but no published documentation does. Left out on purpose until the official sub-agents frontmatter reference or changelog lists them: enumerating them would claim a contract nothing backs (ndr:csj8pa). Written today, each reports `unrecognized-frontmatter-key` and is stripped on Claude too. | n/a — no observation fields on an agent role. | n/a |
| *none* | n/a — Claude's `color` is presentation, not tone; not the same field. | **Ruled out** — `personality`. In the override set, never emitted. A tone preset with no Claude counterpart, so a canonical key would be authored Codex-first with nothing for Claude to do. Revisit when an author needs a Codex-tuned tone. | n/a |
| *none* | n/a | **Ruled out** — `service_tier`. In the override set, never emitted. An account-level billing/latency pin, not agent behavior, with no Claude counterpart in frontmatter. Revisit if Codex makes it role-meaningful. | n/a |
| *none* | n/a | **Unmapped** — `features`. A role may disable selected Codex runtime features; no canonical field expresses this subtractive feature map. | n/a |
| *none* | n/a | **Unmapped** — `sandbox_workspace_write` (table) and `permission_profile`. Also in a role's flattened Codex configuration layer; no canonical key addresses either (Fibery #137 scoped the explicit surface to `sandbox-mode` and `approval-policy`). | n/a |
| *none* | n/a | n/a | **Unmapped** — `display_name` · `prompt_mode` · `inherit_context` · `enabled` · `locked`. Keys the loader reads that no canonical key addresses, so none is emitted "until a need names them" (ndr:az33k6); written under `targets.pi` each reports `unrecognized-frontmatter-key` and is stripped. |

### Authoring layer — never emitted anywhere

| Canonical field | All targets |
| --- | --- |
| `targets.<name>` | **Consumed.** Same merge rule as the skill artifact; `targets.codex.model` and `targets.pi.model` / `targets.pi.tools` are the overrides read directly by a native-document path. |

## Notes

- **Unmapped rows read in the other direction.** Every other row starts from a
  canonical key and asks what each harness does with it. The Unmapped rows start
  from the harness and ask what agentforge can express — a gap closed by adding a
  canonical key, not by changing a projection. Of Codex's nine explicit
  agent-role overrides, `model_reasoning_summary` and `model_verbosity` are
  Translated (as are the config-layer `sandbox_mode` and `approval_policy`), `personality` and `service_tier` are Ruled out, and `features`
  is Unmapped because its subtractive runtime-feature switches have no
  canonical field.
- **Unknown keys.** Canonical schemas are `z.looseObject`, so a key neither
  schema enumerates survives parse long enough to report
  `unrecognized-frontmatter-key`, then is stripped on every target including
  Claude (L-001). A key listed in `authoring-keys` in `PACKAGE.yaml` is stripped
  silently instead.
- **Install scope.** Skills reach user, project and plugin scope on both
  harnesses. Claude agents reach all three (resources ride along at plugin scope
  only); Codex agents install at user (`$CODEX_HOME/agents`) and project
  (`.codex/agents`) scope. Plugin packages register no Codex agent role at all
  (L-010), so marketplace agent translation falls back to a Markdown procedure. Pi agents render to `<name>.md`, install at user (`~/.pi/agent/agents`) and project (`.pi/agents`) scope only, and need the pinned third-party extension to be read at all (L-015).
- **Other artifacts.** `output-style` is the third leaf artifact and projects to
  Claude only; `mcp` is unimplemented.

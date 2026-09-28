# Codex agent bundle acceptance

This record covers JUN-439's standalone v1 path, JUN-440's opt-in v2 package
companion, and JUN-443's explicit registration skill. A package enables v2 under
`targets.codex.codex-agent-bundle: true`; normal marketplace compilation emits
`.agentforge/codex-agent-bundle/` beside the unchanged Markdown procedures and
`skills/setup-codex-agents/`.

Last exercised: 2026-09-28.

- AgentForge worktree: `JUN-439: one-agent Codex installation and dispatch`
- Bun: 1.4.2
- Codex CLI: 0.158.0
- Codex config reference: `https://developers.openai.com/codex/config-schema.json`

## Fixture and commands

The canonical fixture is `tests/fixtures/dispatch-probe/AGENT.md`. Its Codex
override declares `gpt-5.6-terra`, its canonical effort is `high`, and its sole
instruction requires `DISPATCH_PROBE_OK`.

```sh
mkdir -p /private/tmp/agentforge-jun439-runtime-final/codex-home /private/tmp/agentforge-jun439-runtime-final/project
git init -q /private/tmp/agentforge-jun439-runtime-final/project
ln -s "$HOME/.codex/auth.json" /private/tmp/agentforge-jun439-runtime-final/codex-home/auth.json
cat > /private/tmp/agentforge-jun439-runtime-final/codex-home/config.toml <<'EOF'
[projects."/private/tmp/agentforge-jun439-runtime-final/project"]
trust_level = "trusted"
EOF
bun run src/cli.ts compile-codex-agent tests/fixtures/dispatch-probe --package-id agentforge --out /private/tmp/agentforge-jun439-runtime-final/bundle
CODEX_HOME=/private/tmp/agentforge-jun439-runtime-final/codex-home bun run src/cli.ts install-codex-agent /private/tmp/agentforge-jun439-runtime-final/bundle --scope project --project-root /private/tmp/agentforge-jun439-runtime-final/project
CODEX_HOME=/private/tmp/agentforge-jun439-runtime-final/codex-home codex exec --json --sandbox read-only -C /private/tmp/agentforge-jun439-runtime-final/project 'Use the collaboration spawn_agent tool once with agent_type "agentforge:dispatch-probe". Ask the child to follow its role instructions. Wait for it to finish, then reply with exactly the child final response and no other text.' > /private/tmp/agentforge-jun439-runtime-final/codex-events.jsonl
```

The isolated `CODEX_HOME` used a temporary link to the existing local auth
record; the commands do not print or copy its contents. The explicit trusted
project entry is required before the fresh `codex exec` invocation. No user or
project runtime files outside `/private/tmp` were changed.

## Evidence

| Claim | Result | Evidence |
| --- | --- | --- |
| Emission | Passed | The bundle contains `dispatch-probe.toml` with `name = "agentforge:dispatch-probe"` and `agentforge-codex-agent-bundle.json` schema `agentforge.codex-agent-bundle/v1`. The index records package `agentforge`, agent `dispatch-probe`, the exact emitted name, and the TOML SHA-256. |
| Installation | Passed | The project install wrote `agents/dispatch-probe.toml`, an owner/hash receipt at `agents/.agentforge/agentforge--dispatch-probe.json`, and the required role registration in `.codex/config.toml`. The focused fixture deletes its canonical source before installing. A sibling TOML and an existing `model = "existing-model"` config line remain byte-for-byte retained. |
| Discovery and behavior | Passed | A fresh parent selected `agent_type: "agentforge:dispatch-probe"`; the spawned child trace identifies that exact role and returned `DISPATCH_PROBE_OK`. The saved events are `/private/tmp/agentforge-jun439-runtime-final/codex-events.jsonl` and the child rollout at `/private/tmp/agentforge-jun439-runtime-final/codex-home/sessions/2026/09/28/rollout-2026-09-28T14-06-58-01a0e932-d961-73f1-aedf-d081cacbc77a.jsonl`. |
| Settings application | Observed | The child rollout's `thread_settings_applied` records `model: gpt-5.6-terra` and `reasoning_effort: high`. This trace, not the child marker, establishes the applied settings. |
| User root | Passed in focused CLI coverage | `preview-codex-agent --scope user` resolves `$CODEX_HOME/agents/dispatch-probe.toml`; `install-codex-agent --scope user` installs there. With `CODEX_HOME` absent it falls back to `~/.codex`, as documented by Codex. |

No other child setting was observed in the saved run metadata; those settings
remain unknown.

## JUN-440 format contract

The v2 index is `agentforge.codex-agent-bundle/v2`. It records the package id
and resolved package version, then lexically ordered agents with their canonical
id, emitted `<package>:<agent>` role name, safe `agents/<agent>.toml` path, and
SHA-256. The installer rejects malformed or newer schemas, duplicate or
unsorted identities, unsafe definition paths, digest mismatches, invalid TOML,
and any conflicting role or receipt before it writes. It validates the complete
bundle before the planned-file materializer changes an installation root.

`model` is emitted only from `targets.codex.model`; a top-level model remains a
Claude value. Canonical `effort` emits `model_reasoning_effort`. When either is
omitted, the role inherits the caller's applicable Codex setting. Canonical
tool filters, `disallowedTools`, and `permissionMode` remain loss diagnostics;
the bundle never derives `sandbox_mode` or approval policy from them.

Agent bodies that name `references/`, `scripts/`, or `assets/` fail bundle
compilation with an actionable path because those package resources do not
follow a standalone installed role. The same agent's marketplace Markdown
procedure remains emitted and can still use package-local resources.

## JUN-440 fresh runtime acceptance

On 2026-09-28, Codex CLI 0.158.0 loaded both roles from a freshly compiled
v2 bundle in an isolated project. At that time, `compile` emitted seven managed files from
`tests/fixtures/definitions/codex-agent-bundle/MARKETPLACE.yaml`; preview and
install registered `demo-roles:alpha` and `demo-roles:beta`. A fresh
`codex exec --json --sandbox read-only` parent called `spawn_agent` once for
each exact role name and received `ALPHA` and `BETA` from the children. The
child `thread_settings_applied` events recorded alpha as `gpt-5.6-terra` with
`high` effort, and beta as inherited parent model `gpt-6-astra` with its
explicit `low` effort. The parent event output is
`/private/tmp/agentforge-jun440-runtime-XZYQuH/codex-events.jsonl`; the alpha
and beta child rollouts are
`/private/tmp/agentforge-jun440-runtime-XZYQuH/codex-home/sessions/2026/09/28/rollout-2026-09-28T14-40-52-01a0e951-e2d3-7541-82e7-784c9bdb1091.jsonl`
and
`/private/tmp/agentforge-jun440-runtime-XZYQuH/codex-home/sessions/2026/09/28/rollout-2026-09-28T14-40-55-01a0e951-ec93-7c72-941d-ae80e1045ad8.jsonl`.

The isolated `CODEX_HOME` linked the existing local `auth.json`; the test did
not print or copy its contents. No runtime files outside `/private/tmp` were
changed. This trace establishes discovery, dispatch, instructions, and the
observed model and effort settings for these two fixture roles. Other child
settings remain unknown.

## JUN-441 owned installation contract

`install-codex-agent` uses a scope-local package receipt under
`agents/.agentforge/`. The receipt records the package identity and version,
each emitted role name and destination, and the hash of its installed TOML.
This ownership format is `agentforge.codex-agent-receipt/v3`; earlier v2
receipts are reported as unsupported and are preserved for explicit migration.
Project and user installations therefore have independent ownership records,
including when user scope uses a custom `CODEX_HOME`. The installer preserves
unrelated agent definitions and refuses to replace an unowned definition or
one owned by another package. An unchanged reinstall has no filesystem effect.

`check-codex-agent <bundle-dir> --scope user|project` reads a compiled bundle
and the selected installation root without writing. It reports `current`,
`missing`, `edited`, `conflicted`, or `unsupported` with an actionable path for
each issue. `current` exits 0; every other state exits 1. A wholly missing
installation can be installed; partial missing state, edited content, ownership
conflicts, malformed receipts, unsupported receipt schemas, unsafe paths,
symlinks, or bundle hash mismatches
must be resolved before installation. Preview applies the same preflight.

The caller supplies the compiled bundle explicitly. Inventory discovery remains
separate work.

## JUN-442 managed lifecycle

Use `preview-codex-agent-update <bundle-dir> --scope user|project` before
`update-codex-agent <bundle-dir> --scope user|project`. The update reads the
scope-local receipt as the record of previously owned definitions, compares it
with the new compiled bundle, and previews creates, replacements, removals, and
preserved edits. A renamed agent is a removal of the old role and an addition
of the new one. Both commands accept `--project-root <dir>` for project scope;
user scope honors `CODEX_HOME` when set.

Use `preview-codex-agent-remove <package-id> --scope user|project` before
`remove-codex-agent <package-id> --scope user|project`. Removal needs only the
package identity and the installed receipt. The compiled bundle, plugin cache,
and original source directory may already be gone. A repeated removal of a
fully removed package is safe. Edited definitions are preserved and stay
recorded as unresolved ownership; other packages and the other scope are not
part of the operation. If a v3-owned definition is already missing, its
registration cannot be proven unchanged from the receipt alone, so removal
retains that entry for review while removing any other unchanged roles.

A scope-local lock serializes mutations of role definitions, registration, and
receipts. A durable pending-operation record makes an interruption visible.
While that record exists, normal update and removal refuse to mutate the scope.
Inspect preview output and the named paths, then run
`repair-codex-agent-update <bundle-dir> --scope user|project` or
`repair-codex-agent-remove <package-id> --scope user|project` for the recorded
operation. Repair proceeds only when the installed files match an unambiguous
before or after state; ambiguous edits require manual resolution and retain the
pending record. No plugin enable/disable event invokes these commands.

## JUN-443 explicit registration skill

The compiled plugin includes `skills/setup-codex-agents/SKILL.md`, its
explicit-invocation `agents/openai.yaml` policy, and the visible
`scripts/manage-codex-agent-bundle.sh`. Plugin installation exposes that skill;
companion registration stays a user-selected AgentForge lifecycle action. The
Markdown procedure at `agents/<name>.md` remains present and does not register
a role.

The skill uses its active `SKILL.md` path, or an exact plugin-root fallback, to
invoke the script. The script walks three parent directories from its own path
to the plugin root and validates the bundle index. It does not construct a
cache or version path. This makes bundle discovery independent of a cache
version or a skill-context interpolation variable.

It invokes the installed `agentforge` binary for user/project installation,
check, preview/update, and preview/removal. If `agentforge` or a required
subcommand is missing, it directs the user to install a release binary whose
`--help` lists the required commands and verify the capability again. Version
text alone is not treated as compatibility evidence. A nonzero lifecycle result
stops the procedure. The script runs each matching preview before an update or
removal and stops if that preview fails. User and project receipts stay
independent; plugin removal does not remove either scope. Explicit receipt-based
removal preserves edited roles for review.

After successful registration, the skill requires a fresh Codex session and
requires `check` to succeed for the selected scope before it lists an emitted
`<package>:<agent>` value for `spawn_agent`. A non-current check reports the
setup gap and blocks dispatch. A role absent from the list has no companion
setup, and the skill does not rewrite its name.

Focused tests copy the compiled package to a fresh plugin location, execute the
generated script for both scopes, cover missing and incompatible CLI guidance,
and remove receipt-owned roles after deleting the copied bundle. They also cover
generated output and policy, a failed lifecycle mutation, and snapshot checks.
They do not establish skill selection in a fresh Codex runtime; that still
needs a model-backed installed-plugin trace.

## Boundaries

Codex reads project configuration only for a trusted project. The runtime probe
set its isolated project trust explicitly before invoking `codex exec`.
Installation refuses malformed indexes, invalid TOML, digest mismatches,
foreign definitions, missing paired receipts, and pre-existing conflicting role
registrations before materializing any destination path. It also refuses an
inline `agents = { ... }` configuration without replacing it. Preview runs the
same read-only ownership preflight, including the collision refusal. Managed
managed lifecycle commands remain explicit local actions.

# Codex agent bundle acceptance

This record covers the narrow JUN-439 path: compile one canonical agent into a
portable bundle, install it at a Codex user or project root, and dispatch the
emitted role. It does not establish update, removal, or broad multi-agent
lifecycle behavior.

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

## Boundaries

Codex reads project configuration only for a trusted project. The runtime probe
set its isolated project trust explicitly before invoking `codex exec`.
Installation refuses malformed indexes, invalid TOML, digest mismatches,
foreign definitions, missing paired receipts, and pre-existing conflicting role
registrations before materializing any destination path. It also refuses an
inline `agents = { ... }` configuration without replacing it. Preview runs the
same read-only ownership preflight, including the collision refusal. Broader
ownership drift, update, and removal stay in JUN-441.

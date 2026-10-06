# Codex spawn_agent hook payload probe

Live probe, 2026-10-06, codex-cli **0.160.0**. Question: can a Claude hook
`matcher: "Task"` be translated to Codex by rewriting the matcher to `Agent`,
as the Codex hooks reference implies ("`spawn_agent` also matches `Agent`")?

**Answer: no.** On 0.160.0 the subagent tool is not matched by `Agent`, and its
`tool_input` carries nothing a `Task` hook reads. A matcher rewrite would
compile to a hook that never fires, and a payload wrapper would have no prompt
to recover. `Task` stays a reported loss, not a translation.

## Results

| | Claude `Task` | Codex 0.160.0, observed |
| --- | --- | --- |
| `tool_name` | `Task` | `collaborationspawn_agent` |
| `matcher: "Agent"` fires | n/a | **No** — zero dumps from the `Agent`-matched hook |
| `tool_input` | `subagent_type`, `prompt`, `description` | `task_name`, `message`, `fork_turns` |
| Prompt readable by the hook | yes (`prompt`) | **no** — `message` is an opaque encrypted token (`gAAAAA…`) |

Control, same run: the shell call arrived as
`{"tool_name":"Bash","tool_input":{"command":"echo hi"}}` — Claude's exact
shape, which is why Commit's `matcher: "Bash"` guard works on Codex
(`docs/hook-event-parity.md` § Matcher). The follow-up `wait_agent` call arrived
as `collaborationwait_agent` with `{"timeout_ms": 10000}`, also unmatched by
`Agent`.

## What this changes

- **The documented alias does not hold on 0.160.0.** The hooks reference's
  tool-coverage table says `spawn_agent` also matches `Agent`. The observed
  `tool_name` is namespaced (`collaboration` prefix), and an unanchored
  `Agent` regex does not match it, since regex matching is case-sensitive and
  the name contains only lowercase `agent`. `docs/hook-event-parity.md` repeats
  the alias in its matcher table and its `Task` note; both need correcting.
- **`spawn_agent` would match, but uselessly.** An unanchored `spawn_agent`
  matcher matches `collaborationspawn_agent` as a substring, but a `Task` hook
  that inspects `subagent_type` or `prompt` finds neither field, and the
  prompt-equivalent is encrypted before the hook sees it.
- **Only input-agnostic hooks could survive a rewrite** (loggers, notifiers
  that read nothing from `tool_input`). That is too narrow to justify a
  translation entry on the `codex/hook` capability row (ndr:61cmc9).

## Reproduce

Isolated `CODEX_HOME` with hooks enabled, the probe project trusted, file-based
credentials, and a link to the local auth record (contents never printed):

```sh
R=<scratch dir>
mkdir -p $R/codex-home $R/project $R/dumps && git init -q $R/project
ln -s "$HOME/.codex/auth.json" $R/codex-home/auth.json
cat > $R/dump.sh <<EOF
#!/bin/sh
cat > "$R/dumps/\$1-\$(date +%s%N)-\$\$.json"
EOF
chmod +x $R/dump.sh
cat > $R/codex-home/config.toml <<EOF
cli_auth_credentials_store = "file"
[features]
hooks = true
[projects."$R/project"]
trust_level = "trusted"
EOF
cat > $R/codex-home/hooks.json <<EOF
{"hooks":{"PreToolUse":[
 {"matcher":"Agent","hooks":[{"type":"command","command":"$R/dump.sh agent"}]},
 {"matcher":".*","hooks":[{"type":"command","command":"$R/dump.sh any"}]}
]}}
EOF
```

Hooks run only after persisted trust. Approve both once interactively (no
prompt sent, so no tool runs), then `/quit`:

```sh
CODEX_HOME=$R/codex-home codex -C $R/project
```

Probe:

```sh
CODEX_HOME=$R/codex-home codex exec --json --skip-git-repo-check --sandbox read-only -C $R/project \
  'First run the shell command `echo hi` once. Then use the spawn_agent tool exactly once to spawn a subagent whose task is: reply with the word PONG. Wait for it, then reply with its answer only.' </dev/null
for f in $R/dumps/*.json; do jq -c '{tool_name, tool_input}' "$f"; done
```

Without persisted trust, hooks silently do not fire — two earlier runs in the
same home produced no dumps at all, for the shell call as well. A `nono`
sandbox around the interactive trust step failed with `workspace routing
discovery failed` while `com.apple.SecurityServer` was blocked; the likely (not
verified) cause is that macOS TLS trust evaluation goes through that service.
The trust step ran unsandboxed.

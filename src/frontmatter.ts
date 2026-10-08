import type { ArtifactType, TargetName } from './types.ts';

interface FrontmatterKeyAcceptance {
  targets: readonly TargetName[];
  source: string;
}

// Canonical keys are declared once. Membership answers which targets retain a
// key in frontmatter; translated keys such as Codex's invocation policy remain
// governed by the construct capability table and are deliberately absent from
// that target's membership here (ndr:vj6z18).
const ACCEPTANCE: Readonly<
  Record<ArtifactType, Readonly<Record<string, FrontmatterKeyAcceptance>>>
> = {
  skill: {
    name: {
      targets: ['claude', 'opencode', 'codex', 'pi', 'claude-chat'],
      source: 'Agent Skills name field; Claude and Claude Chat native skill metadata.',
    },
    description: {
      targets: ['claude', 'opencode', 'codex', 'pi', 'claude-chat'],
      source: 'Agent Skills description field; Claude and Claude Chat native skill metadata.',
    },
    'allowed-tools': {
      targets: ['claude', 'pi'],
      source:
        'Claude Code skills documentation; Pi skills documentation marks allowed-tools experimental.',
    },
    'disable-model-invocation': {
      targets: ['claude', 'pi'],
      source:
        'Claude Code and Pi skill frontmatter. Codex accepts the behavior through agents/openai.yaml translation.',
    },
    // Retained by no target: Codex receives it by translation to
    // `agents/openai.yaml` `interface.short_description` (capability table),
    // exactly like `disable-model-invocation` on Codex (ndr:vj6z18). Empty
    // membership is what marks a key translation-only; see
    // `isTranslationOnlyKey`.
    'short-description': {
      targets: [],
      source:
        'Codex skill sidecar `interface.short_description` (codex-cli 0.160.0 embedded skill-creator docs: human-facing UI blurb, 25-64 chars). No other harness has a field for it.',
    },
    when_to_use: claudeOnly(),
    'argument-hint': claudeOnly(),
    arguments: claudeOnly(),
    'user-invocable': claudeOnly(),
    'disallowed-tools': claudeOnly(),
    model: claudeOnly(),
    effort: claudeOnly(),
    context: claudeOnly(),
    agent: claudeOnly(),
    hooks: claudeOnly(),
    paths: claudeOnly(),
    shell: claudeOnly(),
  },
  agent: {
    // Pi never emits `name` as a key: the pi-subagents loader takes the agent
    // name from the filename stem (@gotgenes/pi-subagents 23.2.0,
    // `src/config/custom-agents.ts loadFromDir`). Membership here is what lets the
    // merged `name` (including a `targets.pi.name` override) choose that
    // filename, not a claim the loader reads a frontmatter `name`.
    name: {
      targets: ['claude', 'codex', 'pi'],
      source:
        'Claude Code native subagent frontmatter; Codex agent role TOML `name` field (codex-cli 0.154.0); Pi agent filename stem (@gotgenes/pi-subagents 23.2.0 reads no `name` key, ndr:az33k6).',
    },
    description: {
      targets: ['claude', 'codex', 'pi'],
      source:
        'Claude Code native subagent frontmatter; Codex agent role TOML `description` field (codex-cli 0.154.0); @gotgenes/pi-subagents 23.2.0 `description` (`src/config/custom-agents.ts loadFromDir`).',
    },
    // Codex has a native `model` TOML field, but a shared top-level `model:`
    // is a Claude-shaped alias (Claude's own model catalog) that must not
    // leak into another target's model namespace. Only an explicit
    // `targets.codex.model` names Codex (and, likewise, only `targets.pi.model`
    // names Pi, ndr:az33k6); `src/render.ts`'s native-document
    // path reads that override directly rather than through this table, so
    // `model` stays claude-only here on purpose — a bare top-level `model:`
    // with no Codex override is a confirmed loss, same as any other
    // Claude-only key.
    model: claudeOnly('Claude Code native subagent frontmatter.'),
    // No per-role turn-limit key exists anywhere in codex-cli 0.154.0 (verified
    // against the `agent-roles` crate's field set); Codex stays absent from
    // this row's targets until one does.
    //
    // Pi retains it renamed to `max_turns` (@gotgenes/pi-subagents 23.2.0,
    // `src/config/custom-agents.ts loadFromDir`), so Pi is a member even though the
    // emitted key differs from the canonical one (ndr:az33k6).
    maxTurns: {
      targets: ['claude', 'pi'],
      source:
        'Claude Code native subagent frontmatter; Pi agent `max_turns` (@gotgenes/pi-subagents 23.2.0 `src/config/custom-agents.ts loadFromDir`, emitted verbatim; the extension runs 1 as 2).',
    },
    effort: {
      targets: ['claude', 'codex', 'pi'],
      source:
        'Claude Code native subagent frontmatter; Codex agent role TOML `model_reasoning_effort` field. Every canonical value (low/medium/high/xhigh/max) is a confirmed-accepted Codex reasoning-effort string per the codex-cli 0.154.0 bundled model catalog. Pi agent `thinking` (@gotgenes/pi-subagents 23.2.0 `src/config/thinking-level.ts THINKING_LEVELS`): every canonical value is in its vocabulary.',
    },
    // Translation-only (retained by no target, like skill `short-description`):
    // Codex receives each as an agent-role TOML field and Claude has no such
    // frontmatter key, so Claude strips them silently. Values are the codex-cli
    // 0.160.0 `ReasoningSummary` / `Verbosity` enums. Codex ignores
    // `model_verbosity` on a model that does not support it (the binary logs
    // "model_verbosity is set but ignored as the model does not support
    // verbosity"), so no warning is raised for it.
    'reasoning-summary': {
      targets: [],
      source:
        'Codex agent role TOML `model_reasoning_summary` (AgentRoleOverrides, codex-cli 0.154.0; values auto/concise/detailed/none from the codex-cli 0.160.0 `ReasoningSummary` enum). Claude Code subagent frontmatter has no counterpart.',
    },
    verbosity: {
      targets: [],
      source:
        'Codex agent role TOML `model_verbosity` (AgentRoleOverrides, codex-cli 0.154.0; values low/medium/high from the codex-cli 0.160.0 `Verbosity` enum). Codex ignores it on a model without verbosity support. Claude Code subagent frontmatter has no counterpart.',
    },
    // Explicit Codex-native policy (ndr:bqyqfd's separate contract): authored
    // on purpose, never inferred from `tools`, `disallowedTools` or
    // `permissionMode`, which stay claude-only below. Translation-only like the
    // two above. Values: codex-cli 0.160.0 `SandboxMode` and `AskForApproval`;
    // `untrusted` is rejected by that binary and `on-failure` is documented
    // deprecated, so neither is accepted. The table-shaped `granular` form is
    // not modeled.
    'sandbox-mode': {
      targets: [],
      source:
        'Codex agent role TOML `sandbox_mode` (flattened role config layer; values read-only/workspace-write/danger-full-access from the codex-cli 0.160.0 `SandboxMode` enum). Claude Code subagent frontmatter has no counterpart. Authored explicitly, never derived from tools/disallowedTools/permissionMode (ndr:bqyqfd).',
    },
    'approval-policy': {
      targets: [],
      source:
        'Codex agent role TOML `approval_policy` (flattened role config layer; string values on-request/never from the codex-cli 0.160.0 `AskForApproval` enum and the Codex config reference). `untrusted` is rejected by 0.160.0 and `on-failure` is documented deprecated. Claude Code subagent frontmatter has no counterpart. Authored explicitly, never derived from permissionMode (ndr:bqyqfd).',
    },
    // Codex agent roles have no tool-allowlist key (verified against the
    // agent-roles/plugin-manifest field sets in codex-cli 0.154.0), so tool
    // access stays unenforced on Codex; the constraint remains claude-only here.
    // Pi does read a `tools` allowlist, but it is exact-match against Pi-native
    // lowercase names, so a shared Claude-named value is never emitted; only
    // `targets.pi.tools` is (ndr:az33k6), and a shared value without it refuses
    // the Pi render outright (ndr:jybfry).
    tools: claudeOnly('Claude Code native subagent frontmatter.'),

    // Everything below is read and validated by Claude Code 2.1.274's shipped
    // `.claude/agents/*.md` loader. Each is claude-only because codex-cli
    // 0.154.0's AgentRoleOverrides has exactly nine fields —
    // developer_instructions, model, model_reasoning_effort,
    // model_reasoning_summary, model_verbosity, personality, service_tier,
    // skills, features — and `codexAgentDocument.serialize` emits five of them
    // (developer_instructions, plus model, model_reasoning_effort,
    // model_reasoning_summary and model_verbosity when set), plus the flattened
    // config-layer keys `sandbox_mode` and `approval_policy` when set,
    // alongside name and description. A key with no field to land in is a
    // confirmed loss on Codex, which is what `claude-only-frontmatter-stripped`
    // states; that is a stronger and more useful claim than reporting a key
    // Claude itself enforces as one nobody has heard of.
    disallowedTools: claudeOnly(
      'Claude Code native subagent frontmatter, parsed by the same tool-list splitter as `tools`. Codex has no role-scoped named-tool denylist; sandbox policy is filesystem/network policy during command execution, not an equivalent operation (ndr:bqyqfd).',
    ),
    permissionMode: claudeOnly(
      'Claude Code native subagent frontmatter, validated against a fixed allow-list. Ignored with a warning by Claude Code\'s *plugin* agent loader ("which is ignored for plugin agents. Use .claude/agents/ for this level of control"), so it is honored only at the user and project scopes this artifact installs to. Codex separates sandbox capability from approval behavior and has no total semantics-preserving mapping for this vocabulary (ndr:bqyqfd).',
    ),
    isolation: claudeOnly(
      'Claude Code native subagent frontmatter, validated against worktree/remote. Codex agent roles have no execution-isolation field.',
    ),
    memory: claudeOnly(
      "Claude Code native subagent frontmatter, validated against user/project/local. The `memory` literal in the codex-cli binary belongs to its Claude-Code importer's path list, not to the agent-role document.",
    ),
    background: {
      targets: ['claude', 'pi'],
      source:
        'Claude Code native subagent frontmatter. Codex agent roles have no foreground/background field; its backgrounding is a spawn-time tool argument, not role metadata. Pi agent `run_in_background` (@gotgenes/pi-subagents 23.2.0 `src/config/custom-agents.ts loadFromDir`): a strict boolean, so the projection normalizes the canonical "true"/"false" strings.',
    },
    omitClaudeMd: claudeOnly(
      'Claude Code native subagent frontmatter. Names CLAUDE.md, a Claude Code file, so no other target can have an equivalent.',
    ),
    // codex-cli 0.154.0's `AgentRoleOverrides` carries a same-named `skills`
    // field, so the loss needed evidence before it could be called confirmed.
    // It is the config.toml `[skills]` table, not a string list, and a role's
    // copy can only remove skills from the child's catalog; no role field
    // injects skill content (docs/limitations.md L-013, verified live
    // 2026-09-21).
    // Claude's `skills:` preloads, so the two are not equivalent, and a
    // Claude-style list on that name makes Codex reject the whole role file.
    // `codexAgentDocument.serialize` emits no `skills`, and the canonical value
    // is a confirmed loss on Codex.
    skills: claudeOnly(
      'Claude Code native subagent frontmatter: skills preloaded into the subagent at startup. codex-cli 0.154.0 has a same-named agent-role field, but it is the config.toml `[skills]` table that can only remove skills from the child, and a Claude-style list makes Codex drop the whole role file (docs/limitations.md L-013), so the canonical value is lost on Codex rather than translated.',
    ),
    initialPrompt: claudeOnly(
      'Claude Code native subagent frontmatter, auto-submitted as the first user turn when the agent runs as the main session agent. Codex agent roles have no first-turn field.',
    ),
    color: claudeOnly(
      'Claude Code native subagent frontmatter: display colour, filtered against a named-colour allow-list. Purely a Claude Code UI affordance.',
    ),
    mcpServers: claudeOnly(
      'Claude Code native subagent frontmatter, each item schema-parsed by the loader. Ignored with a warning by the plugin agent loader, same as permissionMode. codex-cli 0.154.0 configures MCP servers session-wide, never per agent role.',
    ),
    hooks: claudeOnly(
      'Claude Code native subagent frontmatter: lifecycle hooks scoped to this subagent. Ignored with a warning by the plugin agent loader, same as permissionMode. Codex hooks live in `.codex/hooks`, outside the agent-role document.',
    ),
    experimental: claudeOnly(
      'Claude Code native subagent frontmatter: a map of experimental options (the loader reads `cacheTtl` from it). Experimental by name, so no cross-target equivalent can be claimed.',
    ),
  },
  'output-style': {
    name: claudeOnly(),
    description: claudeOnly(),
    'keep-coding-instructions': claudeOnly(),
    'force-for-plugin': claudeOnly(),
  },
};

export function acceptedFrontmatterKeys(
  target: TargetName,
  artifact: ArtifactType,
): ReadonlySet<string> {
  return new Set(
    Object.entries(ACCEPTANCE[artifact])
      .filter(([, acceptance]) => acceptance.targets.includes(target))
      .map(([key]) => key),
  );
}

// A key no target retains in frontmatter, so it exists only to be translated.
// Its absence from a non-translating target is not a loss of anything that
// target owns, which is why the stripped-key warning (worded as a Claude-owned
// loss) must not name it.
export function isTranslationOnlyKey(artifact: ArtifactType, key: string): boolean {
  const acceptance = ACCEPTANCE[artifact][key];
  return acceptance !== undefined && acceptance.targets.length === 0;
}

export function frontmatterAcceptanceSource(
  artifact: ArtifactType,
  key: string,
): string | undefined {
  return ACCEPTANCE[artifact][key]?.source;
}

function claudeOnly(
  source = 'Claude Code native skill or output-style frontmatter.',
): FrontmatterKeyAcceptance {
  return {
    targets: ['claude'],
    source,
  };
}

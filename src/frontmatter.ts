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
    name: {
      targets: ['claude', 'codex'],
      source:
        'Claude Code native subagent frontmatter; Codex agent role TOML `name` field (codex-cli 0.154.0).',
    },
    description: {
      targets: ['claude', 'codex'],
      source:
        'Claude Code native subagent frontmatter; Codex agent role TOML `description` field (codex-cli 0.154.0).',
    },
    // Codex has a native `model` TOML field, but a shared top-level `model:`
    // is a Claude-shaped alias (Claude's own model catalog) that must not
    // leak into another target's model namespace. Only an explicit
    // `targets.codex.model` names Codex; `src/render.ts`'s native-document
    // path reads that override directly rather than through this table, so
    // `model` stays claude-only here on purpose — a bare top-level `model:`
    // with no Codex override is a confirmed loss, same as any other
    // Claude-only key.
    model: claudeOnly('Claude Code native subagent frontmatter.'),
    // No per-role turn-limit key exists anywhere in codex-cli 0.154.0 (verified
    // against the `agent-roles` crate's field set); Codex stays absent from
    // this row's targets until one does.
    maxTurns: claudeOnly('Claude Code native subagent frontmatter.'),
    effort: {
      targets: ['claude', 'codex'],
      source:
        'Claude Code native subagent frontmatter; Codex agent role TOML `model_reasoning_effort` field. Every canonical value (low/medium/high/xhigh/max) is a confirmed-accepted Codex reasoning-effort string per the codex-cli 0.154.0 bundled model catalog.',
    },
    // Codex agent roles have no tool-allowlist key (verified against the
    // agent-roles/plugin-manifest field sets in codex-cli 0.154.0), so tool
    // access stays unenforced on Codex; the constraint remains claude-only here.
    tools: claudeOnly('Claude Code native subagent frontmatter.'),

    // Everything below is read and validated by Claude Code 2.1.274's shipped
    // `.claude/agents/*.md` loader. Each is claude-only because codex-cli
    // 0.154.0's agent-role document has exactly eight override fields —
    // developer_instructions, model, model_reasoning_effort,
    // model_reasoning_summary, model_verbosity, personality, service_tier,
    // skills — and `codexAgentDocument.serialize` emits three of them
    // (developer_instructions, plus model and model_reasoning_effort when set),
    // alongside name and description. A key with no field to land in is a
    // confirmed loss on Codex, which is what `claude-only-frontmatter-stripped`
    // states; that is a stronger and more useful claim than reporting a key
    // Claude itself enforces as one nobody has heard of.
    disallowedTools: claudeOnly(
      'Claude Code native subagent frontmatter, parsed by the same tool-list splitter as `tools`. codex-cli 0.154.0 has no tool denylist on any agent-role field set, so the restriction is unenforceable there.',
    ),
    permissionMode: claudeOnly(
      'Claude Code native subagent frontmatter, validated against a fixed allow-list. Ignored with a warning by Claude Code\'s *plugin* agent loader ("which is ignored for plugin agents. Use .claude/agents/ for this level of control"), so it is honored only at the user and project scopes this artifact installs to. No codex-cli 0.154.0 agent-role field carries permission policy.',
    ),
    isolation: claudeOnly(
      'Claude Code native subagent frontmatter, validated against worktree/remote. Codex agent roles have no execution-isolation field.',
    ),
    memory: claudeOnly(
      "Claude Code native subagent frontmatter, validated against user/project/local. The `memory` literal in the codex-cli binary belongs to its Claude-Code importer's path list, not to the agent-role document.",
    ),
    background: claudeOnly(
      'Claude Code native subagent frontmatter. Codex agent roles have no foreground/background field; its backgrounding is a spawn-time tool argument, not role metadata.',
    ),
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

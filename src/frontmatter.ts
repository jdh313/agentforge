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

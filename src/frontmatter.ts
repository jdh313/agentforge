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
    name: claudeOnly('Claude Code native subagent frontmatter.'),
    description: claudeOnly('Claude Code native subagent frontmatter.'),
    model: claudeOnly('Claude Code native subagent frontmatter.'),
    maxTurns: claudeOnly('Claude Code native subagent frontmatter.'),
    effort: claudeOnly('Claude Code native subagent frontmatter.'),
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

import { describe, expect, test } from 'bun:test';
import { supportFor } from '../src/capabilities.ts';
import { detectClaudeOnlyConstructs } from '../src/compatibility.ts';
import { projectArtifact } from '../src/render.ts';

// F-4: a leaf-installed Claude agent's `${CLAUDE_PLUGIN_ROOT}` never expands.
// Proven live against Claude Code 2.1.274 — a project-scope agent echoed the
// token back character-for-character — and the mechanism is that the bundle's
// one substitution function has seven call sites, every one plugin-scoped.
//
// The loss is the install scope, not the target. These tests pin that framing,
// because the failure mode here is a diagnostic that misleads rather than a
// diagnostic that is missing.

// biome-ignore-start lint/suspicious/noTemplateCurlyInString: literal Claude variable names are what these assertions are about

const PLUGIN_ROOT_BODY = [
  '# Vault reader',
  '',
  'Read ${CLAUDE_PLUGIN_ROOT}/references/vault-conventions.md first.',
  '',
  'For base-aware lookups also read ${CLAUDE_PLUGIN_ROOT}/references/bases.md.',
].join('\n');

const agentSource = (body: string, extraFrontmatter = '') =>
  `---\nname: scope-probe\ndescription: Exercises install-scope gating.\n${extraFrontmatter}---\n\n${body}\n`;

const kinds = (projection: { warnings: readonly { kind: string }[] }) =>
  projection.warnings.map(({ kind }) => kind);

describe('install-scope gated constructs', () => {
  test('warns on Claude, the one target where the file genuinely breaks', () => {
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });

    // Silence here was the defect: every other body warning is gated on
    // `target !== 'claude'`, so the leaf render said nothing about the only
    // target that actually loads this file.
    expect(kinds(projection)).toContain('construct-support-gated');
  });

  test('suppresses the condition for a plugin-scope install only', () => {
    const pluginProjection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      installScope: 'plugin',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });
    const projectProjection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      installScope: 'project',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });
    const userProjection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      installScope: 'user',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });

    expect(kinds(pluginProjection)).not.toContain('construct-support-gated');
    expect(kinds(projectProjection)).toContain('construct-support-gated');
    expect(kinds(userProjection)).toContain('construct-support-gated');
  });

  test('states the condition, and never that the target refuses the construct', () => {
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });
    const warning = projection.warnings.find(({ kind }) => kind === 'construct-support-gated');

    expect(warning?.detail).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(warning?.detail).toContain('plugin-scope');
    expect(warning?.detail).toContain('literal text');

    // ndr:728mf7: a diagnostic never states which target owns a construct, and
    // must not state non-acceptance that is false. Claude accepts this one and
    // expands it at plugin scope, so neither word may appear.
    expect(warning?.detail).not.toContain('claude-only');
    expect(warning?.detail).not.toContain('does not support');
    expect(kinds(projection)).not.toContain('claude-only-body-feature');
  });

  test('reports one condition once, not once per token', () => {
    // Two occurrences of the same gated construct share one condition, and a
    // reader needs that condition stated a single time.
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });

    expect(kinds(projection).filter((kind) => kind === 'construct-support-gated')).toHaveLength(1);
  });

  test('stays silent when the body carries no gated construct', () => {
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource('Plain instructions with no constructs at all.'),
    });

    expect(kinds(projection)).not.toContain('construct-support-gated');
  });

  test('a targets.claude.body override suppresses it, like every other body warning', () => {
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'claude',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: `---\nname: scope-probe\ndescription: Exercises install-scope gating.\ntargets:\n  claude:\n    body: |\n      Instructions with no plugin-root reference.\n---\n\n${PLUGIN_ROOT_BODY}\n`,
    });

    expect(kinds(projection)).not.toContain('construct-support-gated');
  });

  test('does not fire for Codex, where F-3 already reports the construct', () => {
    // Codex has no expansion at any scope, so the construct is an ordinary
    // confirmed loss there, not a conditional one. Emitting both would tell a
    // reader the same token has two different fates on one target.
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'codex',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource(PLUGIN_ROOT_BODY),
    });

    expect(kinds(projection)).toContain('claude-only-body-feature');
    expect(kinds(projection)).not.toContain('construct-support-gated');
  });

  test('gating is a typed claude/agent capability result, never a parallel skill fact', () => {
    // claude/skill would be wrong even though the same substitution gating
    // applies: marketplace skills DO reach plugin scope through
    // `projectArtifact`, so listing them would warn on output that resolves.
    expect(supportFor('claude', 'agent', '${CLAUDE_*}')).toEqual({
      state: 'gated',
      condition: { kind: 'install-scope', resolvedAt: ['plugin'] },
    });
    expect(supportFor('claude', 'skill', '${CLAUDE_*}')).toBe('supported');
    expect(supportFor('codex', 'agent', '${CLAUDE_*}')).toBe('unsupported');
  });

  test('keeps a gated construct outside the declared-loss detector', () => {
    const detection = detectClaudeOnlyConstructs({
      artifacts: new Map([
        [
          'agent',
          [{ path: '/virtual/scope-probe/AGENT.md', content: agentSource(PLUGIN_ROOT_BODY) }],
        ],
      ]),
      target: 'claude',
      surface: 'agent',
    });

    expect(detection.detected).toEqual([]);
    expect(detection.unknown).toEqual([]);
  });

  test('leaves frontmatter reporting untouched', () => {
    // The F-2 guard, same shape as the one on F-3: this change adds a body
    // warning and must not perturb which keys are reported as stripped.
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'codex',
      sourcePath: '/virtual/scope-probe/AGENT.md',
      source: agentSource('Plain body.', 'model: sonnet\nmaxTurns: 10\n'),
    });
    const stripped = projection.warnings.filter(
      ({ kind }) => kind === 'claude-only-frontmatter-stripped',
    );

    expect(stripped).toHaveLength(1);
    expect(stripped[0]?.detail).toBe('stripped model, maxTurns');
  });
});

// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal Claude variable names are what these assertions are about

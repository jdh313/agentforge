import { describe, expect, test } from 'bun:test';
import { projectArtifact } from '../src/render.ts';
import { TARGET_NAMES, type TargetName } from '../src/types.ts';

const agent = (frontmatter: string): string =>
  `---\nname: tuned\ndescription: Exercises the Codex-only model fields.\n${frontmatter}---\n\nBody.\n`;

const project = (target: TargetName, frontmatter: string) =>
  projectArtifact({
    sourcePath: '/virtual/tuned/AGENT.md',
    source: agent(frontmatter),
    target,
    artifact: 'agent',
  });

describe('reasoning-summary and verbosity on agents', () => {
  test('Codex emits both as role TOML fields, before developer_instructions', () => {
    const { content } = project('codex', 'reasoning-summary: concise\nverbosity: low\n');
    expect(content).toContain('model_reasoning_summary = "concise"\n');
    expect(content).toContain('model_verbosity = "low"\n');
    expect(content.indexOf('model_verbosity')).toBeLessThan(
      content.indexOf('developer_instructions'),
    );
    expect(content).not.toContain('reasoning-summary');
  });

  test.each(['auto', 'concise', 'detailed', 'none'])('accepts reasoning-summary %s', (value) => {
    expect(project('codex', `reasoning-summary: ${value}\n`).content).toContain(
      `model_reasoning_summary = "${value}"`,
    );
  });

  test.each(['low', 'medium', 'high'])('accepts verbosity %s', (value) => {
    expect(project('codex', `verbosity: ${value}\n`).content).toContain(
      `model_verbosity = "${value}"`,
    );
  });

  test('each key is independent and unset keys are omitted', () => {
    const only = project('codex', 'verbosity: high\n').content;
    expect(only).toContain('model_verbosity = "high"');
    expect(only).not.toContain('model_reasoning_summary');
    const none = project('codex', '').content;
    expect(none).not.toContain('model_verbosity');
    expect(none).not.toContain('model_reasoning_summary');
  });

  test('targets.codex override wins over the top-level value', () => {
    const { content } = project(
      'codex',
      'verbosity: low\ntargets:\n  codex:\n    verbosity: high\n',
    );
    expect(content).toContain('model_verbosity = "high"');
  });

  test('Claude omits both keys with no warning at all', () => {
    const projection = project('claude', 'reasoning-summary: detailed\nverbosity: medium\n');
    expect(projection.content).not.toContain('reasoning-summary');
    expect(projection.content).not.toContain('verbosity');
    expect(projection.warnings).toEqual([]);
  });

  test('Codex raises no stripped or unrecognized warning for either key', () => {
    const kinds = project('codex', 'reasoning-summary: auto\nverbosity: high\n').warnings.map(
      ({ kind }) => kind,
    );
    expect(kinds).not.toContain('claude-only-frontmatter-stripped');
    expect(kinds).not.toContain('unrecognized-frontmatter-key');
  });

  test('rejects an invalid reasoning-summary value', () => {
    expect(() => project('codex', 'reasoning-summary: verbose\n')).toThrow();
    expect(() => project('claude', 'reasoning-summary: verbose\n')).toThrow();
  });

  test('rejects an invalid verbosity value', () => {
    expect(() => project('codex', 'verbosity: loud\n')).toThrow();
    expect(() => project('claude', 'verbosity: loud\n')).toThrow();
  });

  test('rejects an invalid value under a targets.codex override', () => {
    expect(() =>
      project('codex', 'verbosity: low\ntargets:\n  codex:\n    verbosity: loud\n'),
    ).toThrow();
    expect(() =>
      project('codex', 'targets:\n  codex:\n    reasoning-summary: verbose\n'),
    ).toThrow();
  });

  test('a valid targets.codex override wins over the top-level value', () => {
    const { content } = project(
      'codex',
      'verbosity: low\ntargets:\n  codex:\n    verbosity: high\n',
    );
    expect(content).toContain('model_verbosity = "high"');
  });

  test('no other target that renders agents receives the keys', () => {
    for (const target of TARGET_NAMES) {
      if (target === 'codex') continue;
      let content: string;
      try {
        content = project(target, 'reasoning-summary: auto\nverbosity: low\n').content;
      } catch {
        continue; // target has no agent projection
      }
      expect(content).not.toContain('verbosity');
      expect(content).not.toContain('reasoning-summary');
    }
  });
});

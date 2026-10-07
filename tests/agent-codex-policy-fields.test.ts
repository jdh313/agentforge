import { describe, expect, test } from 'bun:test';
import { projectArtifact } from '../src/render.ts';
import { TARGET_NAMES, type TargetName } from '../src/types.ts';

const agent = (frontmatter: string): string =>
  `---\nname: scoped\ndescription: Exercises the Codex-native policy fields.\n${frontmatter}---\n\nBody.\n`;

const project = (target: TargetName, frontmatter: string) =>
  projectArtifact({
    sourcePath: '/virtual/scoped/AGENT.md',
    source: agent(frontmatter),
    target,
    artifact: 'agent',
  });

describe('sandbox-mode and approval-policy on agents (explicit Codex-native authoring)', () => {
  test('Codex emits exact role TOML lines, before developer_instructions', () => {
    const { content } = project('codex', 'sandbox-mode: read-only\napproval-policy: never\n');
    expect(content).toContain('sandbox_mode = "read-only"\n');
    expect(content).toContain('approval_policy = "never"\n');
    expect(content.indexOf('approval_policy')).toBeLessThan(
      content.indexOf('developer_instructions'),
    );
    expect(content).not.toContain('sandbox-mode');
    expect(content).not.toContain('approval-policy');
  });

  test.each([
    'read-only',
    'workspace-write',
    'danger-full-access',
  ])('accepts sandbox-mode %s', (value) => {
    expect(project('codex', `sandbox-mode: ${value}\n`).content).toContain(
      `sandbox_mode = "${value}"\n`,
    );
  });

  test.each(['on-request', 'never'])('accepts approval-policy %s', (value) => {
    expect(project('codex', `approval-policy: ${value}\n`).content).toContain(
      `approval_policy = "${value}"\n`,
    );
  });

  test('each key is independent and unset keys are omitted', () => {
    const only = project('codex', 'sandbox-mode: workspace-write\n').content;
    expect(only).toContain('sandbox_mode = "workspace-write"');
    expect(only).not.toContain('approval_policy');
    const none = project('codex', '').content;
    expect(none).not.toContain('sandbox_mode');
    expect(none).not.toContain('approval_policy');
  });

  test('targets.codex override wins over the top-level value', () => {
    const { content } = project(
      'codex',
      'sandbox-mode: read-only\ntargets:\n  codex:\n    sandbox-mode: workspace-write\n',
    );
    expect(content).toContain('sandbox_mode = "workspace-write"');
    expect(content).not.toContain('"read-only"');
  });

  test('a targets.codex-only value is emitted', () => {
    const { content } = project('codex', 'targets:\n  codex:\n    approval-policy: on-request\n');
    expect(content).toContain('approval_policy = "on-request"');
  });

  test.each([
    'untrusted',
    'on-failure',
    'unless-trusted',
    'always',
  ])('rejects approval-policy %s, including untrusted (codex-cli 0.160.0 rejects it)', (value) => {
    expect(() => project('codex', `approval-policy: ${value}\n`)).toThrow();
    expect(() => project('claude', `approval-policy: ${value}\n`)).toThrow();
  });

  test('rejects the table-shaped granular approval form', () => {
    expect(() =>
      project('codex', 'approval-policy:\n  granular:\n    sandbox_approval: true\n'),
    ).toThrow();
  });

  test.each(['full-access', 'readonly', 'workspace_write'])('rejects sandbox-mode %s', (value) => {
    expect(() => project('codex', `sandbox-mode: ${value}\n`)).toThrow();
    expect(() => project('claude', `sandbox-mode: ${value}\n`)).toThrow();
  });

  test('rejects an invalid value under a targets.codex override', () => {
    expect(() =>
      project(
        'codex',
        'approval-policy: never\ntargets:\n  codex:\n    approval-policy: untrusted\n',
      ),
    ).toThrow();
    expect(() => project('codex', 'targets:\n  codex:\n    sandbox-mode: full-access\n')).toThrow();
  });

  test('Claude omits both keys with no warning at all', () => {
    const projection = project('claude', 'sandbox-mode: read-only\napproval-policy: never\n');
    expect(projection.content).not.toContain('sandbox');
    expect(projection.content).not.toContain('approval');
    expect(projection.warnings).toEqual([]);
  });

  test('Codex raises no stripped or unrecognized warning for either key', () => {
    const kinds = project(
      'codex',
      'sandbox-mode: read-only\napproval-policy: never\n',
    ).warnings.map(({ kind }) => kind);
    expect(kinds).not.toContain('claude-only-frontmatter-stripped');
    expect(kinds).not.toContain('unrecognized-frontmatter-key');
  });

  test('no other target that renders agents receives the keys', () => {
    for (const target of TARGET_NAMES) {
      if (target === 'codex') continue;
      let content: string;
      try {
        content = project(target, 'sandbox-mode: read-only\napproval-policy: never\n').content;
      } catch {
        continue; // target has no agent projection
      }
      expect(content).not.toContain('sandbox');
      expect(content).not.toContain('approval');
    }
  });
});

describe('Claude policy fields never synthesize Codex policy (ndr:bqyqfd)', () => {
  test('permissionMode, tools and disallowedTools alone produce no sandbox or approval', () => {
    const { content, warnings } = project(
      'codex',
      'permissionMode: plan\ntools: Read\ndisallowedTools: Bash\n',
    );
    expect(content).not.toContain('sandbox_mode');
    expect(content).not.toContain('approval_policy');
    const stripped = warnings.filter(({ kind }) => kind === 'claude-only-frontmatter-stripped');
    expect(stripped.length).toBeGreaterThan(0);
    const text = JSON.stringify(stripped);
    for (const key of ['permissionMode', 'tools', 'disallowedTools']) {
      expect(text).toContain(key);
    }
  });

  test('an explicit native value is not altered by the Claude policy fields beside it', () => {
    const { content } = project(
      'codex',
      'permissionMode: bypassPermissions\ntools: Read\nsandbox-mode: read-only\n',
    );
    expect(content).toContain('sandbox_mode = "read-only"\n');
    expect(content).not.toContain('approval_policy');
  });
});

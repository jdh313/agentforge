import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { projectArtifact } from '../src/render.ts';
import { ProjectionRefusedError } from '../src/target-adapter.ts';
import { PI_SUBAGENTS_PACKAGE, PI_SUBAGENTS_VERSION } from '../src/targets/pi.ts';
import type { TargetName } from '../src/types.ts';

// Pi agent leaf projection to @gotgenes/pi-subagents (ndr:az33k6, ndr:jybfry).
// Sources are inline so each case states exactly the keys it is about; the
// matrix fixtures in render.test.ts carry the committed snapshots.

const REPO_ROOT = join(import.meta.dir, '..');

const PI_TOOLS = '  pi:\n    tools: [read, grep]\n';

const source = (frontmatter: string, body = '# Probe\n\nDo the probe.\n') =>
  `---\nname: pi-probe\ndescription: Exercises the Pi agent projection.\n${frontmatter}---\n\n${body}`;

const project = (src: string, target: TargetName = 'pi') =>
  projectArtifact({
    artifact: 'agent',
    target,
    sourcePath: '/virtual/pi-probe/AGENT.md',
    source: src,
  });

const frontmatterOf = (src: string) => matter(project(src).content).data;

const strippedDetail = (src: string): string => {
  const warnings = project(src).warnings.filter(
    ({ kind }) => kind === 'claude-only-frontmatter-stripped',
  );
  expect(warnings).toHaveLength(1);
  return warnings[0]?.detail ?? '';
};

describe('Pi agent projection: emitted keys', () => {
  test('writes <name>.md with the body as the agent prompt and no name key', () => {
    const projection = project(source(`targets:\n${PI_TOOLS}`));

    expect(projection.artifactName).toBe('pi-probe');
    expect(projection.extension).toBe('.md');
    const parsed = matter(projection.content);
    expect(parsed.data).not.toHaveProperty('name');
    expect(parsed.data.description).toBe('Exercises the Pi agent projection.');
    expect(parsed.content.trim()).toBe('# Probe\n\nDo the probe.');
  });

  test('renames effort to thinking with identical values', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const data = frontmatterOf(source(`effort: ${effort}\n`));
      expect(data.thinking).toBe(effort);
      expect(data).not.toHaveProperty('effort');
    }
  });

  test('renames maxTurns to max_turns verbatim', () => {
    const data = frontmatterOf(source('maxTurns: 7\n'));
    expect(data.max_turns).toBe(7);
    expect(data).not.toHaveProperty('maxTurns');
  });

  test.each([
    ['true', true],
    ['"true"', true],
    ['false', false],
    ['"false"', false],
  ] as const)('renames background %s to a YAML boolean run_in_background', (written, expected) => {
    const result = project(source(`background: ${written}\n`));
    // A string "true" would be ignored by the loader (`=== true`), so the
    // emitted document must contain the bare YAML scalar.
    expect(result.content).toContain(`run_in_background: ${expected}\n`);
    expect(matter(result.content).data.run_in_background).toBe(expected);
    expect(matter(result.content).data).not.toHaveProperty('background');
  });

  test('never emits a Pi-only key no canonical key sources', () => {
    const data = frontmatterOf(
      source(
        'model: sonnet\neffort: high\nmaxTurns: 3\nbackground: true\ntools: Read\ntargets:\n  pi:\n    model: anthropic/claude-sonnet-4-5\n    tools: [read]\n',
      ),
    );
    for (const key of ['display_name', 'prompt_mode', 'inherit_context', 'enabled', 'locked']) {
      expect(data).not.toHaveProperty(key);
    }
    expect(Object.keys(data).toSorted()).toEqual([
      'description',
      'max_turns',
      'model',
      'run_in_background',
      'thinking',
      'tools',
    ]);
  });

  test('is deterministic', () => {
    const src = source(`effort: high\nmaxTurns: 4\nbackground: false\ntargets:\n${PI_TOOLS}`);
    expect(project(src).content).toBe(project(src).content);
  });
});

describe('Pi agent projection: model and tools come only from targets.pi', () => {
  test('a shared model is reported as stripped and not emitted', () => {
    const src = source('model: sonnet\n');
    expect(frontmatterOf(src)).not.toHaveProperty('model');
    expect(strippedDetail(src)).toContain('model');
  });

  test('targets.pi.model is emitted verbatim', () => {
    const src = source('model: sonnet\ntargets:\n  pi:\n    model: anthropic/claude-sonnet-4-5\n');
    expect(frontmatterOf(src).model).toBe('anthropic/claude-sonnet-4-5');
  });

  test('a shared tools list is never emitted; targets.pi.tools is, and the shared one is reported', () => {
    const src = source(`tools:\n  - Read\n  - Grep\ntargets:\n${PI_TOOLS}`);
    expect(frontmatterOf(src).tools).toEqual(['read', 'grep']);
    expect(strippedDetail(src)).toContain('tools');
  });

  test('targets.pi.tools accepts a comma-separated string as written', () => {
    expect(frontmatterOf(source('targets:\n  pi:\n    tools: read, grep\n')).tools).toBe(
      'read, grep',
    );
  });

  test('targets.pi.tools rejects a value that is neither string nor list, as a refusal', () => {
    for (const value of ['3', '{ a: 1 }', '[read, 3]']) {
      const src = source(`targets:\n  pi:\n    tools: ${value}\n`);
      expect(() => project(src)).toThrow(ProjectionRefusedError);
      expect(() => project(src)).toThrow(
        /targets\.pi\.tools must be a string or a list of strings/,
      );
    }
  });

  test('a null targets.pi.tools is absent, so the gate still applies', () => {
    expect(() => project(source('tools: Read\ntargets:\n  pi:\n    tools: null\n'))).toThrow(
      ProjectionRefusedError,
    );
    expect(frontmatterOf(source('targets:\n  pi:\n    tools:\n'))).not.toHaveProperty('tools');
  });

  test('no Claude-to-Pi tool-name map exists: a shared Claude name never reaches the output', () => {
    const content = project(source(`tools: [Read, Bash]\ntargets:\n${PI_TOOLS}`)).content;
    expect(content).not.toContain('Read');
    expect(content).not.toContain('Bash');
  });
});

describe('Pi agent projection: refusal to lose a tool or permission restriction (ndr:jybfry)', () => {
  test('refuses a shared tools list with no targets.pi.tools', () => {
    expect(() => project(source('tools: Read\n'))).toThrow(ProjectionRefusedError);
    expect(() => project(source('tools: Read\n'))).toThrow(
      /agent "pi-probe".*tools restricts.*no targets\.pi\.tools/,
    );
  });

  test('refuses a shared disallowedTools with no targets.pi.tools', () => {
    expect(() => project(source('disallowedTools: [Write]\n'))).toThrow(ProjectionRefusedError);
    expect(() => project(source('disallowedTools: [Write]\n'))).toThrow(
      /agent "pi-probe".*disallowedTools restricts.*no targets\.pi\.tools/,
    );
  });

  test('names every restricting key', () => {
    expect(() =>
      project(source('tools: Read\ndisallowedTools: [Write]\npermissionMode: plan\n')),
    ).toThrow(/tools, disallowedTools, permissionMode restrict what it may do/);
  });

  test('refuses a plan-mode-only agent with no targets.pi.tools', () => {
    const src = source('permissionMode: plan\n');
    expect(() => project(src)).toThrow(ProjectionRefusedError);
    expect(() => project(src)).toThrow(/permissionMode restricts.*no targets\.pi\.tools/);
  });

  test.each([
    'default',
    'acceptEdits',
    'auto',
    'dontAsk',
    'manual',
  ])('refuses permissionMode %s', (mode) => {
    expect(() => project(source(`permissionMode: ${mode}\n`))).toThrow(ProjectionRefusedError);
  });

  test('permissionMode bypassPermissions renders (the one mode Pi already means)', () => {
    expect(() => project(source('permissionMode: bypassPermissions\n'))).not.toThrow();
  });

  test('an empty disallowedTools list restricts nothing and renders', () => {
    expect(() => project(source('disallowedTools: []\n'))).not.toThrow();
  });

  test('targets.pi.tools satisfies the gate for permissionMode too', () => {
    const src = source(`permissionMode: plan\ntargets:\n${PI_TOOLS}`);
    expect(matter(project(src).content).data.tools).toEqual(['read', 'grep']);
    expect(strippedDetail(src)).toContain('permissionMode');
  });

  test('names the source file so a batch run points at the agent', () => {
    expect(() => project(source('tools: Read\n'))).toThrow(/\/virtual\/pi-probe\/AGENT\.md/);
  });

  test('a targets.pi.tools override satisfies the gate even with disallowedTools remaining', () => {
    const src = source(`disallowedTools: [Write, Edit]\ntargets:\n${PI_TOOLS}`);
    const projection = project(src);
    expect(matter(projection.content).data.tools).toEqual(['read', 'grep']);
    expect(matter(projection.content).data).not.toHaveProperty('disallowedTools');
    // The denylist itself is still a loss and still reported.
    expect(strippedDetail(src)).toContain('disallowedTools');
  });

  test('an agent with no tool restriction renders without any override', () => {
    expect(() => project(source('effort: low\n'))).not.toThrow();
  });

  test('the refusal is Pi-only: Claude and Codex render the same source', () => {
    for (const target of ['claude', 'codex'] as const) {
      expect(() =>
        project(source('tools: Read\ndisallowedTools: [Write]\n'), target),
      ).not.toThrow();
    }
  });
});

describe('Pi agent projection: losses named by the az33k6 decision', () => {
  // One entry per key the decision reports as not accepted by Pi, each with a
  // value the canonical schema accepts. `targets.pi.tools` rides along so the
  // jybfry gate never fires for the restricting `disallowedTools` case.
  const LOSSES: readonly (readonly [string, string])[] = [
    ['disallowedTools', 'disallowedTools: [Write]\n'],
    ['permissionMode', 'permissionMode: plan\n'],
    ['isolation', 'isolation: worktree\n'],
    ['memory', 'memory: project\n'],
    ['omitClaudeMd', 'omitClaudeMd: true\n'],
    ['skills', 'skills: [vault-conventions]\n'],
    ['initialPrompt', 'initialPrompt: Start with the index.\n'],
    ['color', 'color: cyan\n'],
    ['mcpServers', 'mcpServers: [obsidian-mcp]\n'],
    ['hooks', 'hooks:\n  PreToolUse:\n    - matcher: Write\n'],
    ['experimental', 'experimental:\n  cacheTtl: 1h\n'],
    ['reasoning-summary', 'reasoning-summary: concise\n'],
    ['verbosity', 'verbosity: low\n'],
    ['sandbox-mode', 'sandbox-mode: read-only\n'],
    ['approval-policy', 'approval-policy: never\n'],
  ];

  test.each(LOSSES)('%s is reported as not accepted and never emitted', (key, line) => {
    const src = source(`${line}targets:\n${PI_TOOLS}`);
    const projection = project(src);

    const stripped = projection.warnings.filter(
      ({ kind }) => kind === 'claude-only-frontmatter-stripped',
    );
    expect(stripped).toHaveLength(1);
    expect(stripped[0]?.target).toBe('pi');
    expect(stripped[0]?.detail.split(/,\s*|\s+/)).toContain(key);
    expect(matter(projection.content).data).not.toHaveProperty(key);
    // A canonical key must never be reported as one agentforge has not heard of.
    expect(projection.warnings.map(({ kind }) => kind)).not.toContain(
      'unrecognized-frontmatter-key',
    );
  });

  test('the four Codex-only keys stay silent on Claude (they are reported on Pi only)', () => {
    const src = source(
      'reasoning-summary: concise\nverbosity: low\nsandbox-mode: read-only\napproval-policy: never\n',
    );
    expect(project(src, 'claude').warnings).toEqual([]);
  });

  test('maxTurns 1 emits max_turns 1 and a pi-max-turns-raised diagnostic', () => {
    const projection = project(source('maxTurns: 1\n'));
    expect(matter(projection.content).data.max_turns).toBe(1);
    expect(projection.warnings).toEqual([
      {
        kind: 'pi-max-turns-raised',
        target: 'pi',
        detail: expect.stringContaining('runs it as 2'),
      },
    ]);
    expect(projection.warnings[0]?.detail).toContain(PI_SUBAGENTS_VERSION);
  });

  test('maxTurns above 1 raises no diagnostic', () => {
    expect(project(source('maxTurns: 2\n')).warnings).toEqual([]);
  });
});

describe('Pi agent projection: targets.pi overrides', () => {
  test('a targets.pi frontmatter override wins over the shared value', () => {
    const data = frontmatterOf(
      source(
        `effort: low\nmaxTurns: 3\ntargets:\n  pi:\n    effort: max\n    maxTurns: 9\n    tools: [read]\n`,
      ),
    );
    expect(data.thinking).toBe('max');
    expect(data.max_turns).toBe(9);
  });

  test('a targets.pi.description override replaces the description', () => {
    const data = frontmatterOf(source('targets:\n  pi:\n    description: Pi flavoured.\n'));
    expect(data.description).toBe('Pi flavoured.');
  });

  test('targets.pi.body replaces the body wholesale', () => {
    const projection = project(
      source('targets:\n  pi:\n    body: |\n      # Pi body\n\n      Only for Pi.\n'),
    );
    expect(matter(projection.content).content.trim()).toBe('# Pi body\n\nOnly for Pi.');
    expect(projection.content).not.toContain('Do the probe.');
  });

  test('targets.pi never reaches another target', () => {
    const base = 'effort: high\nmaxTurns: 4\ntools: Read\n';
    const pi =
      'targets:\n  pi:\n    model: x/y\n    tools: [read]\n    effort: low\n    body: PI ONLY\n';
    for (const target of ['claude', 'codex'] as const) {
      expect(project(source(base + pi), target)).toEqual(project(source(base), target));
    }
  });

  test('a targets.pi value the output schema rejects is an error, not a silent drop', () => {
    expect(() => project(source('targets:\n  pi:\n    maxTurns: 0\n'))).toThrow();
  });
});

describe('Pi agent projection: pinned extension version', () => {
  test('the pinned version is one constant, cited in field-parity.md and limitations.md', () => {
    expect(PI_SUBAGENTS_VERSION).toBe('23.2.0');
    for (const doc of ['docs/field-parity.md', 'docs/limitations.md']) {
      const text = readFileSync(join(REPO_ROOT, doc), 'utf-8');
      expect(text).toContain(`${PI_SUBAGENTS_PACKAGE}`);
      expect(text).toContain(PI_SUBAGENTS_VERSION);
    }
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeMarketplaceAdapter, codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { compileMarketplace, type DesiredGeneratedOutput } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';
import { projectArtifact } from '../src/render.ts';
import { TARGET_NAMES, type TargetName } from '../src/types.ts';

const BLURB = 'Drive a change through the lifecycle'; // 36 chars, in range
const SIDECAR = 'agents/openai.yaml';

const skill = (frontmatter: string): string =>
  `---\nname: blurb\ndescription: Long routing description the model reads.\n${frontmatter}---\n\nBody.\n`;

const project = (target: TargetName, frontmatter: string) =>
  projectArtifact({
    sourcePath: '/virtual/blurb/SKILL.md',
    source: skill(frontmatter),
    target,
    artifact: 'skill',
  });

const sidecar = (target: TargetName, frontmatter: string): unknown => {
  const file = project(target, frontmatter).generatedFiles.find(
    ({ relativePath }) => relativePath === SIDECAR,
  );
  return file === undefined ? undefined : Bun.YAML.parse(file.content);
};

const lengthWarnings = (target: TargetName, frontmatter: string) =>
  project(target, frontmatter).warnings.filter(
    ({ kind }) => kind === 'codex-short-description-length',
  );

describe('short-description on Codex leaf skills', () => {
  test('emits interface.short_description alone, with no policy', () => {
    expect(sidecar('codex', `short-description: ${JSON.stringify(BLURB)}\n`)).toEqual({
      interface: { short_description: BLURB },
    });
  });

  test('shares one sidecar with the invocation policy', () => {
    const projection = project(
      'codex',
      `short-description: ${JSON.stringify(BLURB)}\ndisable-model-invocation: true\n`,
    );
    expect(projection.generatedFiles).toHaveLength(1);
    expect(projection.generatedFiles[0]?.content).toBe(
      `interface:\n  short_description: ${JSON.stringify(BLURB)}\npolicy:\n  allow_implicit_invocation: false\n`,
    );
  });

  test('emits no sidecar when neither key is set, and never derives from description', () => {
    expect(project('codex', '').generatedFiles).toEqual([]);
    expect(project('codex', 'disable-model-invocation: false\n').generatedFiles).toEqual([]);
  });

  test('JSON-quotes values that are awkward in YAML', () => {
    const awkward = 'Fix: handle "quotes" and # hashes ok';
    expect(sidecar('codex', `short-description: ${JSON.stringify(awkward)}\n`)).toEqual({
      interface: { short_description: awkward },
    });
  });

  test('targets.codex override wins over the top-level value', () => {
    const frontmatter = `short-description: ${JSON.stringify(BLURB)}\ntargets:\n  codex:\n    short-description: Codex-specific blurb for the picker\n`;
    expect(sidecar('codex', frontmatter)).toEqual({
      interface: { short_description: 'Codex-specific blurb for the picker' },
    });
  });

  test('keeps the key out of the SKILL.md frontmatter', () => {
    const { content } = project('codex', `short-description: ${JSON.stringify(BLURB)}\n`);
    expect(content).not.toContain('short-description');
  });
});

describe('short-description length warning', () => {
  const of = (length: number) => `short-description: ${'x'.repeat(length)}\n`;

  test.each([
    [24, 1],
    [25, 0],
    [64, 0],
    [65, 1],
  ])('%d characters yields %d warning(s)', (length, count) => {
    expect(lengthWarnings('codex', of(length))).toHaveLength(count);
  });

  test('still emits the value as written when out of range', () => {
    expect(sidecar('codex', of(10))).toEqual({ interface: { short_description: 'x'.repeat(10) } });
  });

  test.each(
    TARGET_NAMES.filter((target) => target !== 'codex'),
  )('does not warn on %s', (target) => {
    expect(lengthWarnings(target, of(3))).toEqual([]);
  });
});

describe('short-description on non-Codex targets', () => {
  const frontmatter = `short-description: ${JSON.stringify(BLURB)}\n`;

  test.each(
    TARGET_NAMES.filter((target) => target !== 'codex'),
  )('%s emits neither the key, a sidecar, nor any warning', (target) => {
    const projection = project(target, frontmatter);
    expect(projection.content).not.toContain('short-description');
    expect(projection.content).not.toContain(BLURB);
    expect(projection.generatedFiles).toEqual([]);
    expect(projection.warnings).toEqual([]);
  });

  test('is not reported as an unrecognized key on Codex', () => {
    expect(project('codex', frontmatter).warnings).toEqual([]);
  });
});

describe('short-description in marketplace compilation', () => {
  let root: string;
  const fixture = join(import.meta.dir, 'fixtures', 'definitions', 'cc-marketplace');

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'agentforge-short-description-'));
    cpSync(fixture, root, { recursive: true });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const codexOutput = async (destination: string): Promise<string> => {
    const loaded = await loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'));
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);
    const output = plan.outputs.find(
      (candidate): candidate is DesiredGeneratedOutput =>
        candidate.kind === 'generated' && candidate.destination === destination,
    );
    if (output === undefined) throw new Error(`no generated output at ${destination}`);
    return output.content;
  };

  const commandSidecar = 'packages/spec-flow/skills/spec-flow/agents/openai.yaml';

  test('a command without short-description omits the key and keeps display_name and policy', async () => {
    expect(Bun.YAML.parse(await codexOutput(commandSidecar))).toEqual({
      interface: { display_name: 'Spec Flow' },
      policy: { allow_implicit_invocation: false },
    });
  });

  test('a command with short-description emits it, still not derived from description', async () => {
    const path = join(root, 'packages/spec-flow/commands/spec-flow.md');
    const original = readFileSync(path, 'utf-8');
    writeFileSync(
      path,
      original.replace('---\n', `---\nshort-description: ${JSON.stringify(BLURB)}\n`),
    );
    try {
      expect(Bun.YAML.parse(await codexOutput(commandSidecar))).toEqual({
        interface: { display_name: 'Spec Flow', short_description: BLURB },
        policy: { allow_implicit_invocation: false },
      });
    } finally {
      writeFileSync(path, original);
    }
  });

  test('a package skill inherits the leaf behavior and a length warning is reported', async () => {
    const path = join(root, 'packages/craft/skills/tdd/SKILL.md');
    const original = readFileSync(path, 'utf-8');
    writeFileSync(path, original.replace('---\n', `---\nshort-description: too short\n`));
    try {
      const loaded = await loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'));
      const plan = compileMarketplace(loaded, [
        { target: 'claude', compilePublication: () => ({ outputs: [] }) },
        codexMarketplaceAdapter,
      ]);
      const sidecar = plan.outputs.find(
        (output) =>
          output.kind === 'generated' &&
          output.destination === 'packages/craft/skills/tdd/agents/openai.yaml',
      ) as DesiredGeneratedOutput | undefined;
      expect(Bun.YAML.parse(sidecar?.content ?? '')).toEqual({
        interface: { short_description: 'too short' },
      });
      expect(plan.diagnostics.map(({ code }) => code)).toContain('codex-short-description-length');

      const claudePlan = compileMarketplace(loaded, [
        claudeMarketplaceAdapter,
        { target: 'codex', compilePublication: () => ({ outputs: [] }) },
      ]);
      const claudeSkill = claudePlan.outputs.find(
        (output) =>
          output.kind === 'generated' &&
          output.destination === 'packages/craft/skills/tdd/SKILL.md',
      ) as DesiredGeneratedOutput | undefined;
      expect(claudeSkill?.content).not.toContain('short-description');
      expect(claudePlan.diagnostics.map(({ code }) => code)).not.toContain(
        'codex-short-description-length',
      );
    } finally {
      writeFileSync(path, original);
    }
  });
});

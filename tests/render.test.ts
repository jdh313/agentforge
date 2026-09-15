import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import JSZip from 'jszip';
import { render } from '../src/render.ts';
import { ARTIFACT_DEFS } from '../src/schema.ts';
import { getArtifactConfig } from '../src/targets/index.ts';
import { type ArtifactType, TARGET_NAMES, type TargetName } from '../src/types.ts';

const SKILL_FIXTURES = [
  'claude-rich',
  'with-overrides',
  'with-resources',
  'common-subset',
  'unrecognized-key',
] as const;
const OUTPUT_STYLE_FIXTURES = ['output-style-basic', 'output-style-rich'] as const;
const AGENT_FIXTURES = ['agent-basic', 'agent-overrides'] as const;

const FIXTURE_DIR = (name: string) => join(import.meta.dir, 'fixtures', name);

let TMP_ROOT: string;

beforeAll(() => {
  TMP_ROOT = mkdtempSync(join(tmpdir(), 'agentforge-test-'));
});

afterAll(() => {
  if (TMP_ROOT && existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
});

const loadZip = async (zipPath: string): Promise<JSZip> => JSZip.loadAsync(readFileSync(zipPath));

const readCanonicalOutput = async (
  outputPath: string,
  canonicalFilename: string,
): Promise<string> => {
  if (!outputPath.endsWith('.zip')) {
    return readFileSync(outputPath, 'utf-8');
  }
  const zip = await loadZip(outputPath);
  const entries = Object.keys(zip.files).filter((k) => k.endsWith(`/${canonicalFilename}`));
  if (entries.length !== 1) {
    throw new Error(
      `expected exactly one ${canonicalFilename} in ${outputPath}, found ${entries.length}`,
    );
  }
  const file = zip.file(entries[0]);
  if (!file) throw new Error(`zip entry vanished: ${entries[0]}`);
  return file.async('string');
};

const verifyResource = async (
  outputPath: string,
  outDir: string,
  sub: string,
): Promise<boolean> => {
  if (!outputPath.endsWith('.zip')) {
    return existsSync(join(outDir, sub));
  }
  const zip = await loadZip(outputPath);
  return Object.keys(zip.files).some((entry) => entry.includes(`/${sub}/`));
};

const runFixture = async (
  fixture: string,
  target: TargetName,
  artifact: ArtifactType,
  outDir: string,
): Promise<void> => {
  const result = await render({
    sourceDir: FIXTURE_DIR(fixture),
    target,
    outDir,
    artifact,
  });

  const content = await readCanonicalOutput(
    result.outputPath,
    ARTIFACT_DEFS[artifact].canonicalFilename,
  );
  expect(content).toMatchSnapshot('canonical');
  expect(result.warnings).toMatchSnapshot('warnings');
  expect(result.resourcesCopied.toSorted()).toMatchSnapshot('resources');

  for (const sub of result.resourcesCopied) {
    expect(await verifyResource(result.outputPath, outDir, sub)).toBe(true);
  }
};

describe('render skill', () => {
  for (const fixture of SKILL_FIXTURES) {
    for (const target of TARGET_NAMES) {
      test(`${fixture} → ${target}`, async () => {
        const outDir = join(TMP_ROOT, 'skill', fixture, target);
        await runFixture(fixture, target, 'skill', outDir);
      });
    }
  }

  // `disallowed-tools` was absent from the canonical schema, so zod stripped it
  // at parse and the Claude projection of a skill that forbade a tool permitted
  // it. Claude enforces the key, so this is a round-trip requirement, not a
  // capability question — asserted here rather than only in a snapshot so the
  // requirement survives a snapshot regeneration.
  test('round-trips disallowed-tools into the Claude projection', async () => {
    const outDir = join(TMP_ROOT, 'disallowed-tools', 'claude');
    const result = await render({
      sourceDir: FIXTURE_DIR('claude-rich'),
      target: 'claude',
      outDir,
      artifact: 'skill',
    });

    const frontmatter = matter(readFileSync(result.outputPath, 'utf-8')).data;
    expect(frontmatter['disallowed-tools']).toEqual(['WebSearch', 'Agent']);
    expect(result.warnings).toEqual([]);
  });

  test('names disallowed-tools in the stripped warning for a non-Claude target', async () => {
    const outDir = join(TMP_ROOT, 'disallowed-tools', 'codex');
    const result = await render({
      sourceDir: FIXTURE_DIR('claude-rich'),
      target: 'codex',
      outDir,
      artifact: 'skill',
    });

    expect(matter(readFileSync(result.outputPath, 'utf-8')).data).not.toHaveProperty(
      'disallowed-tools',
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'claude-only-frontmatter-stripped',
          detail: expect.stringContaining('disallowed-tools'),
        }),
      ]),
    );
  });

  // Emitting a key claims the target accepts it. The canonical schema stays
  // loose so AgentForge can report a future key instead of losing it during
  // parsing, but every target drops it until the checked-in acceptance table
  // names it (ndr:4x4yyv).
  test('an unrecognized canonical key is dropped with a warning for Claude', async () => {
    const outDir = join(TMP_ROOT, 'unrecognized-key', 'claude');
    const result = await render({
      sourceDir: FIXTURE_DIR('unrecognized-key'),
      target: 'claude',
      outDir,
      artifact: 'skill',
    });

    const frontmatter = matter(readFileSync(result.outputPath, 'utf-8')).data;
    expect(frontmatter).not.toHaveProperty('future-claude-key');
    expect(result.warnings).toEqual([
      {
        kind: 'unrecognized-frontmatter-key',
        target: 'claude',
        detail: 'future-claude-key not in the canonical schema; dropped for claude',
      },
    ]);
  });

  test.each([
    'opencode',
    'codex',
    'pi',
    'claude-chat',
  ] as const)('an unrecognized canonical key is dropped with a warning for %s', async (target) => {
    const outDir = join(TMP_ROOT, 'unrecognized-key', target);
    const result = await render({
      sourceDir: FIXTURE_DIR('unrecognized-key'),
      target,
      outDir,
      artifact: 'skill',
    });

    const content = await readCanonicalOutput(result.outputPath, 'SKILL.md');
    expect(matter(content).data).not.toHaveProperty('future-claude-key');
    expect(result.warnings).toEqual([
      {
        kind: 'unrecognized-frontmatter-key',
        target,
        detail: `future-claude-key not in the canonical schema; dropped for ${target}`,
      },
    ]);
  });

  // An unrecognized key is not a confirmed loss, so it must not borrow the
  // vocabulary of one (the same split ndr:szdn5s draws for body constructs).
  test('does not report an unrecognized key as a Claude-only stripped key', async () => {
    const result = await render({
      sourceDir: FIXTURE_DIR('unrecognized-key'),
      target: 'codex',
      outDir: join(TMP_ROOT, 'unrecognized-key', 'codex-kind'),
      artifact: 'skill',
    });

    expect(result.warnings.map(({ kind }) => kind)).not.toContain(
      'claude-only-frontmatter-stripped',
    );
  });

  test('translates explicit-only Claude skills into Codex invocation policy', async () => {
    const outDir = join(TMP_ROOT, 'explicit-only-codex');
    const result = await render({
      sourceDir: FIXTURE_DIR('claude-rich'),
      target: 'codex',
      outDir,
      artifact: 'skill',
    });

    expect(Bun.YAML.parse(readFileSync(join(outDir, 'agents', 'openai.yaml'), 'utf-8'))).toEqual({
      policy: { allow_implicit_invocation: false },
    });
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detail: expect.stringContaining('disable-model-invocation') }),
      ]),
    );
  });

  test.each([
    'explicit-only-false',
    'common-subset',
  ])('does not generate Codex invocation policy for %s', async (fixture) => {
    const outDir = join(TMP_ROOT, 'implicit-codex', fixture);
    const result = await render({
      sourceDir: FIXTURE_DIR(fixture),
      target: 'codex',
      outDir,
      artifact: 'skill',
    });

    expect(existsSync(join(outDir, 'agents', 'openai.yaml'))).toBe(false);
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detail: expect.stringContaining('disable-model-invocation') }),
      ]),
    );
  });

  test('publishes a directory render as a complete snapshot with normalized modes', async () => {
    const sourceDir = join(TMP_ROOT, 'planned-render-source');
    const outDir = join(TMP_ROOT, 'planned-render-output');
    cpSync(FIXTURE_DIR('with-resources'), sourceDir, { recursive: true });
    chmodSync(join(sourceDir, 'scripts/run.sh'), 0o755);
    chmodSync(join(sourceDir, 'references/api.md'), 0o640);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'stale.txt'), 'stale\n');

    await render({ sourceDir, target: 'claude', outDir, artifact: 'skill' });

    expect(readdirSync(outDir).toSorted()).toEqual(['SKILL.md', 'references', 'scripts']);
    expect(statSync(join(outDir, 'scripts/run.sh')).mode & 0o777).toBe(0o755);
    expect(statSync(join(outDir, 'references/api.md')).mode & 0o777).toBe(0o644);
  });

  test('leaves the prior render intact when a planned resource becomes unsafe', async () => {
    const sourceDir = join(TMP_ROOT, 'unsafe-render-source');
    const outDir = join(TMP_ROOT, 'unsafe-render-output');
    cpSync(FIXTURE_DIR('with-resources'), sourceDir, { recursive: true });
    rmSync(join(sourceDir, 'scripts/run.sh'));
    symlinkSync('../references/api.md', join(sourceDir, 'scripts/run.sh'));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'known-good.txt'), 'known good\n');

    await expect(
      render({ sourceDir, target: 'claude', outDir, artifact: 'skill' }),
    ).rejects.toThrow('must not be a symbolic link');

    expect(readdirSync(outDir)).toEqual(['known-good.txt']);
    expect(readFileSync(join(outDir, 'known-good.txt'), 'utf8')).toBe('known good\n');
  });

  test('publishes a bundle snapshot containing the materialized tree and executable modes', async () => {
    const sourceDir = join(TMP_ROOT, 'planned-bundle-source');
    const outDir = join(TMP_ROOT, 'planned-bundle-output');
    cpSync(FIXTURE_DIR('with-resources'), sourceDir, { recursive: true });
    chmodSync(join(sourceDir, 'scripts/run.sh'), 0o755);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'stale.txt'), 'stale\n');

    const result = await render({
      sourceDir,
      target: 'claude-chat',
      outDir,
      artifact: 'skill',
    });
    const firstArchive = readFileSync(result.outputPath);
    const zip = await loadZip(result.outputPath);
    const script = zip.file('with-resources/scripts/run.sh');

    expect(readdirSync(outDir)).toEqual(['with-resources.zip']);
    expect(Object.keys(zip.files).toSorted()).toEqual([
      'with-resources/',
      'with-resources/SKILL.md',
      'with-resources/references/',
      'with-resources/references/api.md',
      'with-resources/scripts/',
      'with-resources/scripts/run.sh',
    ]);
    expect(typeof script?.unixPermissions).toBe('number');
    expect((typeof script?.unixPermissions === 'number' ? script.unixPermissions : 0) & 0o777).toBe(
      0o755,
    );

    await render({ sourceDir, target: 'claude-chat', outDir, artifact: 'skill' });
    expect(readFileSync(result.outputPath)).toEqual(firstArchive);
  });
});

describe('render output-style', () => {
  for (const fixture of OUTPUT_STYLE_FIXTURES) {
    for (const target of TARGET_NAMES) {
      const supported = getArtifactConfig(target, 'output-style') !== undefined;
      if (!supported) {
        test(`${fixture} → ${target} (rejected: unsupported)`, async () => {
          await expect(
            render({
              sourceDir: FIXTURE_DIR(fixture),
              target,
              outDir: join(TMP_ROOT, 'output-style', fixture, target),
              artifact: 'output-style',
            }),
          ).rejects.toThrow(/does not support artifact output-style/);
        });
        continue;
      }
      test(`${fixture} → ${target}`, async () => {
        const outDir = join(TMP_ROOT, 'output-style', fixture, target);
        await runFixture(fixture, target, 'output-style', outDir);
      });
    }
  }
});

describe('render agent', () => {
  for (const fixture of AGENT_FIXTURES) {
    for (const target of TARGET_NAMES) {
      const supported = getArtifactConfig(target, 'agent') !== undefined;
      if (!supported) {
        test(`${fixture} → ${target} (rejected: unsupported)`, async () => {
          await expect(
            render({
              sourceDir: FIXTURE_DIR(fixture),
              target,
              outDir: join(TMP_ROOT, 'agent', fixture, target),
              artifact: 'agent',
            }),
          ).rejects.toThrow(/does not support artifact agent/);
        });
        continue;
      }
      test(`${fixture} → ${target}`, async () => {
        const outDir = join(TMP_ROOT, 'agent', fixture, target);
        await runFixture(fixture, target, 'agent', outDir);
      });
    }
  }

  test('deep-merges Claude fields and replaces the complete body', async () => {
    const outDir = join(TMP_ROOT, 'agent-overrides-explicit');
    const result = await render({
      sourceDir: FIXTURE_DIR('agent-overrides'),
      target: 'claude',
      outDir,
      artifact: 'agent',
    });

    expect(result.outputPath).toBe(join(outDir, 'claude-reader.md'));
    expect(matter(readFileSync(result.outputPath, 'utf-8'))).toMatchObject({
      data: {
        name: 'claude-reader',
        description: 'Read canonical material.',
        model: 'haiku',
        maxTurns: 8,
        tools: 'Read',
      },
      content: "# Claude reader\n\nUse Claude's native agent context.\n",
    });
    expect(readFileSync(result.outputPath, 'utf-8')).not.toContain('# Canonical reader');
    expect(result.warnings).toEqual([]);
  });
});

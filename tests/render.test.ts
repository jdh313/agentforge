import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
] as const;
const OUTPUT_STYLE_FIXTURES = ['output-style-basic', 'output-style-rich'] as const;

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

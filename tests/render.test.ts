import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

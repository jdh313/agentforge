import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../src/render.ts';
import { TARGET_NAMES, type TargetName } from '../src/types.ts';

const FIXTURES = ['claude-rich', 'with-overrides', 'with-resources', 'common-subset'] as const;
type Fixture = (typeof FIXTURES)[number];

const FIXTURE_DIR = (name: Fixture) => join(import.meta.dir, 'fixtures', name);

let TMP_ROOT: string;

beforeAll(() => {
  TMP_ROOT = mkdtempSync(join(tmpdir(), 'agentforge-test-'));
});

afterAll(() => {
  if (TMP_ROOT && existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
});

describe('render', () => {
  for (const fixture of FIXTURES) {
    for (const target of TARGET_NAMES) {
      test(`${fixture} → ${target}`, async () => {
        const outDir = join(TMP_ROOT, fixture, target);
        const result = await render({
          sourceDir: FIXTURE_DIR(fixture),
          target: target as TargetName,
          outDir,
        });

        const skillContent = readFileSync(result.outputPath, 'utf-8');
        expect(skillContent).toMatchSnapshot('SKILL.md');
        expect(result.warnings).toMatchSnapshot('warnings');
        expect(result.resourcesCopied.toSorted()).toMatchSnapshot('resources');

        for (const sub of result.resourcesCopied) {
          expect(existsSync(join(outDir, sub))).toBe(true);
        }
      });
    }
  }
});

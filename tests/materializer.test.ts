import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompilationPlan, DesiredOutput } from '../src/compiler.ts';
import { materializeCompilation } from '../src/materializer.ts';

let temporaryRoot: string;

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-materializer-'));
});

afterAll(() => {
  if (temporaryRoot && existsSync(temporaryRoot)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('marketplace materialization', () => {
  test('writes generated documents and copied artifacts', () => {
    const source = join(temporaryRoot, 'source.txt');
    const outDir = join(temporaryRoot, 'clean-build');
    writeFileSync(source, 'copied payload\n');

    const result = materializeCompilation(
      plan([
        generated('.agents/plugins/marketplace.json', '{"name":"fixture"}\n'),
        copied('packages/commit/assets/source.txt', source, 'commit'),
      ]),
      outDir,
    );

    expect(result).toEqual({
      outputRoot: outDir,
      filesWritten: ['.agents/plugins/marketplace.json', 'packages/commit/assets/source.txt'],
    });
    expect(readFileSync(join(outDir, '.agents/plugins/marketplace.json'), 'utf8')).toBe(
      '{"name":"fixture"}\n',
    );
    expect(readFileSync(join(outDir, 'packages/commit/assets/source.txt'), 'utf8')).toBe(
      'copied payload\n',
    );
  });

  test('replaces an existing output as a complete snapshot', () => {
    const outDir = join(temporaryRoot, 'rebuild');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'stale.txt'), 'stale\n');
    writeFileSync(join(outDir, 'marketplace.json'), 'old\n');

    materializeCompilation(plan([generated('marketplace.json', 'new\n')]), outDir);

    expect(readFileSync(join(outDir, 'marketplace.json'), 'utf8')).toBe('new\n');
    expect(existsSync(join(outDir, 'stale.txt'))).toBe(false);
  });

  test('rejects destinations outside the output root before publishing', () => {
    const outDir = join(temporaryRoot, 'unsafe');

    expect(() =>
      materializeCompilation(plan([generated('../escape.txt', 'unsafe\n')]), outDir),
    ).toThrow('destination escapes the output root');
    expect(existsSync(outDir)).toBe(false);
    expect(existsSync(join(temporaryRoot, 'escape.txt'))).toBe(false);
  });

  test('preserves the prior output when staging fails', () => {
    const outDir = join(temporaryRoot, 'failed-rebuild');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'marketplace.json'), 'known good\n');

    expect(() =>
      materializeCompilation(
        plan([
          generated('marketplace.json', 'replacement\n'),
          copied('packages/missing.txt', join(temporaryRoot, 'does-not-exist.txt'), 'commit'),
        ]),
        outDir,
      ),
    ).toThrow('failed to materialize marketplace');

    expect(readFileSync(join(outDir, 'marketplace.json'), 'utf8')).toBe('known good\n');
    expect(existsSync(join(outDir, 'packages/missing.txt'))).toBe(false);
  });
});

function plan(outputs: readonly DesiredOutput[]): CompilationPlan {
  return { marketplaceId: 'fixture', outputs, diagnostics: [] };
}

function generated(destination: string, content: string): DesiredOutput {
  return {
    kind: 'generated',
    target: 'claude',
    destination,
    content,
    provenance: { marketplacePath: '/fixture/MARKETPLACE.yaml', publicationId: 'claude' },
  };
}

function copied(destination: string, sourcePath: string, packageId: string): DesiredOutput {
  return {
    kind: 'copy',
    target: 'claude',
    destination,
    sourcePath,
    provenance: {
      marketplacePath: '/fixture/MARKETPLACE.yaml',
      publicationId: 'claude',
      packageId,
    },
  };
}

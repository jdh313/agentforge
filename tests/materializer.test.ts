import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompilationPlan, DesiredCopiedOutput, DesiredOutput } from '../src/compiler.ts';
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
      rootFilesWritten: [],
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

  test('normalizes copied payload modes while preserving executable intent', () => {
    const executableSource = join(temporaryRoot, 'executable-source.sh');
    const regularSource = join(temporaryRoot, 'regular-source.txt');
    const outDir = join(temporaryRoot, 'portable-modes');
    writeFileSync(executableSource, '#!/bin/sh\n');
    writeFileSync(regularSource, 'regular\n');
    chmodSync(executableSource, 0o751);
    chmodSync(regularSource, 0o640);

    materializeCompilation(
      plan([
        { ...copied('bin/run.sh', executableSource, 'commit'), executable: true },
        { ...copied('README.txt', regularSource, 'commit'), executable: false },
      ]),
      outDir,
    );

    expect(statSync(join(outDir, 'bin/run.sh')).mode & 0o777).toBe(0o755);
    expect(statSync(join(outDir, 'README.txt')).mode & 0o777).toBe(0o644);
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

  test('rejects a declared payload replaced by a symlink after planning', () => {
    const packageRoot = join(temporaryRoot, 'retargeted-package');
    const source = join(packageRoot, 'payload.txt');
    const external = join(temporaryRoot, 'external.txt');
    const outDir = join(temporaryRoot, 'retargeted-output');
    mkdirSync(packageRoot);
    mkdirSync(outDir);
    writeFileSync(source, 'original\n');
    writeFileSync(external, 'external\n');
    writeFileSync(join(outDir, 'sentinel.txt'), 'keep\n');
    const output = { ...copied('payload.txt', source, 'commit'), sourceRoot: packageRoot };
    unlinkSync(source);
    symlinkSync(external, source);

    expect(() => materializeCompilation(plan([output]), outDir)).toThrow(
      'payload source must not be a symbolic link or traverse one',
    );
    expect(readFileSync(join(outDir, 'sentinel.txt'), 'utf8')).toBe('keep\n');
    expect(existsSync(join(outDir, 'payload.txt'))).toBe(false);
  });
});

function plan(outputs: readonly DesiredOutput[]): CompilationPlan {
  return { marketplaceId: 'fixture', outputs, diagnostics: [], rootOutputs: [] };
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

function copied(destination: string, sourcePath: string, packageId: string): DesiredCopiedOutput {
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

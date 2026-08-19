import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMarketplace } from 'agentforge/check';
import type { CompilationPlan } from 'agentforge/compiler';
import { materializeCompilation } from 'agentforge/materializer';

let temporaryRoot: string;

beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-check-'));
});

afterEach(() => {
  if (temporaryRoot && existsSync(temporaryRoot)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('marketplace check', () => {
  test('accepts a byte-for-byte clean managed publication', () => {
    const source = join(temporaryRoot, 'source.txt');
    const outputRoot = join(temporaryRoot, 'output');
    writeFileSync(source, 'copied\n');
    const plan = fixturePlan(source);
    materializeCompilation(plan, outputRoot);

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toEqual([]);
    expect(result.filesChecked).toEqual([
      'claude/generated.json',
      'claude/packages/example/source.txt',
    ]);
  });

  test('reports every drift class without changing the output tree', () => {
    const source = join(temporaryRoot, 'source.txt');
    const outputRoot = join(temporaryRoot, 'output');
    writeFileSync(source, 'copied\n');
    const plan = fixturePlan(source);
    materializeCompilation(plan, outputRoot);
    rmSync(join(outputRoot, 'claude', 'generated.json'));
    writeFileSync(join(outputRoot, 'claude', 'packages', 'example', 'source.txt'), 'changed\n');
    writeFileSync(join(outputRoot, 'claude', 'unexpected.txt'), 'extra\n');
    mkdirSync(join(outputRoot, 'unmanaged'));
    writeFileSync(join(outputRoot, 'unmanaged', 'ignored.txt'), 'outside selection\n');
    const before = snapshot(outputRoot);

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toEqual([
      {
        code: 'missing-output',
        publicationId: 'claude',
        path: 'claude/generated.json',
        message: 'managed output is missing',
      },
      {
        code: 'changed-output',
        publicationId: 'claude',
        packageId: 'example',
        path: 'claude/packages/example/source.txt',
        message: 'managed output differs from the compilation plan',
      },
      {
        code: 'unexpected-output',
        publicationId: 'claude',
        path: 'claude/unexpected.txt',
        message: 'file is not managed by the compilation plan',
      },
    ]);
    expect(snapshot(outputRoot)).toEqual(before);
  });

  test('reports executable permission drift without repairing the output', () => {
    if (process.platform === 'win32') return;
    const source = join(temporaryRoot, 'script.sh');
    const outputRoot = join(temporaryRoot, 'output');
    writeFileSync(source, '#!/bin/sh\n');
    const basePlan = fixturePlan(source);
    const plan: CompilationPlan = {
      ...basePlan,
      outputs: basePlan.outputs.map((output) =>
        output.kind === 'copy' ? { ...output, executable: true } : output,
      ),
    };
    materializeCompilation(plan, outputRoot);
    const script = join(outputRoot, 'claude', 'packages', 'example', 'source.txt');
    chmodSync(script, 0o644);

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'changed-output-mode',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/packages/example/source.txt',
      message: 'managed output mode is 0644; expected 0755',
    });
    expect(statSync(script).mode & 0o777).toBe(0o644);
  });

  test('reports target-native schema failures with package provenance', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = claudePlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'claude', 'packages', 'example', '.claude-plugin', 'plugin.json'),
      '{"name":"example","version":7}\n',
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'invalid-native-document',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/packages/example/.claude-plugin/plugin.json',
      message:
        'invalid Claude plugin manifest: version: Invalid input: expected string, received number',
    });
  });

  test('rejects plugin references that escape the publication root', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = claudePlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'claude', '.claude-plugin', 'marketplace.json'),
      `${JSON.stringify({
        name: 'fixture',
        owner: { name: 'Jacob' },
        plugins: [{ name: 'example', version: '1.0.0', source: '../escape' }],
      })}\n`,
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'unsafe-plugin-path',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/.claude-plugin/marketplace.json',
      message: 'plugin "example" source "../escape" must be a contained ./-relative package path',
    });
  });

  test('reports registry entries whose plugin manifest is missing', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = claudePlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'claude', '.claude-plugin', 'marketplace.json'),
      `${JSON.stringify({
        name: 'fixture',
        owner: { name: 'Jacob' },
        plugins: [{ name: 'example', version: '1.0.0', source: './packages/missing' }],
      })}\n`,
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'broken-plugin-reference',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/.claude-plugin/marketplace.json',
      message:
        'plugin "example" references missing manifest "claude/packages/missing/.claude-plugin/plugin.json"',
    });
  });

  test('reports package identity and version mismatches', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = claudePlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'claude', 'packages', 'example', '.claude-plugin', 'plugin.json'),
      '{"name":"renamed","version":"2.0.0"}\n',
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'package-identity-mismatch',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/packages/example/.claude-plugin/plugin.json',
      message: 'plugin manifest name "renamed" does not match compiled package name "example"',
    });
    expect(result.issues).toContainEqual({
      code: 'package-version-mismatch',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/packages/example/.claude-plugin/plugin.json',
      message: 'plugin manifest version "2.0.0" does not match compiled package version "1.0.0"',
    });
  });

  test('reports registry metadata that disagrees with its plugin manifest', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = claudePlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'claude', '.claude-plugin', 'marketplace.json'),
      `${JSON.stringify({
        name: 'fixture',
        owner: { name: 'Jacob' },
        plugins: [{ name: 'example', version: '2.0.0', source: './packages/example' }],
      })}\n`,
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'package-version-mismatch',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/.claude-plugin/marketplace.json',
      message: 'registry version "2.0.0" does not match plugin manifest version "1.0.0"',
    });
  });

  test('reports invalid projected artifact frontmatter', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = claudePlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'claude', 'packages', 'example', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\ndescription: 7\n---\n\n# Demo\n',
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'invalid-artifact-frontmatter',
      publicationId: 'claude',
      packageId: 'example',
      path: 'claude/packages/example/skills/demo/SKILL.md',
      message:
        'invalid Claude skill frontmatter: description: Invalid input: expected string, received number',
    });
  });

  test('enforces the internal Codex beta registry contract', () => {
    const outputRoot = join(temporaryRoot, 'output');
    const plan = codexPlan();
    materializeCompilation(plan, outputRoot);
    writeFileSync(
      join(outputRoot, 'codex', '.agents', 'plugins', 'marketplace.json'),
      `${JSON.stringify({
        name: 'fixture',
        plugins: [
          {
            name: 'example',
            source: { source: 'local' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Developer Tools',
          },
        ],
      })}\n`,
    );

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'invalid-native-document',
      publicationId: 'codex',
      path: 'codex/.agents/plugins/marketplace.json',
      message:
        'invalid Codex marketplace registry: plugins.0.source.path: Invalid input: expected string, received undefined',
    });
  });

  test('does not follow managed-file symlinks outside the publication root', () => {
    const source = join(temporaryRoot, 'source.txt');
    const external = join(temporaryRoot, 'external.json');
    const outputRoot = join(temporaryRoot, 'output');
    writeFileSync(source, 'copied\n');
    writeFileSync(external, '{"ok":true}\n');
    const plan = fixturePlan(source);
    materializeCompilation(plan, outputRoot);
    rmSync(join(outputRoot, 'claude', 'generated.json'));
    symlinkSync(external, join(outputRoot, 'claude', 'generated.json'));

    const result = checkMarketplace(plan, outputRoot);

    expect(result.issues).toContainEqual({
      code: 'unsafe-output-entry',
      publicationId: 'claude',
      path: 'claude/generated.json',
      message: 'managed output must be a regular file contained by its publication root',
    });
  });
});

function fixturePlan(sourcePath: string): CompilationPlan {
  return {
    marketplaceId: 'fixture',
    diagnostics: [],
    rootOutputs: [],
    outputs: [
      {
        kind: 'generated',
        destination: 'claude/generated.json',
        content: '{"ok":true}\n',
        target: 'claude',
        provenance: {
          marketplacePath: '/fixture/MARKETPLACE.yaml',
          publicationId: 'claude',
        },
      },
      {
        kind: 'copy',
        destination: 'claude/packages/example/source.txt',
        sourcePath,
        target: 'claude',
        provenance: {
          marketplacePath: '/fixture/MARKETPLACE.yaml',
          publicationId: 'claude',
          packageId: 'example',
        },
      },
    ],
  };
}

function claudePlan(): CompilationPlan {
  return {
    marketplaceId: 'fixture',
    diagnostics: [],
    rootOutputs: [],
    outputs: [
      generated(
        'claude/.claude-plugin/marketplace.json',
        JSON.stringify({
          name: 'fixture',
          owner: { name: 'Jacob' },
          plugins: [{ name: 'example', version: '1.0.0', source: './packages/example' }],
        }),
      ),
      generated(
        'claude/packages/example/.claude-plugin/plugin.json',
        JSON.stringify({ name: 'example', version: '1.0.0' }),
        'example',
      ),
      generated(
        'claude/packages/example/skills/demo/SKILL.md',
        '---\nname: demo\ndescription: Demo skill\n---\n\n# Demo\n',
        'example',
      ),
    ],
  };
}

function codexPlan(): CompilationPlan {
  return {
    marketplaceId: 'fixture',
    diagnostics: [],
    rootOutputs: [],
    outputs: [
      {
        kind: 'generated',
        destination: 'codex/.agents/plugins/marketplace.json',
        content: `${JSON.stringify({
          name: 'fixture',
          plugins: [
            {
              name: 'example',
              source: { source: 'local', path: './packages/example' },
              policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
              category: 'Developer Tools',
            },
          ],
        })}\n`,
        target: 'codex',
        provenance: {
          marketplacePath: '/fixture/MARKETPLACE.yaml',
          publicationId: 'codex',
        },
      },
    ],
  };
}

function generated(destination: string, content: string, packageId?: string) {
  return {
    kind: 'generated' as const,
    destination,
    content: `${content}\n`,
    target: 'claude' as const,
    provenance: {
      marketplacePath: '/fixture/MARKETPLACE.yaml',
      publicationId: 'claude',
      ...(packageId === undefined ? {} : { packageId }),
    },
  };
}

function snapshot(root: string): Record<string, string> {
  const files = [...new Bun.Glob('**/*').scanSync({ cwd: root, onlyFiles: true })].toSorted();
  return Object.fromEntries(files.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
}

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { NativeOverlay, PackageDefinition } from '../src/definitions.ts';
import { copyPackage, editPackage, put, runPackageCli, tree } from './pi-package-helpers.ts';

let root: string;
let source: string;
let out: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-pi-package-cli-'));
  source = copyPackage(root);
  out = join(root, 'output');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function native(definition: PackageDefinition, fields: NativeOverlay) {
  const target = definition.targets.pi;
  if (!target) throw new Error('fixture missing pi target');
  target.native = { ...target.native, ...fields };
}
function compile() {
  const result = runPackageCli('compile', source, out);
  expect(result.exitCode, result.stderr).toBe(0);
  return result;
}
function refusal(edit: (definition: PackageDefinition) => void, pattern: RegExp) {
  mkdirSync(out);
  writeFileSync(join(out, 'old.txt'), 'keep the last published output');
  const before = tree(out);
  editPackage(source, edit);
  const result = runPackageCli('compile', source, out);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
  expect(tree(out)).toEqual(before);
  expect(readdirSync(root).filter((name) => /staging|backup/.test(name))).toEqual([]);
}

describe('standalone Pi package CLI', () => {
  test('compile/check are deterministic, byte-preserving and complete snapshots', () => {
    const executable = join(dirname(source), 'native/scripts/lifecycle.js');
    chmodSync(executable, 0o751);
    put(dirname(source), 'native/assets/binary.dat', new Uint8Array([0, 255, 13, 10]));
    compile();
    const first = tree(out);
    expect(readFileSync(join(out, 'extensions/guard.ts'))).toEqual(
      readFileSync(join(dirname(source), 'native/extensions/guard.ts')),
    );
    expect(readFileSync(join(out, 'lib/helper.ts'))).toEqual(
      readFileSync(join(dirname(source), 'native/lib/helper.ts')),
    );
    expect(first['scripts/lifecycle.js']?.mode).toBe(0o755);
    expect(first['assets/settings.json']?.mode).toBe(0o644);
    expect(readFileSync(join(out, 'assets/binary.dat'))).toEqual(Buffer.from([0, 255, 13, 10]));
    put(out, 'node_modules/stale/index.js', 'unmanaged dependency');
    compile();
    expect(tree(out)).toEqual(first);
    const check = runPackageCli('check', source, out);
    expect(check.exitCode, check.stderr + check.stdout).toBe(0);
    expect(tree(out)).toEqual(first);
  });

  test('JSON check report counts standalone manifest and payloads without human stdout', () => {
    compile();
    const before = tree(out);
    const result = runPackageCli('check', source, out, { extra: ['--json'] });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      marketplaceId: 'tool-guard',
      status: 'ok',
      publications: [{ id: 'tool-guard', status: 'ok', filesChecked: Object.keys(before).length }],
      issues: [],
      diagnostics: [],
    });
    expect(Object.keys(before).length).toBe(5);
    expect(tree(out)).toEqual(before);
  });

  test('check a missing output fails without creating it', () => {
    const result = runPackageCli('check', source, out);
    expect(result.exitCode).not.toBe(0);
    expect(existsSync(out)).toBe(false);
  });

  for (const [label, mutate, message] of [
    ['changed payload', () => put(out, 'extensions/guard.ts', 'changed'), /changed|drift|content/i],
    ['missing payload', () => rmSync(join(out, 'extensions/guard.ts')), /missing/i],
    ['unexpected payload', () => put(out, 'rogue.ts', 'extra'), /unexpected/i],
    ['invalid native JSON', () => put(out, 'package.json', '{invalid'), /invalid|json/i],
    [
      'invalid resource JSON',
      () => put(out, 'assets/settings.json', '{invalid'),
      /invalid-output-document|invalid.*json/i,
    ],
    [
      'unsafe content',
      () => put(out, 'lib/helper.ts', 'const home = "/Users/testperson/private/";'),
      /unsafe-output-content|home/i,
    ],
    [
      'changed executable mode',
      () => chmodSync(join(out, 'scripts/lifecycle.js'), 0o755),
      /mode|executable/i,
    ],
    [
      'broken resource reference',
      () => {
        const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
        manifest.pi.extensions = ['./extensions/missing.ts'];
        put(out, 'package.json', JSON.stringify(manifest));
      },
      /missing|resource|entry/i,
    ],
    [
      'conflicting manifest identity',
      () => {
        const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
        manifest.name = 'somebody-else';
        put(out, 'package.json', JSON.stringify(manifest));
      },
      /identity|name|invalid-native-document/i,
    ],
  ] as const) {
    test(`check diagnoses ${label} and writes nothing`, () => {
      compile();
      mutate();
      const before = tree(out);
      const result = runPackageCli('check', source, out);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(message);
      expect(tree(out)).toEqual(before);
    });
  }

  for (const [label, fields, pattern] of [
    [
      'missing entry',
      { pi: { extensions: ['./extensions/missing.ts'] } },
      /entry|resource|missing/i,
    ],
    ['traversal', { pi: { extensions: ['../escape.ts'] } }, /path|relative|traversal|escape/i],
    ['absolute entry', { pi: { extensions: ['/tmp/escape.ts'] } }, /path|relative|absolute/i],
    ['glob entry', { pi: { extensions: ['./extensions/*.ts'] } }, /glob|exact|wildcard/i],
    [
      'exclusion entry',
      { pi: { extensions: ['!./extensions/guard.ts'] } },
      /glob|exact|exclusion|path/i,
    ],
    [
      'wrong suffix',
      { pi: { extensions: ['./assets/settings.json'] } },
      /extension|entry|typescript|javascript/i,
    ],
    ['non-array entries', { pi: { extensions: './extensions/guard.ts' } }, /array|extensions/i],
    [
      'prompt activation',
      { pi: { extensions: ['./extensions/guard.ts'], prompts: ['./assets/settings.json'] } },
      /prompt|unsupported/i,
    ],
    [
      'theme activation',
      { pi: { extensions: ['./extensions/guard.ts'], themes: ['./assets/settings.json'] } },
      /theme|unsupported/i,
    ],
    ['name conflict', { name: 'different-owner' }, /name|identity|conflict/i],
    ['version conflict', { version: '9.9.9' }, /version|identity|conflict/i],
    [
      'host dependency',
      { dependencies: { '@earendil-works/pi-coding-agent': '*' } },
      /peer|host|dependency|dependencies/i,
    ],
    ['invalid dependency', { dependencies: { example: 123 } }, /dependency|dependencies|string/i],
    ['invalid lifecycle metadata', { scripts: { install: 123 } }, /scripts|string/i],
    ['empty resources', { pi: { extensions: [] } }, /loadable|resource|extension/i],
  ] satisfies [string, NativeOverlay, RegExp][]) {
    test(`rejects ${label} before publishing`, () => refusal((d) => native(d, fields), pattern));
  }

  for (const host of [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-coding-agent',
    '@earendil-works/pi-tui',
  ]) {
    for (const field of ['dependencies', 'optionalDependencies']) {
      test(`${host} must not ship as ${field}`, () => {
        refusal(
          (d) => native(d, { [field]: { [host]: '*' } }),
          /peer|host|dependency|dependencies/i,
        );
      });
    }
  }

  test('all host-provided Pi modules are accepted as unconstrained peers', () => {
    editPackage(source, (d) =>
      native(d, {
        peerDependencies: {
          '@earendil-works/pi-ai': '*',
          '@earendil-works/pi-agent-core': '*',
          '@earendil-works/pi-coding-agent': '*',
          '@earendil-works/pi-tui': '*',
        },
      }),
    );
    compile();
    expect(runPackageCli('check', source, out).exitCode).toBe(0);
  });

  test('metadata-only shells remain rejected', () => {
    refusal((d) => {
      d.payloads = undefined;
      if (d.targets.pi) d.targets.pi.payloads = undefined;
    }, /payload|artifact/i);
  });

  for (const destination of ['package.json', 'PACKAGE.JSON']) {
    for (const collision of [undefined, 'override'] as const) {
      test(`generated manifest cannot be replaced by ${destination} (${collision ?? 'default'})`, () => {
        put(dirname(source), 'replacement.json', '{}');
        refusal((d) => {
          d.targets.pi?.payloads?.include.push({
            source: 'replacement.json',
            destination,
            collision,
          });
        }, /package\.json|reserved|collision/i);
      });
    }
  }
  test('duplicate exact payload destinations cannot silently overwrite code', () => {
    put(dirname(source), 'duplicate.ts', 'different bytes');
    refusal((d) => {
      d.targets.pi?.payloads?.include.push({
        source: 'duplicate.ts',
        destination: 'extensions/guard.ts',
      });
    }, /collid|collision|duplicate/i);
  });

  test('payload destinations cannot escape the package root', () => {
    refusal((d) => {
      d.targets.pi?.payloads?.include.push({
        source: 'native/lib/helper.ts',
        destination: '../escape.ts',
      });
    }, /path|traversal|escape|relative/i);
    expect(existsSync(join(root, 'escape.ts'))).toBe(false);
  });

  test('check rejects symlinked resources without reading or changing their referents', () => {
    compile();
    put(root, 'external.ts', 'keep external bytes');
    const external = readFileSync(join(root, 'external.ts'));
    rmSync(join(out, 'extensions/guard.ts'));
    symlinkSync(join(root, 'external.ts'), join(out, 'extensions/guard.ts'));
    const before = tree(out);
    const result = runPackageCli('check', source, out);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/unsafe-output-entry|symlink|symbolic|resource/i);
    expect(tree(out)).toEqual(before);
    expect(readFileSync(join(root, 'external.ts'))).toEqual(external);
  });

  test('case-folded payload destinations collide', () => {
    put(dirname(source), 'duplicate.ts', 'different bytes');
    refusal((d) => {
      d.targets.pi?.payloads?.include.push({
        source: 'duplicate.ts',
        destination: 'Extensions/GUARD.ts',
      });
    }, /collid|collision|duplicate/i);
  });
  test('unsupported package agents fail without writes', () => {
    put(
      dirname(source),
      'agents/reader/AGENT.md',
      '---\nname: reader\ndescription: Read\n---\nRead.\n',
    );
    refusal(
      (d) => d.artifacts.push({ type: 'agent', pattern: 'agents/*/AGENT.md' }),
      /agent|unsupported/i,
    );
  });
  test('unsupported target package compilation is explicit and writes nothing', () => {
    const result = runPackageCli('compile', source, out, { target: 'claude' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/package|unsupported|support/i);
    expect(existsSync(out)).toBe(false);
  });

  for (const relationship of [
    'equal',
    'inside-source',
    'contains-source',
    'symlink-alias',
  ] as const) {
    test(`refuses source/output overlap (${relationship}) preserving source`, () => {
      const sourceRoot = dirname(source);
      const before = tree(sourceRoot);
      let output = sourceRoot;
      if (relationship === 'inside-source') output = join(sourceRoot, 'dist');
      if (relationship === 'contains-source') output = root;
      if (relationship === 'symlink-alias') {
        symlinkSync(sourceRoot, join(root, 'alias'));
        output = join(root, 'alias', 'dist');
      }
      const result = runPackageCli('compile', source, output);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/overlap|source|symlink/i);
      expect(tree(sourceRoot)).toEqual(before);
    });
  }
  test('rejects symlinked payloads before publication', () => {
    put(root, 'external.ts', 'outside source');
    rmSync(join(dirname(source), 'native/extensions/guard.ts'));
    symlinkSync(join(root, 'external.ts'), join(dirname(source), 'native/extensions/guard.ts'));
    const result = runPackageCli('compile', source, out);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/symlink|symbolic/i);
    expect(existsSync(out)).toBe(false);
  });
  test('rejects a symlink output without touching its referent', () => {
    const real = join(root, 'real');
    put(real, 'old.txt', 'keep');
    symlinkSync(real, out);
    const before = tree(real);
    const result = runPackageCli('compile', source, out);
    expect(result.exitCode).not.toBe(0);
    expect(tree(real)).toEqual(before);
  });

  test('compile/check never evaluate extensions, dependencies, lifecycle scripts or package managers', () => {
    const marker = join(root, 'executed');
    const managers = join(root, 'fake-bin');
    mkdirSync(managers);
    for (const manager of ['npm', 'pnpm', 'yarn', 'bun', 'npx']) {
      put(managers, manager, `#!/bin/sh\nprintf executed > '${marker}'\nexit 99\n`);
      chmodSync(join(managers, manager), 0o755);
    }
    put(
      dirname(source),
      'native/lib/dependency.js',
      'require("node:fs").writeFileSync(process.env.AGENTFORGE_EXECUTION_MARKER, "dependency evaluated");\n',
    );
    put(
      dirname(source),
      'native/extensions/guard.ts',
      `${readFileSync(join(dirname(source), 'native/extensions/guard.ts'), 'utf8')}\nimport '../lib/dependency.js';\n`,
    );
    const env = { AGENTFORGE_EXECUTION_MARKER: marker, PATH: `${managers}:${process.env.PATH}` };
    for (const operation of ['compile', 'check']) {
      const result = runPackageCli(operation, source, out, { env });
      expect(result.exitCode, result.stderr + result.stdout).toBe(0);
      expect(existsSync(marker)).toBe(false);
    }
  });
});

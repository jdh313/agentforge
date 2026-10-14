import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPackageDefinition } from '../src/definitions.ts';
import { compilePackage } from '../src/package-compiler.ts';
import { checkRepository, materializeRepository, planRepository } from '../src/repository.ts';
import { CanonicalRepository, type RepositoryDefinition } from '../src/repository-definition.ts';
import { getTarget } from '../src/targets/index.ts';
import { PACKAGE_CLI, put, tree } from './pi-package-helpers.ts';

let root: string;
let config: string;
let definition: RepositoryDefinition;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agentforge-repository-')));
  config = join(root, 'agentforge.yaml');
  definition = {
    schema: 'agentforge.repository/v1',
    id: 'tools',
    defaults: { name: 'Tools', owner: { name: 'Fixture' } },
    packages: ['plugins/tools/PACKAGE.yaml'],
    publications: [
      {
        kind: 'marketplace',
        id: 'claude',
        target: 'claude',
        out: 'marketplaces/claude',
        destination: '.claude-plugin/marketplace.json',
        enrollment: { mode: 'include', packages: ['tools'] },
        'root-manifest': false,
      },
      {
        kind: 'marketplace',
        id: 'codex',
        target: 'codex',
        out: 'marketplaces/codex',
        destination: '.agents/plugins/marketplace.json',
        enrollment: { mode: 'include', packages: ['tools'] },
        'root-manifest': false,
      },
      { kind: 'package', id: 'pi-tools', target: 'pi', package: 'tools', out: 'packages/pi/tools' },
    ],
  };
  put(
    root,
    'plugins/tools/PACKAGE.yaml',
    JSON.stringify({
      schema: 'agentforge.package/v1',
      id: 'tools',
      defaults: { name: 'tools', version: '1.0.0' },
      artifacts: [{ type: 'skill', pattern: 'skills/*/SKILL.md' }],
      targets: {
        claude: {},
        codex: { native: { interface: { displayName: 'Tools', category: 'Productivity' } } },
        pi: {
          native: { pi: { extensions: ['./extensions/guard.ts'] } },
          payloads: { include: [{ source: 'native/', destination: 'extensions/' }] },
        },
      },
    }),
  );
  put(
    root,
    'plugins/tools/skills/tool/SKILL.md',
    '---\nname: tool\ndescription: Fixture tool\n---\n\nRead the reference.\n',
  );
  put(root, 'plugins/tools/native/guard.ts', 'export default () => {};\n');
  put(root, 'plugins/tools/native/helper.js', 'export const marker = 1;\n');
  save();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function save() {
  put(root, 'agentforge.yaml', JSON.stringify(definition));
}
function publicationAt(index: number) {
  const publication = definition.publications[index];
  if (!publication) throw new Error(`missing fixture publication ${index}`);
  return publication;
}
function sourceAt(index: number) {
  const source = definition.packages[index];
  if (!source) throw new Error(`missing fixture source ${index}`);
  return source;
}
function cli(
  operation: string,
  path = config,
  extra: string[] = [],
  cwd = root,
  env: Record<string, string> = {},
) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, PACKAGE_CLI, operation, path, ...extra],
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
function packageOnly() {
  definition.publications = definition.publications.filter(
    (publication) => publication.kind === 'package',
  );
  save();
}
function assertNoStaging() {
  expect(
    readdirSync(root, { recursive: true }).filter((path) =>
      /\.(staging|backup)-|\.staging-|\.backup-/.test(String(path)),
    ),
  ).toEqual([]);
}

describe('repository schema and command contract', () => {
  test('one command builds and checks all three harness publications from one package', async () => {
    const before = tree(join(root, 'plugins'));
    expect(cli('compile').code).toBe(0);
    expect(tree(join(root, 'plugins'))).toEqual(before);
    expect(existsSync(join(root, 'marketplaces/claude/.claude-plugin/marketplace.json'))).toBe(
      true,
    );
    expect(existsSync(join(root, 'marketplaces/codex/.agents/plugins/marketplace.json'))).toBe(
      true,
    );
    const piManifest = JSON.parse(
      readFileSync(join(root, 'packages/pi/tools/package.json'), 'utf8'),
    );
    expect(piManifest.pi.extensions).toEqual(['./extensions/guard.ts']);
    expect(piManifest.pi.skills).toEqual(['./skills/tool']);
    const checked = cli('check', config, ['--json']);
    expect(checked.code, checked.stderr + checked.stdout).toBe(0);
    expect(checked.stderr).toBe('');
    const report = JSON.parse(checked.stdout);
    expect(report.schemaVersion).toBe(1);
    expect(report.repositoryId).toBe('tools');
    expect(report.status).toBe('ok');
    expect(report.publications.map((publication: { id: string }) => publication.id)).toEqual([
      'claude',
      'codex',
      'pi-tools',
    ]);
    expect(report.publications[2].report.publications[0].id).toBe('pi-tools');
    const source = await loadPackageDefinition(join(root, sourceAt(0)));
    const standalone = compilePackage(source, getTarget('pi'));
    const planned = await planRepository(config);
    expect(planned.publications[2]?.plan?.outputs.map(({ destination }) => destination)).toEqual(
      standalone.outputs.map(({ destination }) => destination),
    );
    assertNoStaging();
  });

  test('native marketplace outputs match legacy commands byte-for-byte', () => {
    const legacy = {
      schema: 'agentforge.marketplace/v1',
      id: definition.id,
      defaults: definition.defaults,
      packages: definition.packages,
      publications: definition.publications
        .filter((publication) => publication.kind === 'marketplace')
        .map(({ kind: _kind, out: _out, ...publication }) => publication),
    };
    put(root, 'MARKETPLACE.yaml', JSON.stringify(legacy));
    const result = Bun.spawnSync([
      process.execPath,
      PACKAGE_CLI,
      'marketplace',
      'compile',
      join(root, 'MARKETPLACE.yaml'),
      '--out',
      join(root, 'legacy'),
    ]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(cli('compile').code).toBe(0);
    expect(tree(join(root, 'marketplaces'))).toEqual(tree(join(root, 'legacy')));
  });

  test('explicit outputs and sources resolve relative to config regardless of cwd', () => {
    publicationAt(0).out = 'dist/native-claude';
    save();
    mkdirSync(join(root, 'nested'));
    expect(cli('compile', '../agentforge.yaml', [], join(root, 'nested')).code).toBe(0);
    expect(cli('check', config, ['--json'], tmpdir()).code).toBe(0);
    expect(existsSync(join(root, 'dist/native-claude/.claude-plugin/marketplace.json'))).toBe(true);
    expect(existsSync(join(root, 'nested/dist'))).toBe(false);
  });

  for (const mutate of [
    (d: Record<string, unknown>) => {
      d.unknown = true;
    },
    (d: Record<string, unknown>) => {
      d.schema = 'agentforge.repository/v2';
    },
    (d: Record<string, unknown>) => {
      d.packages = ['plugins/*/PACKAGE.yaml'];
    },
    (d: Record<string, unknown>) => {
      d.packages = [];
    },
    (d: Record<string, unknown>) => {
      d.publications = [];
    },
    (d: Record<string, unknown>) => {
      d.defaults = undefined;
    },
  ]) {
    test(`rejects invalid configuration ${mutate.toString()}`, () => {
      const malformed = JSON.parse(JSON.stringify(definition));
      mutate(malformed);
      put(root, 'agentforge.yaml', JSON.stringify(malformed));
      const before = tree(root);
      const checked = cli('check', config, ['--json']);
      expect(checked.code).toBe(1);
      expect(JSON.parse(checked.stdout).errors[0].code).toBe('invalid-definition');
      expect(tree(root)).toEqual(before);
      expect(cli('compile').code).toBe(1);
      expect(tree(root)).toEqual(before);
    });
  }
  test('duplicate publication ids and source paths are schema errors', () => {
    publicationAt(1).id = 'claude';
    expect(CanonicalRepository.safeParse(definition).success).toBe(false);
    publicationAt(1).id = 'codex';
    definition.packages.push(sourceAt(0));
    expect(CanonicalRepository.safeParse(definition).success).toBe(false);
  });
  test('check reports missing/invalid configs as one JSON document', () => {
    expect(
      JSON.parse(cli('check', join(root, 'missing/agentforge.yaml'), ['--json']).stdout).status,
    ).toBe('failed');
    expect(JSON.parse(cli('check', join(root, 'MARKETPLACE.yaml'), ['--json']).stdout).status).toBe(
      'failed',
    );
  });
});

describe('whole-repository ownership and preflight', () => {
  for (const out of [
    'packages/pi/tools',
    'packages/pi',
    'packages/pi/tools/inside',
    'PACKAGES/PI/TOOLS',
  ]) {
    test(`rejects overlapping snapshot roots: ${out}`, async () => {
      packageOnly();
      definition.publications.push({ ...publicationAt(0), id: 'second', out });
      save();
      const before = tree(root);
      const plan = await planRepository(config);
      expect(plan.issues.some((issue) => issue.code === 'output-collision')).toBe(true);
      expect(materializeRepository(plan).status).toBe('failed');
      expect(tree(root)).toEqual(before);
      expect(
        checkRepository(plan).publications.every((publication) => publication.status === 'failed'),
      ).toBe(true);
    });
  }
  for (const out of [
    'plugins',
    'plugins/tools',
    'plugins/tools/output',
    '.',
    '../escape',
    '/tmp/escape',
    'packages/../escape',
    'packages\\escape',
  ]) {
    test(`rejects source overlap or unsafe output path ${out} before writes`, () => {
      publicationAt(2).out = out;
      save();
      const before = tree(root);
      expect(cli('compile').code).toBe(1);
      expect(tree(root)).toEqual(before);
    });
  }
  test('an output cannot contain another entry source', () => {
    packageOnly();
    put(
      root,
      'packages/pi/other/PACKAGE.yaml',
      readFileSync(join(root, 'plugins/tools/PACKAGE.yaml'), 'utf8').replace(
        '"id":"tools"',
        '"id":"other"',
      ),
    );
    definition.packages.push('packages/pi/other/PACKAGE.yaml');
    publicationAt(0).out = 'packages/pi';
    save();
    const before = tree(root);
    expect(cli('compile').code).toBe(1);
    expect(tree(root)).toEqual(before);
  });
  test('later planning failure protects all earlier outputs and aggregates failures', () => {
    expect(cli('compile').code).toBe(0);
    const before = tree(root);
    definition.publications.push({
      kind: 'package',
      id: 'z-invalid',
      target: 'claude',
      package: 'tools',
      out: 'dist/invalid',
    });
    definition.publications.push({
      kind: 'package',
      id: 'z-missing',
      target: 'pi',
      package: 'missing',
      out: 'dist/missing',
    });
    save();
    const saved = tree(root);
    expect(cli('compile').code).toBe(1);
    expect(tree(root)).toEqual(saved);
    const checked = JSON.parse(cli('check', config, ['--json']).stdout);
    expect(checked.errors).toHaveLength(2);
    expect(checked.publications.filter((p: { status: string }) => p.status === 'ok')).toHaveLength(
      3,
    );
    expect(tree(join(root, 'marketplaces'))).toEqual(
      Object.fromEntries(
        Object.entries(before)
          .filter(([p]) => p.startsWith('marketplaces/'))
          .map(([p, v]) => [p.slice('marketplaces/'.length), v]),
      ),
    );
  });
  test('symlinked output ancestors, sources, and config are refused without following them', async () => {
    packageOnly();
    mkdirSync(join(root, 'external'));
    put(root, 'external/keep', 'untouched');
    symlinkSync(join(root, 'external'), join(root, 'alias'));
    publicationAt(0).out = 'alias/new';
    save();
    expect(cli('compile').code).toBe(1);
    expect(cli('check', config, ['--json']).code).toBe(1);
    expect(tree(join(root, 'external'))).toEqual({
      keep: { bytes: Buffer.from('untouched').toString('base64'), mode: 0o644 },
    });
    publicationAt(0).out = 'packages/pi/tools';
    symlinkSync(join(root, 'plugins/tools'), join(root, 'alias-source'));
    definition.packages = ['alias-source/PACKAGE.yaml'];
    save();
    expect((await planRepository(config)).issues.length).toBeGreaterThan(0);
    unlinkSync(config);
    put(root, 'real.yaml', JSON.stringify(definition));
    symlinkSync(join(root, 'real.yaml'), config);
    expect(cli('compile').code).toBe(1);
  });
  test('a config directory invoked through an ancestor alias has one real anchor', async () => {
    symlinkSync(root, join(root, 'self'));
    const plan = await planRepository(join(root, 'self/agentforge.yaml'));
    expect(plan.loaded.root).toBe(root);
    expect(plan.issues).toEqual([]);
  });
  test('Unicode-normalized output aliases collide', async () => {
    packageOnly();
    publicationAt(0).out = 'dist/caf\u00e9';
    definition.publications.push({
      ...publicationAt(0),
      id: 'second',
      out: 'dist/cafe\u0301',
    });
    save();
    expect(
      (await planRepository(config)).issues.some((issue) => issue.code === 'output-collision'),
    ).toBe(true);
  });
});

describe('snapshot publication, root manifests, checking, and orphans', () => {
  test('stale files are pruned only within owned roots; removed/renamed publications leave orphans', () => {
    expect(cli('compile').code).toBe(0);
    put(root, 'packages/pi/README.md', 'maintained');
    put(root, 'packages/pi/unrelated/keep', 'unrelated');
    put(root, 'packages/pi/tools/stale', 'stale');
    expect(cli('compile').code).toBe(0);
    expect(existsSync(join(root, 'packages/pi/tools/stale'))).toBe(false);
    expect(readFileSync(join(root, 'packages/pi/README.md'), 'utf8')).toBe('maintained');
    publicationAt(2).out = 'packages/pi/renamed';
    save();
    expect(cli('compile').code).toBe(0);
    const orphan = tree(join(root, 'packages/pi/tools'));
    definition.publications = definition.publications.filter((p) => p.kind !== 'package');
    save();
    expect(cli('compile').code).toBe(0);
    expect(cli('check').code).toBe(0);
    expect(tree(join(root, 'packages/pi/tools'))).toEqual(orphan);
    expect(readFileSync(join(root, 'packages/pi/unrelated/keep'), 'utf8')).toBe('unrelated');
  });
  test('a later publication-time failure keeps earlier successes and the failed snapshot', async () => {
    expect(cli('compile').code).toBe(0);
    put(root, 'marketplaces/claude/stale', 'remove on first successful replacement');
    put(root, 'packages/pi/tools/old', 'preserve on failure');
    const oldPi = tree(join(root, 'packages/pi/tools'));
    const plan = await planRepository(config);
    expect(plan.issues).toEqual([]);
    unlinkSync(join(root, 'plugins/tools/native/helper.js'));
    const report = materializeRepository(plan);
    expect(report.status).toBe('failed');
    expect(report.publications.map((p) => p.status)).toEqual(['published', 'published', 'failed']);
    expect(existsSync(join(root, 'marketplaces/claude/stale'))).toBe(false);
    expect(tree(join(root, 'packages/pi/tools'))).toEqual(oldPi);
    assertNoStaging();
  });
  test('root manifests point at the explicit output and check without managing siblings', () => {
    const publication = publicationAt(0);
    if (publication.kind !== 'marketplace') throw new Error('fixture');
    publication.out = 'dist/custom-name';
    publication['root-manifest'] = true;
    save();
    put(root, '.claude-plugin/keep', 'maintained');
    expect(cli('compile').code).toBe(0);
    const rootManifest = join(root, '.claude-plugin/marketplace.json');
    const manifest = JSON.parse(readFileSync(rootManifest, 'utf8'));
    expect(manifest.plugins[0].source).toBe('./dist/custom-name/plugins/tools');
    expect(cli('check').code).toBe(0);
    put(root, '.claude-plugin/marketplace.json', '{}');
    const before = tree(root);
    const report = JSON.parse(cli('check', config, ['--json']).stdout);
    expect(
      report.publications[0].report.issues.some(
        (issue: { path: string }) => issue.path === '<root>/.claude-plugin/marketplace.json',
      ),
    ).toBe(true);
    expect(tree(root)).toEqual(before);
    expect(readFileSync(join(root, '.claude-plugin/keep'), 'utf8')).toBe('maintained');
  });
  for (const destination of ['agentforge.yaml', 'AGENTFORGE.YAML']) {
    test(`root manifests cannot replace the repository config or its portable alias: ${destination}`, async () => {
      const publication = publicationAt(0);
      if (publication.kind !== 'marketplace') throw new Error('fixture');
      publication.destination = destination;
      publication['root-manifest'] = true;
      save();
      const before = tree(root);
      const plan = await planRepository(config);
      expect(
        plan.issues.some(
          (issue) => issue.code === 'unsafe-path' && issue.message.includes('agentforge.yaml'),
        ),
      ).toBe(true);
      expect(materializeRepository(plan).status).toBe('failed');
      expect(cli('compile').code).toBe(1);
      expect(tree(root)).toEqual(before);
      expect(existsSync(join(root, 'marketplaces'))).toBe(false);
    });
  }
  test('duplicate root manifests and roots containing a root manifest fail whole-config preflight', () => {
    for (const publication of definition.publications) {
      if (publication.kind === 'marketplace') {
        publication.target = 'claude';
        publication.destination = '.claude-plugin/marketplace.json';
        publication['root-manifest'] = true;
      }
    }
    save();
    expect(cli('compile').code).toBe(1);
    expect(existsSync(join(root, 'marketplaces'))).toBe(false);
    definition.publications = [publicationAt(0), publicationAt(2)];
    publicationAt(1).out = '.claude-plugin';
    save();
    expect(cli('compile').code).toBe(1);
    expect(existsSync(join(root, '.claude-plugin'))).toBe(false);
  });
  test('check aggregates drift including registry reference, modes, resources, and redactions and never writes', () => {
    definition.redactions = ['private-fixture-token'];
    save();
    expect(cli('compile').code).toBe(0);
    const registry = JSON.parse(
      readFileSync(join(root, 'marketplaces/claude/.claude-plugin/marketplace.json'), 'utf8'),
    );
    registry.plugins[0].source = './missing';
    put(root, 'marketplaces/claude/.claude-plugin/marketplace.json', JSON.stringify(registry));
    put(root, 'marketplaces/codex/plugins/tools/skills/tool/SKILL.md', 'private-fixture-token');
    unlinkSync(join(root, 'packages/pi/tools/extensions/guard.ts'));
    chmodSync(join(root, 'packages/pi/tools/extensions/helper.js'), 0o755);
    const before = tree(root);
    const result = cli('check', config, ['--json']);
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.publications.every((p: { status: string }) => p.status === 'failed')).toBe(true);
    const codes = report.publications.flatMap((p: { report: { issues: { code: string }[] } }) =>
      p.report.issues.map((i) => i.code),
    );
    expect(codes).toContain('broken-plugin-reference');
    expect(codes).toContain('unsafe-output-content');
    expect(codes).toContain('missing-native-resource');
    if (process.platform !== 'win32') expect(codes).toContain('changed-output-mode');
    expect(tree(root)).toEqual(before);
    assertNoStaging();
  });
  test('check does not create missing directories and planning errors stay separate from compiler warnings', () => {
    const before = tree(root);
    const result = cli('check', config, ['--json']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual([]);
    expect(tree(root)).toEqual(before);
    expect(existsSync(join(root, 'marketplaces'))).toBe(false);
  });
  test('nonfatal projection warnings are reported without failing a clean check', () => {
    packageOnly();
    put(
      root,
      'plugins/tools/skills/tool/SKILL.md',
      '---\nname: tool\ndescription: Fixture tool\nallowed-tools: Read\n---\nInspect things.\n',
    );
    expect(cli('compile').code).toBe(0);
    const result = cli('check', config, ['--json']);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('ok');
    expect(
      report.publications[0].report.diagnostics.some(
        (diagnostic: { severity: string }) => diagnostic.severity === 'warning',
      ),
    ).toBe(true);
  });
  test('compile/check never evaluate supplied code or invoke dependency managers', () => {
    const marker = join(root, 'executed');
    put(
      root,
      'plugins/tools/native/guard.ts',
      'require("node:fs").writeFileSync(process.env.AGENTFORGE_EXECUTION_MARKER, "executed");\n',
    );
    for (const manager of ['bun', 'npm', 'pnpm', 'yarn', 'npx']) {
      put(root, `fake-bin/${manager}`, `#!/bin/sh\nprintf executed > '${marker}'\nexit 99\n`);
      chmodSync(join(root, `fake-bin/${manager}`), 0o755);
    }
    const env = {
      AGENTFORGE_EXECUTION_MARKER: marker,
      PATH: `${join(root, 'fake-bin')}:${process.env.PATH}`,
    };
    expect(cli('compile', config, [], root, env).code).toBe(0);
    expect(cli('check', config, ['--json'], root, env).code).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });
});

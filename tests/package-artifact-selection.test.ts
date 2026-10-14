import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compileMarketplace, resolvePackageInput } from '../src/compiler.ts';
import {
  loadMarketplaceDefinition,
  loadPackageDefinition,
  loadStandalonePackageDefinition,
  parseMarketplaceDefinition,
  parsePackageDefinition,
} from '../src/definitions.ts';
import { compilePackage } from '../src/package-compiler.ts';
import { getTarget } from '../src/targets/index.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-selection-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(`${root}-out`, { recursive: true, force: true });
});

function put(path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
const skill = { type: 'skill', pattern: 'skills/*/SKILL.md' };
const hook = { type: 'hook', pattern: 'hooks/hooks.json' };
function definition() {
  return {
    schema: 'agentforge.package/v1',
    id: 'selected',
    defaults: { name: 'selected', version: '1.0.0' },
    artifacts: [hook],
    targets: { claude: {}, pi: { artifacts: [skill] } },
  };
}
function source(d: unknown = definition(), filename = 'PACKAGE.yaml') {
  put(filename, JSON.stringify(d));
  put(
    'skills/inspect/SKILL.md',
    '---\nname: inspect\ndescription: Inspect things\n---\nInspect things.\n',
  );
  put('hooks/hooks.json', '{"hooks":{}}');
  return join(root, filename);
}

test('Pi replaces shared hooks with skills; Claude inherits the defaults', async () => {
  const loaded = await loadPackageDefinition(source());
  expect([...loaded.artifacts.keys()]).toEqual(['hook']);
  expect([...resolvePackageInput(loaded, 'claude').artifacts.keys()]).toEqual(['hook']);
  expect([...resolvePackageInput(loaded, 'pi').artifacts.keys()]).toEqual(['skill']);
  const plan = compilePackage(loaded, getTarget('pi'));
  expect(plan.outputs.some((output) => output.destination === 'skills/inspect/SKILL.md')).toBe(
    true,
  );
  expect(JSON.stringify(plan)).not.toContain('hooks/hooks.json');
  unlinkSync(join(root, 'skills/inspect/SKILL.md'));
  expect(compilePackage(loaded, getTarget('pi'))).toEqual(plan);
});

test('absent override preserves unsupported Pi artifacts rather than granting hook capability', async () => {
  const d = definition();
  const { artifacts: _, ...target } = d.targets.pi;
  const loaded = await loadPackageDefinition(source({ ...d, targets: { pi: target } }));
  expect(resolvePackageInput(loaded, 'pi').artifacts).toBe(loaded.artifacts);
  expect(() => compilePackage(loaded, getTarget('pi'))).toThrow(/hook|unsupported/i);
});

test('empty defaults can be supplied entirely by a target-only artifact list', async () => {
  const loaded = await loadPackageDefinition(source({ ...definition(), artifacts: [] }));
  expect(loaded.artifacts.size).toBe(0);
  expect(compilePackage(loaded, getTarget('pi')).outputs.length).toBeGreaterThan(1);
});

test('overlapping patterns and repetition across selections emit each type/path once', async () => {
  const d = definition();
  const loaded = await loadPackageDefinition(
    source({
      ...d,
      artifacts: [skill, { type: 'skill', pattern: 'skills/inspect/SKILL.md' }],
      targets: { pi: { artifacts: [skill, { type: 'skill', pattern: '**/SKILL.md' }] } },
    }),
  );
  expect(loaded.artifacts.get('skill')).toHaveLength(1);
  expect(resolvePackageInput(loaded, 'pi').artifacts.get('skill')).toHaveLength(1);
  expect(
    compilePackage(loaded, getTarget('pi')).outputs.filter((o) =>
      o.destination.endsWith('SKILL.md'),
    ),
  ).toHaveLength(1);
});

test('duplicate target pattern declarations fail validation with target context', () => {
  expect(() =>
    parsePackageDefinition(
      JSON.stringify({
        ...definition(),
        targets: { pi: { artifacts: [skill, skill] } },
      }),
    ),
  ).toThrow(/targets.pi.artifacts.*duplicate artifact projection/);
});

test('explicit empty override requires shared or same-target producing payloads', async () => {
  const base = { ...definition(), targets: { pi: { artifacts: [] } } };
  expect(() => parsePackageDefinition(JSON.stringify(base))).toThrow(/empty artifacts override/);
  expect(() =>
    parsePackageDefinition(
      JSON.stringify({
        ...base,
        targets: { ...base.targets, claude: { payloads: { include: [{ source: 'native.ts' }] } } },
      }),
    ),
  ).toThrow(/empty artifacts override/);
  put('native.ts', 'export default function() {}');
  const loaded = await loadPackageDefinition(
    source({
      ...base,
      targets: {
        pi: {
          artifacts: [],
          payloads: { include: [{ source: 'native.ts' }] },
          native: { pi: { extensions: ['native.ts'] } },
        },
      },
    }),
  );
  expect(resolvePackageInput(loaded, 'pi').artifacts.size).toBe(0);
  expect(
    compilePackage(loaded, getTarget('pi')).outputs.some((o) => o.destination === 'native.ts'),
  ).toBe(true);
  await expect(
    loadPackageDefinition(source({ ...base, payloads: { include: [{ source: 'missing.ts' }] } })),
  ).rejects.toThrow(/matched no files/);
});

test('override-only patterns must match files', async () => {
  const path = source();
  unlinkSync(join(root, 'skills/inspect/SKILL.md'));
  await expect(loadPackageDefinition(path)).rejects.toThrow(/artifact pattern.*matched no files/);
});

test('omitted agents and artifacts do not leak into resource scanning or declared-name detection', async () => {
  const agent = { type: 'agent', pattern: 'references/helper.md' };
  source({
    ...definition(),
    artifacts: [agent],
    targets: {
      codex: {
        artifacts: [skill],
        native: { interface: { displayName: 'Selected', category: 'Productivity' } },
      },
    },
  });
  put(
    'references/helper.md',
    '---\nname: helper\ndescription: Helper\ntools: Read\n---\n$ARGUMENTS\n',
  );
  put(
    'skills/inspect/SKILL.md',
    '---\nname: inspect\ndescription: Inspect things\n---\nAsk @helper.\n',
  );
  put(
    'MARKETPLACE.yaml',
    JSON.stringify({
      schema: 'agentforge.marketplace/v1',
      id: 'selection',
      defaults: { name: 'Selection' },
      packages: ['package/PACKAGE.yaml'],
      publications: [
        {
          id: 'codex',
          target: 'codex',
          destination: 'codex/.agents/plugins/marketplace.json',
          native: { interface: { displayName: 'Selection' } },
          enrollment: { mode: 'all-compatible' },
        },
      ],
    }),
  );
  mkdirSync(join(root, 'package'));
  for (const entry of ['PACKAGE.yaml', 'skills', 'hooks', 'references']) {
    renameSync(join(root, entry), join(root, 'package', entry));
  }
  const loaded = await loadPackageDefinition(join(root, 'package', 'PACKAGE.yaml'));
  expect(loaded.resources).toEqual([]);
  const marketplace = await loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'));
  const plan = compileMarketplace(marketplace, [getTarget('codex')]);
  expect(JSON.stringify(plan.diagnostics)).not.toContain('body-agent-reference');
  expect(JSON.stringify(plan.diagnostics)).not.toContain('agent-tools-filter');
});

for (const filename of ['PACKAGE.yaml', 'PACKAGE.pi.yaml']) {
  test(`standalone compile/check commands select overrides in ${filename}`, async () => {
    const path = source(undefined, filename);
    const loaded = await loadStandalonePackageDefinition(path, 'pi');
    expect(compilePackage(loaded, getTarget('pi')).outputs.length).toBeGreaterThan(1);
    const out = `${root}-out`;
    for (const command of ['compile', 'check']) {
      const result = Bun.spawnSync(
        [
          process.execPath,
          'run',
          'src/cli.ts',
          'package',
          command,
          path,
          '--target',
          'pi',
          '--out',
          out,
        ],
        { cwd: join(import.meta.dir, '..') },
      );
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(0);
    }
  });
}

test('legacy loaded fixtures do not require selection facts', async () => {
  const loaded = await loadPackageDefinition(
    source({ ...definition(), artifacts: [skill], targets: { pi: {} } }),
  );
  delete loaded.targetArtifacts;
  delete loaded.targetResources;
  expect(resolvePackageInput(loaded, 'pi').artifacts).toBe(loaded.artifacts);
  expect(resolvePackageInput(loaded, 'pi').resources).toBe(loaded.resources);
});

for (const override of [false, true]) {
  test(`rejects escaped ${override ? 'override' : 'default'} artifacts before parsing source`, async () => {
    put('shared/SKILL.md', 'outside source with invalid canonical frontmatter');
    const escaped = { type: 'skill', pattern: '../../shared/SKILL.md' };
    put(
      'packages/tool/PACKAGE.yaml',
      JSON.stringify({
        ...definition(),
        artifacts: override ? [] : [escaped],
        targets: { pi: override ? { artifacts: [escaped] } : {} },
      }),
    );
    await expect(loadPackageDefinition(join(root, 'packages/tool/PACKAGE.yaml'))).rejects.toThrow(
      /escapes.*package root/,
    );
  });
  test(`rejects symlinked ${override ? 'override' : 'default'} artifacts without reading their targets`, async () => {
    put('outside/SKILL.md', 'outside source must never enter loaded inputs');
    mkdirSync(join(root, 'package'));
    symlinkSync(join(root, 'outside'), join(root, 'package', 'linked'));
    const linked = { type: 'skill', pattern: 'linked/SKILL.md' };
    put(
      'package/PACKAGE.yaml',
      JSON.stringify({
        ...definition(),
        artifacts: override ? [] : [linked],
        targets: { pi: override ? { artifacts: [linked] } : {} },
      }),
    );
    await expect(loadPackageDefinition(join(root, 'package/PACKAGE.yaml'))).rejects.toThrow(
      /symlink|symbolic|matched no files/,
    );
  });
}

test('scans omitted artifact resources that ship through explicit target payloads', async () => {
  const helper = 'references/helper.md';
  const path = source({
    ...definition(),
    artifacts: [{ type: 'agent', pattern: helper }],
    targets: {
      claude: {},
      codex: {
        artifacts: [skill],
        native: { interface: { displayName: 'Selected', category: 'Productivity' } },
        payloads: { include: [{ source: helper }] },
      },
    },
  });
  put(helper, '---\nname: helper\ndescription: Helper\n---\nUse $ARGUMENTS.\n');
  const loaded = await loadPackageDefinition(path);
  expect(loaded.resources).toEqual([]);
  expect(resolvePackageInput(loaded, 'codex').resources.map((resource) => resource.path)).toEqual([
    join(root, helper),
  ]);
  const market = parseMarketplaceDefinition(
    JSON.stringify({
      schema: 'agentforge.marketplace/v1',
      id: 'selection',
      defaults: { name: 'Selection' },
      packages: ['PACKAGE.yaml'],
      publications: [
        {
          id: 'codex',
          target: 'codex',
          destination: '.agents/plugins/marketplace.json',
          enrollment: { mode: 'all-compatible' },
        },
      ],
    }),
  );
  expect(() =>
    compileMarketplace(
      {
        path: join(root, 'MARKETPLACE.yaml'),
        definition: market,
        packages: new Map([['selected', loaded]]),
      },
      [getTarget('codex')],
    ),
  ).toThrow(/body-template-variable/);
});

for (const directory of ['references', 'scripts', 'assets']) {
  test(`scans a selected skill's shipped ${directory} even when another target declares it as an artifact`, async () => {
    const helper = `skills/inspect/${directory}/helper.md`;
    const d = {
      ...definition(),
      artifacts: [{ type: 'agent', pattern: helper }],
      targets: {
        claude: {},
        codex: {
          artifacts: [skill],
          native: { interface: { displayName: 'Selected', category: 'Productivity' } },
        },
      },
    };
    put('package/PACKAGE.yaml', JSON.stringify(d));
    put(
      'package/skills/inspect/SKILL.md',
      '---\nname: inspect\ndescription: Inspect things\n---\nInspect.\n',
    );
    put(`package/${helper}`, '---\nname: helper\ndescription: Helper\n---\nUse $ARGUMENTS.\n');
    let loaded = await loadPackageDefinition(join(root, 'package/PACKAGE.yaml'));
    expect(loaded.resources).toEqual([]);
    const resourcePath = join(root, 'package', helper);
    expect(resolvePackageInput(loaded, 'codex').resources.map((r) => r.path)).toEqual([
      resourcePath,
    ]);
    expect(resolvePackageInput(loaded, 'claude').resources).toEqual([]);
    const marketDefinition = parseMarketplaceDefinition(
      JSON.stringify({
        schema: 'agentforge.marketplace/v1',
        id: 'selection',
        defaults: { name: 'Selection' },
        packages: ['package/PACKAGE.yaml'],
        publications: [
          {
            id: 'codex',
            target: 'codex',
            destination: 'codex/.agents/plugins/marketplace.json',
            native: { interface: { displayName: 'Selection' } },
            enrollment: { mode: 'all-compatible' },
          },
        ],
      }),
    );
    const compile = () =>
      compileMarketplace(
        {
          path: join(root, 'MARKETPLACE.yaml'),
          definition: marketDefinition,
          packages: new Map([['selected', loaded]]),
        },
        [getTarget('codex')],
      );
    expect(compile).toThrow(/body-template-variable/);
    put(
      'package/PACKAGE.yaml',
      JSON.stringify({
        ...d,
        targets: {
          ...d.targets,
          codex: {
            ...d.targets.codex,
            losses: [{ construct: 'body-template-variable', state: 'retained-unenforced' }],
          },
        },
      }),
    );
    loaded = await loadPackageDefinition(join(root, 'package/PACKAGE.yaml'));
    unlinkSync(join(root, 'package/PACKAGE.yaml'));
    unlinkSync(resourcePath);
    const plan = compile();
    expect(plan.outputs.some((o) => o.kind === 'copy' && o.sourcePath === resourcePath)).toBe(true);
    expect(
      plan.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'declared-loss' &&
          diagnostic.locations?.some((location) => location.path === resourcePath),
      ),
    ).toBe(true);
  });
}

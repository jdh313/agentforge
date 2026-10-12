import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { checkCompilationSnapshot } from '../src/check.ts';
import { loadPackageDefinition } from '../src/definitions.ts';
import { compilePackage, materializePackage } from '../src/package-compiler.ts';
import { getTarget } from '../src/targets/index.ts';
import { copyPackage, editPackage, put, tree } from './pi-package-helpers.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-pi-package-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function planFixture(name = 'extension-only') {
  const source = copyPackage(root, name);
  const loaded = await loadPackageDefinition(source);
  return { source, loaded, plan: compilePackage(loaded, getTarget('pi')) };
}

describe('Pi package compilation library', () => {
  test('Pi has a package capability but no fabricated marketplace', () => {
    const adapter = getTarget('pi');
    expect(adapter.package).toBeDefined();
    expect(adapter.marketplace).toBeUndefined();
  });

  test('extension-only plans have authoritative open metadata and explicit resource arrays', async () => {
    const { loaded, plan } = await planFixture();
    const out = join(root, 'out');
    expect(JSON.stringify(compilePackage(loaded, getTarget('pi')))).toBe(JSON.stringify(plan));
    expect(existsSync(out)).toBe(false);
    materializePackage(plan, out);
    const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({
      name: 'tool-guard',
      version: '1.2.3',
      description: 'Byte-preserved native extension fixture',
      license: 'MIT',
      keywords: ['pi-package', 'fixture'],
      dependencies: { 'fixture-dependency': '1.0.0' },
      peerDependencies: { '@earendil-works/pi-coding-agent': '*' },
      scripts: { postinstall: 'node scripts/lifecycle.js' },
      'x-fixture': { preserved: true },
      pi: { skills: [], prompts: [], themes: [] },
    });
    expect(manifest.pi.extensions.map((path: string) => path.replace(/^\.\//, ''))).toEqual([
      'extensions/guard.ts',
    ]);
    expect(Object.keys(tree(out)).sort()).toEqual([
      'assets/settings.json',
      'extensions/guard.ts',
      'lib/helper.ts',
      'package.json',
      'scripts/lifecycle.js',
    ]);
    expect(plan.rootOutputs).toEqual([]);
    expect(plan.outputs.every((output) => !output.destination.startsWith('/'))).toBe(true);
    const first = tree(out);
    materializePackage(plan, out);
    expect(tree(out)).toEqual(first);
  });

  test('mixed packages reuse skill projection, target overrides, warnings and authoring keys', async () => {
    const { plan } = await planFixture('mixed');
    const out = join(root, 'out');
    materializePackage(plan, out);
    const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('mixed-tools-pi');
    expect(manifest.version).toBe('2.1.0');
    expect(
      manifest.pi.skills.map((path: string) => path.replace(/^\.\//, '').replace(/\/$/, '')),
    ).toEqual(['skills/inspect']);
    expect(manifest.pi.prompts).toEqual([]);
    expect(manifest.pi.themes).toEqual([]);
    const skill = matter(readFileSync(join(out, 'skills/inspect/SKILL.md'), 'utf8'));
    expect(skill.content.trim()).toBe('Inspect [the contract](references/contract.md).');
    expect(skill.data.upstream).toBeUndefined();
    expect(skill.data['mystery-key']).toBeUndefined();
    expect(skill.data['allowed-tools']).toBeUndefined();
    expect(skill.data.context).toBeUndefined();
    const diagnostics = JSON.stringify(plan.diagnostics);
    expect(diagnostics).toContain('unrecognized-frontmatter-key');
    expect(diagnostics).toContain('claude-only-frontmatter-stripped');
    expect(diagnostics).toContain('mystery-key');
    expect(diagnostics).toContain('allowed-tools');
    expect(diagnostics).not.toContain('upstream');
    expect(diagnostics).not.toContain('claude-only-body-feature');
    expect(readFileSync(join(out, 'skills/inspect/references/contract.md'), 'utf8')).toContain(
      'survive mixed package projection',
    );
  });

  for (const extension of ['ts', 'js']) {
    test(`supports directory entry points with index.${extension}`, async () => {
      const source = copyPackage(root);
      put(
        dirname(source),
        `native/extensions/directory/index.${extension}`,
        'export default function register() {}\n',
      );
      editPackage(source, (d) => {
        const target = d.targets.pi;
        if (target) target.native = { pi: { extensions: ['./extensions/directory'] } };
      });
      const plan = compilePackage(await loadPackageDefinition(source), getTarget('pi'));
      const out = join(root, 'out');
      materializePackage(plan, out);
      expect(existsSync(join(out, `extensions/directory/index.${extension}`))).toBe(true);
    });
  }
  test('refuses directory entry points lacking a verified index', async () => {
    const source = copyPackage(root);
    editPackage(source, (d) => {
      if (d.targets.pi) d.targets.pi.native = { pi: { extensions: ['./extensions'] } };
    });
    const loaded = await loadPackageDefinition(source);
    expect(() => compilePackage(loaded, getTarget('pi'))).toThrow(/index|entry/i);
  });

  test('a canonical artifact symlink is refused before following external source', async () => {
    const source = copyPackage(root, 'mixed');
    const artifact = join(dirname(source), 'skills/inspect/SKILL.md');
    put(root, 'external-SKILL.md', 'not valid canonical frontmatter; must not be read');
    unlinkSync(artifact);
    symlinkSync(join(root, 'external-SKILL.md'), artifact);
    await expect(loadPackageDefinition(source)).rejects.toThrow(
      /symlink|symbolic|matched no files/i,
    );
    expect(readFileSync(join(root, 'external-SKILL.md'), 'utf8')).toBe(
      'not valid canonical frontmatter; must not be read',
    );
    expect(existsSync(join(root, 'out'))).toBe(false);
  });

  test('undeclared symlink text resources are not loaded as canonical source', async () => {
    const source = copyPackage(root);
    put(root, 'external-reference.md', 'external source must not enter loaded resources');
    put(dirname(source), 'references/local.md', 'ordinary resource');
    symlinkSync(
      join(root, 'external-reference.md'),
      join(dirname(source), 'references/external.md'),
    );
    const loaded = await loadPackageDefinition(source);
    expect(loaded.resources.some((resource) => resource.path.endsWith('references/local.md'))).toBe(
      true,
    );
    expect(
      loaded.resources.some((resource) => resource.path.endsWith('references/external.md')),
    ).toBe(false);
    const plan = compilePackage(loaded, getTarget('pi'));
    expect(JSON.stringify(plan)).not.toContain('external source must not enter loaded resources');
  });

  test('compilation resolves loaded inputs rather than rereading canonical sources', async () => {
    const { source, loaded, plan } = await planFixture('mixed');
    unlinkSync(source);
    unlinkSync(join(dirname(source), 'skills/inspect/SKILL.md'));
    expect(JSON.stringify(compilePackage(loaded, getTarget('pi')))).toBe(JSON.stringify(plan));
  });

  test('manifest resource validation is plan-owned and shared by library checks', async () => {
    const { plan } = await planFixture();
    const manifestOutput = plan.outputs.find((output) => output.destination === 'package.json');
    if (
      !manifestOutput ||
      manifestOutput.kind !== 'generated' ||
      manifestOutput.nativeDocument?.role !== 'package-manifest'
    ) {
      throw new Error('missing generated package manifest handle');
    }
    const validate = manifestOutput.nativeDocument.validateResources;
    expect(validate).toBeDefined();
    const document = JSON.parse(manifestOutput.content);
    const files = new Set(plan.outputs.map((output) => output.destination));
    expect(validate?.(document, files)).toEqual([]);
    files.delete('extensions/guard.ts');
    expect(validate?.(document, files)?.length).toBeGreaterThan(0);
    const out = join(root, 'out');
    materializePackage(plan, out);
    expect(checkCompilationSnapshot(plan, out).issues).toEqual([]);
    unlinkSync(join(out, 'extensions/guard.ts'));
    const before = tree(out);
    const checked = checkCompilationSnapshot(plan, out);
    expect(checked.issues.some((issue) => issue.code === 'missing-native-resource')).toBe(true);
    expect(tree(out)).toEqual(before);
  });

  test('library callers cannot replace the source tree', async () => {
    const { source, plan } = await planFixture();
    const before = tree(dirname(source));
    expect(() => materializePackage(plan, dirname(source))).toThrow(/overlap|source/i);
    expect(tree(dirname(source))).toEqual(before);
  });

  test('failed payload staging leaves the previous snapshot intact and cleans staging', async () => {
    const { source, plan } = await planFixture();
    const out = join(root, 'out');
    materializePackage(plan, out);
    const before = tree(out);
    unlinkSync(join(dirname(source), 'native/lib/helper.ts'));
    expect(() => materializePackage(plan, out)).toThrow();
    expect(tree(out)).toEqual(before);
    expect(readdirSync(root).filter((name) => /staging|backup/.test(name))).toEqual([]);
  });
});

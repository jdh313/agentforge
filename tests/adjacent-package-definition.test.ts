import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileMarketplace } from '../src/compiler.ts';
import {
  loadMarketplaceDefinition,
  loadPackageDefinition,
  loadStandalonePackageDefinition,
  type MarketplaceDefinition,
} from '../src/definitions.ts';
import { claudeMarketplaceAdapter, codexMarketplaceAdapter } from '../src/marketplace-adapters.ts';
import { compilePackage, materializePackage } from '../src/package-compiler.ts';
import { getTarget } from '../src/targets/index.ts';
import { TARGET_NAMES } from '../src/types.ts';
import { editPackage, put, runPackageCli, tree } from './pi-package-helpers.ts';

let root: string;
let sourceRoot: string;
let canonical: string;
let alternate: string;
let marketplace: string;
let out: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentforge-adjacent-'));
  sourceRoot = join(root, 'source');
  cpSync(join(import.meta.dir, 'fixtures/adjacent-package'), sourceRoot, { recursive: true });
  canonical = join(sourceRoot, 'PACKAGE.yaml');
  alternate = join(sourceRoot, 'PACKAGE.pi.yaml');
  marketplace = join(root, 'MARKETPLACE.yaml');
  cpSync(join(sourceRoot, 'MARKETPLACE.yaml'), marketplace);
  rmSync(join(sourceRoot, 'MARKETPLACE.yaml'));
  setMarketplacePattern('PACKAGE.yaml');
  out = join(root, 'output');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function setMarketplacePattern(pattern: string) {
  const definition = Bun.YAML.parse(readFileSync(marketplace, 'utf8')) as MarketplaceDefinition;
  definition.packages = [`source/${pattern}`];
  put(root, 'MARKETPLACE.yaml', JSON.stringify(definition));
}

function compileCli() {
  const result = runPackageCli('compile', alternate, out);
  expect(result.exitCode, result.stderr + result.stdout).toBe(0);
}

describe('adjacent standalone package definition selection', () => {
  test('canonical loader remains strict while standalone loaders share canonical inputs', async () => {
    const strict = await loadPackageDefinition(canonical);
    for (const target of ['claude', 'codex'] as const) {
      const standalone = await loadStandalonePackageDefinition(canonical, target);
      expect(standalone).toEqual(strict);
    }
    await expect(loadPackageDefinition(alternate)).rejects.toThrow(
      /canonical filename PACKAGE.yaml/,
    );
    const pi = await loadStandalonePackageDefinition(alternate, 'pi');
    expect(pi.path).toBe(alternate);
    expect(pi.definition.id).toBe('adjacent-tools-pi');
    expect(Object.keys(pi.definition.targets)).toEqual(['pi']);
    expect(pi.artifacts.get('skill')?.map(({ path }) => path)).toEqual([
      join(sourceRoot, 'skills/inspect/SKILL.md'),
    ]);
    expect(pi.artifacts.has('hook')).toBe(false);
    expect(pi.payloads.pi?.map(({ destination }) => destination)).toEqual([
      'pi/destructive-vcs-guard.ts',
      'pi/policy/destructive-vcs-policy.ts',
    ]);
  });

  for (const target of TARGET_NAMES) {
    test(`accepts exact registered suffix ${target}`, async () => {
      const path = join(sourceRoot, `PACKAGE.${target}.yaml`);
      if (path !== alternate) cpSync(canonical, path);
      expect((await loadStandalonePackageDefinition(path, target)).path).toBe(path);
    });
    if (target !== 'pi') {
      test(`rejects suffix ${target} selected for pi before reading a definition`, async () => {
        const path = join(sourceRoot, `PACKAGE.${target}.yaml`);
        put(sourceRoot, `PACKAGE.${target}.yaml`, 'invalid yaml: [');
        await expect(loadStandalonePackageDefinition(path, 'pi')).rejects.toThrow(
          /filename target.*does not match standalone target/,
        );
        for (const operation of ['compile', 'check']) {
          const result = runPackageCli(operation, path, out);
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toMatch(/filename target.*does not match standalone target/);
          expect(existsSync(out)).toBe(false);
        }
      });
    }
  }

  test('rejects a Pi filename selected for another target before compilation', async () => {
    await expect(loadStandalonePackageDefinition(alternate, 'codex')).rejects.toThrow(
      /filename target "pi" does not match standalone target "codex"/,
    );
    for (const operation of ['compile', 'check']) {
      const result = runPackageCli(operation, alternate, out, { target: 'codex' });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(
        /filename target "pi" does not match standalone target "codex"/,
      );
      expect(existsSync(out)).toBe(false);
    }
  });

  for (const filename of [
    'plugin.yaml',
    'PACKAGE.unknown.yaml',
    'PACKAGE.PI.yaml',
    'package.pi.yaml',
    'PACKAGE.pi.YAML',
    'PACKAGE.pi.yml',
    'PACKAGE..yaml',
    'PACKAGE.pi.extra.yaml',
    'PACKAGE.yaml.bak',
  ]) {
    test(`rejects invalid standalone filename ${filename}`, async () => {
      const path = join(sourceRoot, filename);
      // A real file prevents ENOENT from masquerading as filename validation.
      put(sourceRoot, filename, readFileSync(alternate));
      await expect(loadStandalonePackageDefinition(path, 'pi')).rejects.toThrow(
        /expected standalone filename/,
      );
      for (const operation of ['compile', 'check']) {
        const result = runPackageCli(operation, path, out);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toMatch(/expected standalone filename/);
        expect(existsSync(out)).toBe(false);
      }
    });
  }
});

describe('adjacent Pi package compilation and checks', () => {
  test('plans are deterministic and provenance anchors the actual alternate definition', async () => {
    const loaded = await loadStandalonePackageDefinition(alternate, 'pi');
    const plan = compilePackage(loaded, getTarget('pi'));
    expect(JSON.stringify(compilePackage(loaded, getTarget('pi')))).toBe(JSON.stringify(plan));
    expect(plan.outputs.length).toBeGreaterThan(0);
    expect(plan.outputs.every(({ provenance }) => provenance.marketplacePath === alternate)).toBe(
      true,
    );
    expect(
      plan.diagnostics.every(({ provenance }) => provenance.marketplacePath === alternate),
    ).toBe(true);
    expect(plan.rootOutputs).toEqual([]);
    expect(existsSync(out)).toBe(false);
    materializePackage(plan, out);
    expect(runPackageCli('check', alternate, out).exitCode).toBe(0);
  });

  test('CLI compile/check generates skills and preserves helper layout and resource bytes', () => {
    const beforeSource = tree(sourceRoot);
    compileCli();
    const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('adjacent-tools-pi');
    expect(
      manifest.pi.skills.map((path: string) => path.replace(/^\.\//, '').replace(/\/$/, '')),
    ).toEqual(['skills/inspect']);
    expect(manifest.pi.extensions.map((path: string) => path.replace(/^\.\//, ''))).toEqual([
      'pi/destructive-vcs-guard.ts',
    ]);
    expect(manifest.pi.prompts).toEqual([]);
    expect(manifest.pi.themes).toEqual([]);
    expect(Object.keys(tree(out)).sort()).toEqual([
      'package.json',
      'pi/destructive-vcs-guard.ts',
      'pi/policy/destructive-vcs-policy.ts',
      'skills/inspect/SKILL.md',
      'skills/inspect/references/contract.md',
    ]);
    for (const [source, destination] of [
      ['pi/destructive-vcs-guard.ts', 'pi/destructive-vcs-guard.ts'],
      ['pi/policy/destructive-vcs-policy.ts', 'pi/policy/destructive-vcs-policy.ts'],
      ['skills/inspect/references/contract.md', 'skills/inspect/references/contract.md'],
    ]) {
      expect(readFileSync(join(out, destination))).toEqual(readFileSync(join(sourceRoot, source)));
    }
    expect(readFileSync(join(out, 'skills/inspect/SKILL.md'), 'utf8')).toContain(
      '[the contract](references/contract.md)',
    );
    const first = tree(out);
    compileCli();
    expect(tree(out)).toEqual(first);
    const checked = runPackageCli('check', alternate, out, { extra: ['--json'] });
    expect(checked.exitCode, checked.stdout + checked.stderr).toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({
      marketplaceId: 'adjacent-tools-pi',
      status: 'ok',
      issues: [],
    });
    expect(tree(out)).toEqual(first);
    expect(tree(sourceRoot)).toEqual(beforeSource);
  });

  test('check reports helper drift and writes nothing', () => {
    compileCli();
    put(out, 'pi/policy/destructive-vcs-policy.ts', 'changed helper bytes\n');
    const before = tree(out);
    const result = runPackageCli('check', alternate, out, { extra: ['--json'] });
    expect(result.exitCode).not.toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'changed-output',
          path: 'pi/policy/destructive-vcs-policy.ts',
          packageId: 'adjacent-tools-pi',
          publicationId: 'adjacent-tools-pi',
        }),
      ]),
    );
    expect(tree(out)).toEqual(before);
  });

  for (const output of ['equal', 'child', 'ancestor'] as const) {
    test(`refuses ${output} source/output overlap without changing either definition`, () => {
      const before = tree(sourceRoot);
      const destination =
        output === 'equal' ? sourceRoot : output === 'child' ? join(sourceRoot, 'dist') : root;
      const result = runPackageCli('compile', alternate, destination);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/overlap/);
      expect(tree(sourceRoot)).toEqual(before);
    });
  }

  for (const field of ['source', 'destination'] as const) {
    test(`refuses payload ${field} traversal without replacing previous output`, () => {
      compileCli();
      const before = tree(out);
      put(root, 'external.ts', 'outside package\n');
      editPackage(alternate, (definition) => {
        definition.targets.pi?.payloads?.include.push({
          source: field === 'source' ? '../external.ts' : 'pi/policy/destructive-vcs-policy.ts',
          destination: field === 'destination' ? '../escape.ts' : 'external.ts',
        });
      });
      const result = runPackageCli('compile', alternate, out);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/path|traversal|escape|relative|outside/i);
      expect(tree(out)).toEqual(before);
      expect(existsSync(join(root, 'escape.ts'))).toBe(false);
      expect(readFileSync(join(root, 'external.ts'), 'utf8')).toBe('outside package\n');
    });
  }
});

describe('marketplace definitions stay canonical-only', () => {
  for (const pattern of ['PACKAGE.pi.yaml', 'PACKAGE.*.yaml', 'PACKAGE*.yaml']) {
    test(`marketplace rejects alternate matches from ${pattern}`, async () => {
      setMarketplacePattern(pattern);
      await expect(loadMarketplaceDefinition(marketplace)).rejects.toThrow(
        /canonical filename PACKAGE.yaml/,
      );
    });
  }

  for (const pattern of ['PACKAGE.yaml', '**/PACKAGE.yaml']) {
    test(`canonical marketplace pattern ${pattern} ignores the adjacent definition`, async () => {
      setMarketplacePattern(pattern);
      const loaded = await loadMarketplaceDefinition(marketplace);
      expect([...loaded.packages.keys()]).toEqual(['adjacent-tools']);
      expect(loaded.packages.get('adjacent-tools')?.path).toBe(canonical);
    });
  }

  test('original Claude/Codex skill and hook plans are unchanged by adjacent Pi sources', async () => {
    const adapters = [claudeMarketplaceAdapter, codexMarketplaceAdapter];
    async function plans() {
      const loaded = await loadMarketplaceDefinition(marketplace);
      // These runtime projections share package-relative destinations; plan each
      // publication separately rather than merge incompatible hook bytes.
      return loaded.definition.publications.map((publication) =>
        compileMarketplace(
          { ...loaded, definition: { ...loaded.definition, publications: [publication] } },
          adapters,
        ),
      );
    }
    const before = await plans();
    for (const plan of before) {
      expect(
        plan.outputs.some(({ destination }) => destination === 'source/skills/inspect/SKILL.md'),
      ).toBe(true);
      expect(
        plan.outputs.some(({ destination }) => destination === 'source/hooks/hooks.json'),
      ).toBe(true);
      expect(plan.outputs.some(({ destination }) => destination === 'source/hooks/guard.sh')).toBe(
        true,
      );
      expect(
        plan.outputs.some(({ destination }) =>
          /pi\/destructive|pi\/policy|PACKAGE\.pi/.test(destination),
        ),
      ).toBe(false);
    }
    rmSync(alternate);
    rmSync(join(sourceRoot, 'pi'), { recursive: true });
    expect(JSON.stringify(await plans())).toBe(JSON.stringify(before));
  });
});

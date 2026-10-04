import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { claudeMarketplaceAdapter, codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import {
  CompilationError,
  compileMarketplace,
  type DesiredGeneratedOutput,
} from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// A Claude Code mod: a plugin whose hooks/hooks.json lists function-hook
// modules, plus a `types` declaration naming its session-state contract. One
// package enrolled for both targets must ship the mod on Claude and nothing of
// it on Codex, where `modules` is the declared `hook-module` loss.

const MARKETPLACE = `schema: agentforge.marketplace/v1
id: claude-mod
defaults:
  name: claude-mod
  description: Fixture marketplace for Claude mod coverage.
  owner: {name: Fixture}
packages:
  - packages/*/PACKAGE.yaml
publications:
  - id: claude
    target: claude
    destination: .claude-plugin/marketplace.json
    enrollment: {mode: all-compatible}
  - id: codex
    target: codex
    destination: .agents/plugins/marketplace.json
    enrollment: {mode: all-compatible}
`;

interface PackageOptions {
  hooks?: unknown;
  types?: string;
  losses?: string;
}

const MODULES_ONLY = { modules: ['./register.ts'] };
const STRIPPED = '[{construct: hook-module, state: stripped}]';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function writeFixture({
  hooks = MODULES_ONLY,
  types = './types/index.d.ts',
  losses,
}: PackageOptions = {}): string {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), 'agentforge-claude-mod-'));
  const files: Record<string, string> = {
    'MARKETPLACE.yaml': MARKETPLACE,
    'packages/mod/PACKAGE.yaml': `schema: agentforge.package/v1
id: mod
defaults: {name: mod, version: 0.1.0, description: A mod.}
artifacts:
  - {type: skill, pattern: 'skills/*/SKILL.md'}
  - {type: hook, pattern: hooks/hooks.json}
targets:
  claude:
    native: {types: ${JSON.stringify(types)}}
    payloads:
      include:
        - {source: hooks/register.ts}
        - {source: types/index.d.ts}
  codex:
    native: {interface: {displayName: Mod, category: Productivity}}${losses === undefined ? '' : `\n    losses: ${losses}`}
`,
    'packages/mod/skills/note/SKILL.md': '---\nname: note\ndescription: Take a note.\n---\nNote.\n',
    'packages/mod/hooks/hooks.json': `${JSON.stringify(hooks, null, 2)}\n`,
    'packages/mod/hooks/register.ts': 'export default function register() {}\n',
    'packages/mod/types/index.d.ts': 'export type Ticket = { id: string };\n',
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return join(root, 'MARKETPLACE.yaml');
}

// One plan per publication, as the CLI compiles them: each lands under its own
// output prefix, so the two targets' package trees never share a destination.
async function compile(options?: PackageOptions) {
  const loaded = await loadMarketplaceDefinition(writeFixture(options));
  const plans = loaded.definition.publications.map((publication) =>
    compileMarketplace(
      { ...loaded, definition: { ...loaded.definition, publications: [publication] } },
      [claudeMarketplaceAdapter, codexMarketplaceAdapter],
    ),
  );
  return {
    outputs: plans.flatMap(({ outputs }) => outputs),
    diagnostics: plans.flatMap(({ diagnostics }) => diagnostics),
  };
}

async function compileError(options?: PackageOptions): Promise<string> {
  try {
    await compile(options);
  } catch (error) {
    expect(error).toBeInstanceOf(CompilationError);
    return (error as Error).message;
  }
  throw new Error('compilation succeeded');
}

function destinations(plan: Awaited<ReturnType<typeof compile>>, target: string): string[] {
  return plan.outputs
    .filter((output) => output.target === target)
    .map(({ destination }) => destination);
}

function generated(
  plan: Awaited<ReturnType<typeof compile>>,
  target: string,
  suffix: string,
): DesiredGeneratedOutput | undefined {
  return plan.outputs.find(
    (output): output is DesiredGeneratedOutput =>
      output.kind === 'generated' &&
      output.target === target &&
      output.destination.endsWith(suffix),
  );
}

describe('Claude mod packages', () => {
  test('ship the modules hook, its module, and its types on Claude, and none of them on Codex', async () => {
    const plan = await compile({ losses: STRIPPED });

    const claude = destinations(plan, 'claude');
    expect(claude).toEqual(
      expect.arrayContaining([
        'packages/mod/hooks/hooks.json',
        'packages/mod/hooks/register.ts',
        'packages/mod/types/index.d.ts',
      ]),
    );
    const manifest = JSON.parse(
      generated(plan, 'claude', 'mod/.claude-plugin/plugin.json')?.content ?? '{}',
    );
    expect(manifest.types).toBe('./types/index.d.ts');

    const codex = destinations(plan, 'codex').filter((path) => path.startsWith('packages/mod/'));
    expect(codex.some((path) => path.includes('/hooks/') || path.includes('/types/'))).toBe(false);
    const codexManifest = JSON.parse(
      generated(plan, 'codex', 'mod/.codex-plugin/plugin.json')?.content ?? '{}',
    );
    expect(codexManifest.hooks).toBeUndefined();
    expect(codexManifest.types).toBeUndefined();

    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'declared-loss',
          message: expect.stringContaining('"hook-module" is stripped for target "codex"'),
        }),
      ]),
    );
  });

  test('refuse a Codex-enrolled modules hook with no declared loss, naming the construct and site', async () => {
    const message = await compileError();
    expect(message).toContain('hook-module: hooks/hooks.json:2');
    expect(message).toContain('targets.codex.losses');
  });

  test('refuse a hook-module loss declared retained-unenforced, since Codex output carries none of it', async () => {
    const message = await compileError({
      losses: '[{construct: hook-module, state: retained-unenforced}]',
    });
    expect(message).toContain('emitted it as "stripped"');
  });

  test('project the classic events of a mixed document to Codex and strip only its modules', async () => {
    const plan = await compile({
      losses: STRIPPED,
      hooks: {
        modules: ['./register.ts'],
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
      },
    });

    const translated = JSON.parse(
      generated(plan, 'codex', 'mod/hooks/hooks.json')?.content ?? '{}',
    );
    expect(translated.hooks.SessionStart).toBeDefined();
    expect(translated.modules).toBeUndefined();
  });

  test('refuse a types path that names no shipped file', async () => {
    const message = await compileError({ losses: STRIPPED, types: './types/missing.d.ts' });
    expect(message).toContain('types: "./types/missing.d.ts" names no file the package ships');
  });

  test('refuse a types path that is not "./"-relative inside the plugin', async () => {
    for (const types of ['types/index.d.ts', './../outside.d.ts', '/abs/index.d.ts']) {
      const message = await compileError({ losses: STRIPPED, types });
      expect(message).toContain('must be a "./"-relative path inside the plugin');
    }
  });
});

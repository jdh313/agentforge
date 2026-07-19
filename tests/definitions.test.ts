import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import {
  loadMarketplaceDefinition,
  loadPackageDefinition,
  parseMarketplaceDefinition,
  parsePackageDefinition,
} from '../src/definitions.ts';

const DEFINITIONS = join(import.meta.dir, 'fixtures', 'definitions');
const MARKETPLACE_FIXTURE = join(DEFINITIONS, 'cc-marketplace');

let temporaryRoot: string;

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'agentforge-definitions-'));
});

afterAll(() => {
  if (temporaryRoot && existsSync(temporaryRoot)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

describe('package definitions', () => {
  test('accepts ordered shared and target-specific payload declarations', () => {
    const definition = parsePackageDefinition(`
schema: agentforge.package/v1
id: example
defaults:
  name: example
  version: 1.0.0
artifacts:
  - type: skill
    pattern: skills/*/SKILL.md
payloads:
  include:
    - source: README.md
    - source: templates/
      destination: resources/templates/
      exclude: [templates/private/**]
  exclude: ['**/*.test.md']
targets:
  claude:
    payloads:
      include:
        - source: hooks/*.json
          destination: hooks/
  codex: {}
`);

    expect(definition.payloads).toEqual({
      include: [
        { source: 'README.md' },
        {
          source: 'templates/',
          destination: 'resources/templates/',
          exclude: ['templates/private/**'],
        },
      ],
      exclude: ['**/*.test.md'],
    });
    expect(definition.targets.claude?.payloads).toEqual({
      include: [{ source: 'hooks/*.json', destination: 'hooks/' }],
    });
  });

  test('loads a representative Librarian package and resolves projection patterns', async () => {
    const loaded = await loadPackageDefinition(
      join(MARKETPLACE_FIXTURE, 'packages', 'librarian', 'PACKAGE.yaml'),
    );

    expect(loaded.definition.id).toBe('librarian');
    expect(loaded.definition.defaults).toEqual({
      name: 'librarian',
      version: '0.17.1',
      description: 'Curates, catalogs, retrieves, and maintains an Obsidian knowledge base.',
      author: { name: 'Jacob Hoehler' },
      license: 'Apache-2.0',
      keywords: ['obsidian', 'knowledge-base', 'notes', 'curation'],
    });
    expect(Object.keys(loaded.definition.targets)).toEqual(['claude', 'codex']);
    expect(loaded.definition.targets.codex?.overrides?.description).toContain('shared workflows');
    expect(loaded.definition.targets.codex?.native).toMatchObject({
      interface: { displayName: 'Librarian' },
    });
    expect(loaded.artifacts.get('skill')).toHaveLength(1);
    expect(loaded.artifacts.get('agent')).toHaveLength(1);
  });

  test('normalizes payload declarations into deterministic target plans', async () => {
    const packagePath = packageWithPayload(
      'payload-plan',
      `  include:
    - source: skills/draft/
      destination: bundle/draft/
      exclude: ['**/assets/**']
  exclude: ['**/*.ts']`,
      `  claude:
    payloads:
      include:
        - source: hooks/*.json
          destination: hooks/
  codex: {}`,
    );

    const loaded = await loadPackageDefinition(packagePath);

    expect(
      loaded.payloads.claude?.map(({ destination, sourcePath }) => ({
        destination,
        source: relative(dirname(packagePath), sourcePath),
      })),
    ).toEqual([
      { source: 'skills/draft/SKILL.md', destination: 'bundle/draft/SKILL.md' },
      {
        source: 'skills/draft/references/contract.md',
        destination: 'bundle/draft/references/contract.md',
      },
      { source: 'hooks/hooks.json', destination: 'hooks/hooks.json' },
    ]);
    expect(loaded.payloads.codex).toEqual([
      expect.objectContaining({ destination: 'bundle/draft/SKILL.md' }),
      expect.objectContaining({ destination: 'bundle/draft/references/contract.md' }),
    ]);
  });

  test('records portable executable intent for declared payloads', async () => {
    const packagePath = packageWithPayload(
      'executable-payload',
      `  include:
    - source: skills/draft/scripts/check.ts`,
    );
    chmodSync(join(dirname(packagePath), 'skills', 'draft', 'scripts', 'check.ts'), 0o751);

    const loaded = await loadPackageDefinition(packagePath);

    expect(loaded.payloads.claude).toEqual([
      expect.objectContaining({ destination: 'skills/draft/scripts/check.ts', executable: true }),
    ]);
  });

  test('rejects declared payloads reached through symlinks', async () => {
    const packagePath = packageWithPayload(
      'symlinked-payload',
      `  include:
    - source: linked-license.txt`,
    );
    symlinkSync('LICENSE.txt', join(dirname(packagePath), 'linked-license.txt'));

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload source "linked-license.txt" must not be a symbolic link or traverse one',
    );
  });

  test('rejects ambiguous destinations for directory and glob payloads', async () => {
    const packagePath = packageWithPayload(
      'ambiguous-payload-destination',
      `  include:
    - source: hooks/*.json
      destination: hook.json`,
    );

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload destination "hook.json" must end with "/" when the source is a directory or glob',
    );
  });

  test('rejects non-portable payload destinations', async () => {
    const packagePath = packageWithPayload(
      'non-portable-payload-destination',
      `  include:
    - source: hooks/hooks.json
      destination: portable/file.`,
    );

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload destination "portable/file." has a segment ending with a dot or space',
    );
  });

  test('rejects payload sources that escape the package root', async () => {
    const packagePath = packageWithPayload(
      'escaping-payload-source',
      `  include:
    - source: ../secret.json`,
    );

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload source "../secret.json" must not escape the package root',
    );
  });

  test('rejects payload destinations that escape the package root', async () => {
    const packagePath = packageWithPayload(
      'escaping-payload-destination',
      `  include:
    - source: hooks/hooks.json
      destination: ../outside.json`,
    );

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload destination "../outside.json" must not escape the package root',
    );
  });

  test('rejects payload declarations that match no files', async () => {
    const packagePath = packageWithPayload(
      'missing-payload-source',
      `  include:
    - source: missing/**`,
    );

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload source "missing/**" matched no files',
    );
  });

  test('rejects colliding normalized payload destinations', async () => {
    const packagePath = packageWithPayload(
      'colliding-payload-destinations',
      `  include:
    - source: hooks/hooks.json
      destination: shared.json
    - source: commands/spec-flow.md
      destination: shared.json`,
    );

    await expect(loadPackageDefinition(packagePath)).rejects.toThrow(
      'payload destination "shared.json" collide for target "claude"',
    );
  });

  test('rejects artifact patterns that match no files', async () => {
    await expect(
      loadPackageDefinition(join(DEFINITIONS, 'invalid', 'missing-artifacts', 'PACKAGE.yaml')),
    ).rejects.toThrow('matched no files');
  });

  test('rejects malformed native overlays', () => {
    const path = join(DEFINITIONS, 'invalid', 'malformed-native', 'PACKAGE.yaml');
    expect(() => parsePackageDefinition(readFileSync(path, 'utf8'), path)).toThrow(
      'targets.codex.native',
    );
  });
});

describe('marketplace definitions', () => {
  test('loads cc-marketplace-shaped publications and their explicit package universe', async () => {
    const loaded = await loadMarketplaceDefinition(join(MARKETPLACE_FIXTURE, 'MARKETPLACE.yaml'));

    expect([...loaded.packages.keys()].toSorted()).toEqual([
      'coach',
      'commit',
      'craft',
      'librarian',
      'linear',
      'spec-flow',
    ]);
    expect(loaded.definition.publications).toMatchObject([
      {
        id: 'claude',
        target: 'claude',
        enrollment: {
          mode: 'include',
          packages: ['commit', 'craft', 'linear', 'librarian', 'spec-flow'],
        },
      },
      {
        id: 'codex',
        target: 'codex',
        enrollment: {
          mode: 'include',
          packages: ['commit', 'craft', 'linear', 'librarian', 'spec-flow'],
        },
      },
    ]);
  });

  test('rejects duplicate publication ids', () => {
    const source = readFileSync(join(MARKETPLACE_FIXTURE, 'MARKETPLACE.yaml'), 'utf8').replace(
      '  - id: codex',
      '  - id: claude',
    );
    expect(() => parseMarketplaceDefinition(source)).toThrow('duplicate publication id "claude"');
  });

  test('rejects colliding package ids', async () => {
    const root = copyMarketplace('collision');
    const packagePath = join(root, 'packages', 'craft', 'PACKAGE.yaml');
    writeFileSync(
      packagePath,
      readFileSync(packagePath, 'utf8').replace('id: craft', 'id: commit'),
    );

    await expect(loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'))).rejects.toThrow(
      'package id "commit" collides',
    );
  });

  test('rejects package patterns that match no definitions', async () => {
    const root = copyMarketplace('missing-packages');
    replaceMarketplace(root, 'packages/*/PACKAGE.yaml', 'elsewhere/*/PACKAGE.yaml');

    await expect(loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'))).rejects.toThrow(
      'package pattern "elsewhere/*/PACKAGE.yaml" matched no files',
    );
  });

  test('rejects unknown explicit enrollment references', async () => {
    const root = copyMarketplace('unknown-enrollment');
    replaceMarketplace(
      root,
      'packages: [commit, craft, linear, librarian, spec-flow]',
      'packages: [missing]',
    );

    await expect(loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'))).rejects.toThrow(
      'includes unknown package "missing"',
    );
  });

  test('rejects explicit enrollment in a target the package does not declare', async () => {
    const root = copyMarketplace('incompatible-enrollment');
    replaceMarketplace(
      root,
      'id: codex\n    target: codex\n    destination: .agents/plugins/marketplace.json\n    enrollment:\n      mode: include\n      packages: [commit, craft, linear, librarian, spec-flow]',
      'id: codex\n    target: codex\n    destination: .agents/plugins/marketplace.json\n    enrollment:\n      mode: include\n      packages: [coach]',
    );

    await expect(loadMarketplaceDefinition(join(root, 'MARKETPLACE.yaml'))).rejects.toThrow(
      'does not declare target "codex"',
    );
  });
});

function copyMarketplace(name: string): string {
  const destination = join(temporaryRoot, name);
  cpSync(MARKETPLACE_FIXTURE, destination, { recursive: true });
  return destination;
}

function replaceMarketplace(root: string, before: string, after: string): void {
  const path = join(root, 'MARKETPLACE.yaml');
  writeFileSync(path, readFileSync(path, 'utf8').replace(before, after));
}

function packageWithPayload(
  name: string,
  payload: string,
  targets = '  claude: {}\n  codex: {}',
): string {
  const root = copyMarketplace(name);
  const packagePath = join(root, 'packages', 'spec-flow', 'PACKAGE.yaml');
  writeFileSync(
    packagePath,
    `schema: agentforge.package/v1
id: spec-flow
defaults:
  name: spec-flow
  version: 0.12.2
artifacts:
  - type: skill
    pattern: skills/*/SKILL.md
payloads:
${payload}
targets:
${targets}
`,
  );
  return packagePath;
}

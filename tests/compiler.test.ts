import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  CompilationError,
  compileMarketplace,
  type PublicationCompilation,
  type TargetCompilationResult,
  type TargetCompilerAdapter,
} from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

const MARKETPLACE_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'cc-marketplace',
  'MARKETPLACE.yaml',
);

describe('marketplace compiler interface', () => {
  test('passes deterministic enrollment and resolved metadata to target adapters', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const compilations: PublicationCompilation[] = [];
    const adapter = (target: TargetCompilerAdapter['target']): TargetCompilerAdapter => ({
      target,
      compilePublication(input) {
        compilations.push(input);
        return {
          outputs: [
            {
              kind: 'generated',
              destination: input.publication.destination,
              content: `${input.publication.id}\n`,
            },
          ],
        };
      },
    });

    const plan = compileMarketplace(
      {
        ...loaded,
        definition: {
          ...loaded.definition,
          publications: loaded.definition.publications.toReversed(),
        },
      },
      [adapter('codex'), adapter('claude')],
    );

    expect(compilations.map(({ publication }) => publication.id)).toEqual(['claude', 'codex']);
    expect(compilations[0]?.packages.map(({ id }) => id)).toEqual([
      'commit',
      'craft',
      'librarian',
      'linear',
      'spec-flow',
    ]);
    expect(compilations[1]?.packages.map(({ id }) => id)).toEqual([
      'commit',
      'craft',
      'librarian',
      'linear',
      'spec-flow',
    ]);
    expect(compilations[1]?.packages.find(({ id }) => id === 'librarian')).toMatchObject({
      metadata: {
        name: 'librarian',
        version: '0.17.1',
        description: 'Curates and retrieves notes through shared workflows and isolated roles.',
      },
      native: {
        interface: {
          displayName: 'Librarian',
          category: 'Productivity',
        },
      },
    });
    expect(compilations[1]?.publication.native).toEqual({
      interface: { displayName: 'CC Marketplace' },
    });
    expect(compilations[0]?.packages.find(({ id }) => id === 'librarian')).toMatchObject({
      metadata: {
        description: 'Curates, catalogs, retrieves, and maintains an Obsidian knowledge base.',
      },
      native: {
        description: 'Full Claude-native Librarian package metadata',
      },
    });
    expect(compilations[0]?.packages.find(({ id }) => id === 'spec-flow')?.payloads).toEqual([
      expect.objectContaining({ destination: 'LICENSE.txt' }),
      expect.objectContaining({ destination: 'native-hooks.json' }),
    ]);
    expect(compilations[1]?.packages.find(({ id }) => id === 'spec-flow')?.payloads).toEqual([
      expect.objectContaining({ destination: 'LICENSE.txt' }),
      expect.objectContaining({ destination: 'config/defaults.json' }),
    ]);
    expect(plan).toMatchObject({
      marketplaceId: 'cc-marketplace',
      outputs: [
        {
          kind: 'generated',
          target: 'claude',
          provenance: { publicationId: 'claude' },
        },
        {
          kind: 'generated',
          target: 'codex',
          provenance: { publicationId: 'codex' },
        },
      ],
      diagnostics: [],
    });
  });

  test('orders adapter results and preserves nonfatal unresolved projections', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const plan = compileMarketplace(
      loaded,
      adaptersWithClaude(() => ({
        outputs: [
          {
            kind: 'copy',
            packageId: 'spec-flow',
            destination: 'packages/spec-flow/SKILL.md',
            sourcePath: '/source/spec-flow/SKILL.md',
          },
          {
            kind: 'generated',
            packageId: 'commit',
            destination: 'packages/commit/z.json',
            content: '{}\n',
          },
          {
            kind: 'generated',
            packageId: 'commit',
            destination: 'packages/commit/a.json',
            content: '{}\n',
          },
        ],
        diagnostics: [
          {
            code: 'z-last',
            severity: 'warning',
            packageId: 'spec-flow',
            message: 'Later diagnostic',
          },
          {
            code: 'unresolved-projection',
            severity: 'note',
            packageId: 'librarian',
            message: 'No Claude projection exists for agent artifacts; source retained.',
            retainedSource: {
              artifactType: 'agent',
              sourcePath: '/source/librarian/agents/vault-reader.md',
            },
          },
        ],
      })),
    );

    expect(
      plan.outputs.map(
        ({ destination, provenance }) =>
          `${provenance.publicationId}:${provenance.packageId}:${destination}`,
      ),
    ).toEqual([
      'claude:commit:packages/commit/a.json',
      'claude:commit:packages/commit/z.json',
      'claude:spec-flow:packages/spec-flow/SKILL.md',
    ]);
    expect(plan.diagnostics).toEqual([
      {
        code: 'unresolved-projection',
        severity: 'note',
        message: 'No Claude projection exists for agent artifacts; source retained.',
        retainedSource: {
          artifactType: 'agent',
          sourcePath: '/source/librarian/agents/vault-reader.md',
        },
        target: 'claude',
        provenance: {
          marketplacePath: loaded.path,
          publicationId: 'claude',
          packageId: 'librarian',
        },
      },
      {
        code: 'z-last',
        severity: 'warning',
        message: 'Later diagnostic',
        target: 'claude',
        provenance: {
          marketplacePath: loaded.path,
          publicationId: 'claude',
          packageId: 'spec-flow',
        },
      },
    ]);
  });

  test.each([
    ['', 'destination must not be empty'],
    ['../escape.json', 'parent-directory segments are not allowed'],
    ['nested/../../escape.json', 'parent-directory segments are not allowed'],
    ['/absolute.json', 'destination must be relative'],
    ['C:/absolute.json', 'destination must be relative'],
    ['./relative.json', 'destination must be a normalized file path'],
    ['nested//file.json', 'destination must be a normalized file path'],
    ['nested\\file.json', 'use portable forward-slash separators'],
    ['nested/file.', 'path segments must not end with a dot or space'],
    ['nested/file ', 'path segments must not end with a dot or space'],
  ])('rejects unsafe destination %p', async (destination, reason) => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const compile = () =>
      compileMarketplace(
        loaded,
        adaptersWithClaude(() => ({
          outputs: [
            {
              kind: 'generated',
              packageId: 'commit',
              destination,
              content: '{}\n',
            },
          ],
        })),
      );

    expect(compile).toThrow(CompilationError);
    expect(compile).toThrow(
      `unsafe output destination "${destination}" from publication "claude", package "commit": ${reason}`,
    );
  });

  test('rejects destination collisions with both producers identified', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const compile = () =>
      compileMarketplace(
        loaded,
        adaptersWithClaude(() => ({
          outputs: [
            {
              kind: 'generated',
              packageId: 'craft',
              destination: 'packages/shared.json',
              content: '{}\n',
            },
            {
              kind: 'copy',
              packageId: 'commit',
              destination: 'packages/shared.json',
              sourcePath: '/source/commit.json',
            },
          ],
        })),
      );

    expect(compile).toThrow(
      'output destination "packages/shared.json" collides between publication "claude", package "commit" and publication "claude", package "craft"',
    );
  });

  test('rejects file and directory destination conflicts', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const compile = () =>
      compileMarketplace(
        loaded,
        adaptersWithClaude(() => ({
          outputs: [
            {
              kind: 'generated',
              packageId: 'commit',
              destination: 'packages/commit/config',
              content: '{}\n',
            },
            {
              kind: 'copy',
              packageId: 'craft',
              destination: 'packages/commit/config/defaults.json',
              sourcePath: '/source/defaults.json',
            },
          ],
        })),
      );

    expect(compile).toThrow(
      'output destinations "packages/commit/config" and "packages/commit/config/defaults.json" conflict as file and directory',
    );
  });

  test.each([
    ['Plugin.json', 'plugin.json'],
    ['packages/caf\u00e9.json', 'packages/cafe\u0301.json'],
  ])('rejects portable destination aliases %p and %p', async (first, second) => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const compile = () =>
      compileMarketplace(
        loaded,
        adaptersWithClaude(() => ({
          outputs: [
            {
              kind: 'generated',
              packageId: 'commit',
              destination: first,
              content: '{}\n',
            },
            {
              kind: 'generated',
              packageId: 'craft',
              destination: second,
              content: '{}\n',
            },
          ],
        })),
      );

    expect(compile).toThrow(
      `output destinations "${first}" and "${second}" collide between publication "claude", package "commit" and publication "claude", package "craft"`,
    );
  });

  test.each([
    'output',
    'diagnostic',
  ] as const)('rejects %s provenance outside the resolved enrollment', async (recordType) => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const invalidResult = (): TargetCompilationResult =>
      recordType === 'output'
        ? {
            outputs: [
              {
                kind: 'generated',
                packageId: 'coach',
                destination: 'coach.json',
                content: '{}\n',
              },
            ],
          }
        : {
            outputs: [],
            diagnostics: [
              {
                code: 'unexpected-package',
                severity: 'warning',
                packageId: 'coach',
                message: 'Coach is not enrolled for Codex.',
              },
            ],
          };
    const compile = () =>
      compileMarketplace(loaded, [
        { target: 'claude', compilePublication: () => ({ outputs: [] }) },
        { target: 'codex', compilePublication: invalidResult },
      ]);

    expect(compile).toThrow(
      `adapter returned ${recordType} for package "coach", which is not enrolled in publication "codex"`,
    );
  });
});

function adaptersWithClaude(
  compilePublication: (input: PublicationCompilation) => TargetCompilationResult,
): TargetCompilerAdapter[] {
  return [
    { target: 'claude', compilePublication },
    {
      target: 'codex',
      compilePublication: () => ({ outputs: [] }),
    },
  ];
}

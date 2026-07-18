import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  compileMarketplace,
  type PublicationCompilation,
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

    const plan = compileMarketplace(loaded, [adapter('codex'), adapter('claude')]);

    expect(compilations.map(({ publication }) => publication.id)).toEqual(['claude', 'codex']);
    expect(compilations[0]?.packages.map(({ id }) => id)).toEqual([
      'coach',
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
});

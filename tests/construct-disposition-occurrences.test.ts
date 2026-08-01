import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// Coverage for JUN-353, bullet 3:
//
// A declared disposition's compile note must list each matched occurrence
// with its file (and location), not just the construct name. Today,
// `resolveConstructDispositions` (src/targets/package-payload.ts) collapses
// every occurrence of a declared construct into a single
// `declared-construct-disposition` note keyed only by construct name:
// `Claude-only construct "mcp-tool-reference" is retained-unenforced for
// target "codex": <note>.` Two skills in this fixture each name a different
// mcp__ tool, both matching the single declared `mcp-tool-reference`
// disposition; today's note mentions neither source file, so it cannot
// distinguish the two occurrences.
//
// This test only asserts that both occurrences' files are named somewhere in
// the emitted diagnostics — the finer-grained "location" the bullet also
// asks for (line, column, or some other position marker) has no established
// format anywhere in this codebase, so asserting a specific shape for it
// would encode an implementation choice rather than the observable contract.
// See the manifest notes.

const FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'construct-disposition-occurrences',
  'MARKETPLACE.yaml',
);

describe('construct disposition occurrence reporting', () => {
  test('a declared disposition note lists each matched occurrence by file, not just the construct name', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);

    const plan = compileMarketplace(loaded, [codexMarketplaceAdapter]);

    const dispositionMessages = plan.diagnostics
      .filter((diagnostic) => diagnostic.code === 'declared-construct-disposition')
      .map((diagnostic) => diagnostic.message)
      .join('\n');

    expect(dispositionMessages).toContain('skills/linear/SKILL.md');
    expect(dispositionMessages).toContain('skills/obsidian/SKILL.md');
  });
});

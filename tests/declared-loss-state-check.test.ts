import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { CompilationError, compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// Coverage for JUN-358, bullet 1:
//
// `resolveDeclaredLosses` (src/targets/package-payload.ts) currently matches a
// declared loss to its occurrences by construct name only; it never checks
// whether the declared `state` (`stripped` / `retained-unenforced`) actually
// matches what happened to the construct in the emitted output. A package can
// declare `state: stripped` for a construct that is, in fact, copied into the
// output verbatim (`retained-unenforced`) and compilation proceeds anyway.
//
// This fixture declares `mcp-tool-reference` as `stripped` for its skill,
// but the construct is body prose, which the skill projection copies into the
// emitted Codex body unchanged — the observed state is `retained-unenforced`.
// Compilation should fail, and the failure should name the construct, the
// declared state, the observed state, and the occurrence site(s).
const MISMATCH_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'declared-loss-state-mismatch',
  'MARKETPLACE.yaml',
);

describe('declared loss state checking', () => {
  test('a declared state that contradicts the emitted output fails compilation naming both states and the occurrence sites', async () => {
    const loaded = await loadMarketplaceDefinition(MISMATCH_FIXTURE);

    let thrown: unknown;
    try {
      compileMarketplace(loaded, [codexMarketplaceAdapter]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CompilationError);
    const message = (thrown as Error).message;

    // Names the construct.
    expect(message).toContain('mcp-tool-reference');
    // Names both the declared state and the observed state.
    expect(message).toContain('stripped');
    expect(message).toContain('retained-unenforced');
    // Names the occurrence site.
    expect(message).toContain('skills/lookup/SKILL.md');
  });
});

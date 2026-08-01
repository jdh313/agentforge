import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { CompilationError, compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// Coverage for JUN-353, bullets 1, 2, and 4:
//
// - bullet 1: a package whose `references/*.md` resource file contains a real
//   `mcp__*` call site must fail compilation, naming that file. Today,
//   `detectClaudeOnlyConstructs` (src/compatibility.ts) only ever sees the
//   entries in a package's declared `artifacts:` map; a skill's `references/`
//   resource file is swept in as a payload/resource, never as a scanned
//   artifact, so it is invisible to the declared-loss gate.
// - bullet 2: a construct-shaped string with no capability-table entry must
//   be reported rather than silently passed. `$ARGUMENTS` is already a named,
//   literal Claude-only body pattern (`CLAUDE_ONLY_BODY_PATTERNS` in
//   src/render.ts), but that check only runs for skill bodies inside
//   `projectArtifact`; the Codex marketplace path for `command`/`agent`
//   artifacts (`translateCommandSkill` / `translateAgentProcedure` in
//   src/targets/codex-marketplace.ts) never calls it, and
//   `CLAUDE_ONLY_CONSTRUCTS` (src/definitions.ts) has no entry for it either.
//   A command body using `$ARGUMENTS` therefore compiles for Codex today with
//   nothing reported at all.
// - bullet 4 (second clause): the same kind of identifier, confined to a
//   document declared reference-or-diagnostic, must compile clean with no
//   declared loss required. No such declaration mechanism exists yet; this
//   fixture assumes the narrowest available surface — an `artifacts:` entry
//   of `type: reference` — since `artifacts[].type` is already an open,
//   package-defined slug (see README: "artifacts declares open package-level
//   projection types"), not a closed enum. See the manifest notes: this is
//   an assumption, not a confirmed design answer.

const RESOURCE_REFERENCE_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'construct-scope-resource-reference',
  'MARKETPLACE.yaml',
);

const UNLISTED_CONSTRUCT_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'construct-scope-unlisted',
  'MARKETPLACE.yaml',
);

const DOCUMENT_CLASS_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'construct-scope-document-class',
  'MARKETPLACE.yaml',
);

describe('construct detection scope', () => {
  test('fails compilation for an mcp__ call site inside a references/*.md resource file, naming the file', async () => {
    const loaded = await loadMarketplaceDefinition(RESOURCE_REFERENCE_FIXTURE);

    let caught: unknown;
    try {
      compileMarketplace(loaded, [codexMarketplaceAdapter]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CompilationError);
    expect((caught as Error).message).toContain('skills/lookup/references/api.md');
  });

  test('reports a construct-shaped string with no capability-table entry rather than passing it silently', async () => {
    const loaded = await loadMarketplaceDefinition(UNLISTED_CONSTRUCT_FIXTURE);

    // Reported, not gated: an unclassified construct warns and compilation
    // still succeeds. Confirming a loss is the precondition for requiring a
    // declaration (ndr:4nshwv), and this shape has not been confirmed.
    const plan = compileMarketplace(loaded, [codexMarketplaceAdapter]);
    const unclassified = plan.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'unclassified-construct',
    );

    expect(unclassified).toHaveLength(1);
    expect(unclassified[0]?.severity).toBe('warning');
    expect(unclassified[0]?.message).toContain('$FOOBAR');
    expect(unclassified[0]?.message).toContain('commands/echo.md:7');
  });

  test('compiles clean when the only mcp__ occurrence lives in a document declared reference-or-diagnostic', async () => {
    const loaded = await loadMarketplaceDefinition(DOCUMENT_CLASS_FIXTURE);

    expect(() => compileMarketplace(loaded, [codexMarketplaceAdapter])).not.toThrow();
  });
});

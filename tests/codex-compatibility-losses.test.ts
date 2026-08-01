import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { CompilationError, compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// Coverage for JUN-341, bullet 2 (first clause):
// a Claude-only construct invisible to the 8-regex CLAUDE_ONLY_BODY_PATTERNS
// check must fail Codex compilation against a named loss, instead of
// compiling silently. Two representative constructs from the contract's
// examples are covered: an agent `tools:` filter, and an `mcp__*` reference.
//
// Today neither construct is checked at all for Codex: `translateAgentProcedure`
// drops `execution.tools` outright (only a 'note'-level
// `inferred-artifact-projection` diagnostic is recorded), and skill/agent body
// text is only scanned for the 8 literal Claude-only patterns, none of which
// match `mcp__`. Both tests below currently compile without error, so both
// fail against the current (silent) behavior.

// A dedicated fixture rather than the shared cc-marketplace corpus: that corpus
// declares its losses and must therefore compile. See JUN-341 ^r7.
const UNDECLARED_TOOLS_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'codex-undeclared-tools',
  'MARKETPLACE.yaml',
);

const MCP_SKILL_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'codex-undeclared-mcp',
  'MARKETPLACE.yaml',
);

describe('Codex compatibility losses', () => {
  test('fails Codex compilation for an agent tools: filter with no declared loss', async () => {
    // reader/agents/reader.md declares `tools: [Read, Grep]` and its package
    // declares no loss for that construct.
    const loaded = await loadMarketplaceDefinition(UNDECLARED_TOOLS_FIXTURE);

    expect(() =>
      compileMarketplace(loaded, [
        { target: 'claude', compilePublication: () => ({ outputs: [] }) },
        codexMarketplaceAdapter,
      ]),
    ).toThrow(CompilationError);
  });

  test('fails Codex compilation for a skill referencing an mcp__ tool with no declared loss', async () => {
    const loaded = await loadMarketplaceDefinition(MCP_SKILL_FIXTURE);

    expect(() =>
      compileMarketplace(loaded, [
        { target: 'claude', compilePublication: () => ({ outputs: [] }) },
        codexMarketplaceAdapter,
      ]),
    ).toThrow();
  });
});

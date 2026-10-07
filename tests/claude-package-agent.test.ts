import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { claudeMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import matter from 'gray-matter';
import { compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// Package agents compile through the leaf agent projection (roadmap 0.8
// Boundary step 5), so a plugin agent gets the same `targets.claude` merge,
// body replacement, and key filtering as a standalone plugin-scope install.
// Before this, the Claude marketplace copied the source bytes verbatim, so the
// `targets:` block itself shipped to Claude.

const FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'claude-package-agent',
  'MARKETPLACE.yaml',
);

describe('Claude marketplace package agents', () => {
  test('project through the leaf agent pipeline', async () => {
    const plan = compileMarketplace(await loadMarketplaceDefinition(FIXTURE), [
      claudeMarketplaceAdapter,
    ]);
    const output = plan.outputs.find(
      (candidate) =>
        candidate.kind === 'generated' &&
        candidate.destination === 'packages/roles/agents/reviewer.md',
    );
    if (!output || output.kind !== 'generated') throw new Error('no generated reviewer.md');

    const { data, content } = matter(output.content);
    expect(data).toEqual({
      name: 'reviewer',
      description: 'Review a change without editing it.',
      model: 'haiku',
    });
    expect(content.trim()).toBe('# Reviewer\n\nClaude-specific review procedure.');

    const messages = plan.diagnostics
      .filter((diagnostic) => diagnostic.provenance.packageId === 'roles')
      .map((diagnostic) => diagnostic.message);
    expect(messages.some((message) => message.includes('not-a-claude-key'))).toBe(true);
    expect(messages.some((message) => message.includes('upstream'))).toBe(false);
  });
});

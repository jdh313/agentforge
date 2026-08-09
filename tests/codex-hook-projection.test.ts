import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import {
  compileMarketplace,
  type DesiredCopiedOutput,
  type DesiredGeneratedOutput,
} from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

// Coverage for JUN-341, bullets 1 and 3:
// - a PreToolUse guard hook (modeled on `commit`) must project into Codex's
//   handler schema, with its companion script still executable.
// - a Stop + SessionStart hook using Claude's `command` + `args` handler
//   shape (modeled on `langfuse`) must compile for Codex without leaking the
//   `args` field Codex's handler schema has no place for.
//
// Today `codexMarketplaceAdapter` ships an empty `passthroughArtifactTypes`
// and has no `hook` entry in `INFERRED_TRANSLATORS`, so every `hook` artifact
// falls through to an `unsupported-artifact-projection` diagnostic and no
// hook content is ever emitted for Codex. Both tests below fail against that
// current behavior.

const FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'codex-hook-projection',
  'MARKETPLACE.yaml',
);

describe('Codex hook projection', () => {
  test('translates a PreToolUse guard hook into Codex handler schema with the guard script executable', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    const hookOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/guarded/hooks/hooks.json'),
    );
    expect(hookOutput).toBeDefined();
    const translated = JSON.parse(hookOutput?.content ?? '{}');
    expect(translated.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(translated.hooks.PreToolUse[0].hooks[0].command as string).toContain('guard.sh');

    const guardPayload = findCopied(plan.outputs, (destination) =>
      destination.endsWith('/guarded/hooks/guard.sh'),
    );
    expect(guardPayload).toBeDefined();
    expect(guardPayload?.executable).toBe(true);

    expect(plan.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-artifact-projection',
          retainedSource: expect.objectContaining({ artifactType: 'hook' }),
          provenance: expect.objectContaining({ packageId: 'guarded' }),
        }),
      ]),
    );
  });

  test('compiles a Stop+SessionStart command+args hook shape for Codex without an unsupported args field', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);

    let plan: ReturnType<typeof compileMarketplace> | undefined;
    expect(() => {
      plan = compileMarketplace(loaded, [
        { target: 'claude', compilePublication: () => ({ outputs: [] }) },
        codexMarketplaceAdapter,
      ]);
    }).not.toThrow();
    if (!plan) throw new Error('compilation did not produce a plan');

    const hookOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/notifier/hooks/hooks.json'),
    );
    expect(hookOutput).toBeDefined();
    const translated = JSON.parse(hookOutput?.content ?? '{}');
    expect(translated.hooks.Stop).toBeDefined();
    expect(translated.hooks.SessionStart).toBeDefined();
    expect(JSON.stringify(translated)).not.toContain('"args"');
  });

  // L-009. A confirmed-absent event and a never-ruled-on event must not report
  // as the same thing: the `Set` this replaced could only answer yes or no, so
  // an unreviewed event was indistinguishable from an established absence.
  test('separates a confirmed-absent hook event from one the capability table does not classify', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-hook-event',
          severity: 'warning',
          message: expect.stringContaining('"Notification"'),
          provenance: expect.objectContaining({ packageId: 'triage' }),
        }),
        expect.objectContaining({
          code: 'unclassified-hook-event',
          severity: 'warning',
          message: expect.stringContaining('"PreResponse"'),
          provenance: expect.objectContaining({ packageId: 'triage' }),
        }),
      ]),
    );

    // Neither gates the compile, and neither reaches Codex output; the
    // supported sibling event still projects.
    const hookOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/triage/hooks/hooks.json'),
    );
    expect(hookOutput).toBeDefined();
    const translated = JSON.parse(hookOutput?.content ?? '{}');
    expect(Object.keys(translated.hooks)).toEqual(['PostToolUse']);
  });
});

function findGenerated(
  outputs: readonly unknown[],
  matches: (destination: string) => boolean,
): DesiredGeneratedOutput | undefined {
  return outputs.find(
    (candidate): candidate is DesiredGeneratedOutput =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'kind' in candidate &&
      candidate.kind === 'generated' &&
      'destination' in candidate &&
      typeof candidate.destination === 'string' &&
      matches(candidate.destination),
  );
}

function findCopied(
  outputs: readonly unknown[],
  matches: (destination: string) => boolean,
): DesiredCopiedOutput | undefined {
  return outputs.find(
    (candidate): candidate is DesiredCopiedOutput =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'kind' in candidate &&
      candidate.kind === 'copy' &&
      'destination' in candidate &&
      typeof candidate.destination === 'string' &&
      matches(candidate.destination),
  );
}

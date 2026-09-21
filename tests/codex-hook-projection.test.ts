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

const ARTIFACT_HOOK_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'codex-artifact-hook-projection',
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
        // A Claude event with no Codex analog, established by probe rather
        // than assumed from its absence in the supported list.
        expect.objectContaining({
          code: 'unsupported-hook-event',
          severity: 'warning',
          message: expect.stringContaining('"WorktreeCreate"'),
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

describe('Codex canonical artifact hook projection', () => {
  test('projects skill and agent hooks as separate package hook files with explicit scope loss', async () => {
    const loaded = await loadMarketplaceDefinition(ARTIFACT_HOOK_FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    const manifestOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/artifact-hooks/.codex-plugin/plugin.json'),
    );
    expect(manifestOutput).toBeDefined();
    const manifest = JSON.parse(manifestOutput?.content ?? '{}');
    expect(manifest.hooks).toEqual([
      './hooks/agents/hooked-agent.json',
      './hooks/skills/hooked-skill.json',
    ]);

    const skillOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/artifact-hooks/hooks/skills/hooked-skill.json'),
    );
    expect(skillOutput).toBeDefined();
    const skillHooks = JSON.parse(skillOutput?.content ?? '{}');
    expect(skillHooks.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(skillHooks.hooks.PreToolUse[0].hooks[0].command).toContain(`\${PLUGIN_ROOT}`);
    expect(skillHooks.hooks.PreToolUse[0].hooks[0]).not.toHaveProperty('once');

    const agentOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/artifact-hooks/hooks/agents/hooked-agent.json'),
    );
    expect(agentOutput).toBeDefined();
    const agentHooks = JSON.parse(agentOutput?.content ?? '{}');
    expect(agentHooks.hooks.Stop).toBeUndefined();
    expect(agentHooks.hooks.SubagentStop).toBeDefined();

    const scopeWarnings = plan.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'artifact-hook-scope-widened',
    );
    expect(scopeWarnings).toHaveLength(2);
    expect(
      scopeWarnings.map(({ retainedSource }) => retainedSource?.artifactType).toSorted(),
    ).toEqual(['agent', 'skill']);
    expect(scopeWarnings.every(({ severity }) => severity === 'warning')).toBe(true);

    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-artifact-hook-once',
          severity: 'warning',
          retainedSource: expect.objectContaining({ artifactType: 'skill' }),
        }),
        expect.objectContaining({
          code: 'translated-construct',
          severity: 'note',
          message: expect.stringContaining('Stop'),
          retainedSource: expect.objectContaining({ artifactType: 'agent' }),
        }),
      ]),
    );
    expect(
      plan.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'claude-only-frontmatter-stripped' &&
          diagnostic.provenance.packageId === 'artifact-hooks' &&
          diagnostic.message.includes('hooks'),
      ),
    ).toBe(false);
  });
});

// ndr:bm3m2j — a declared hook timeout above a documented runtime cap is
// *warned about*, not clamped, and never fails the compile. The emission site
// had no coverage at all, so a regression that silently clamped the value —
// the one outcome that decision forbids — would have shipped green.
//
// Separate fixture on purpose: `compilation-report.test.ts` pins an exact
// diagnostic census for `codex-hook-projection`, so adding an event there to
// reach this branch would have rewritten another agent's expectations.
describe('Codex SessionEnd timeout cap', () => {
  const TIMEOUT_FIXTURE = join(
    import.meta.dir,
    'fixtures',
    'definitions',
    'codex-hook-timeout-cap',
    'MARKETPLACE.yaml',
  );

  test('warns on a SessionEnd timeout above the runtime cap without clamping the emitted value', async () => {
    const loaded = await loadMarketplaceDefinition(TIMEOUT_FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'hook-timeout-capped-by-runtime',
          severity: 'warning',
          message: expect.stringContaining('10s'),
          provenance: expect.objectContaining({ packageId: 'capped' }),
        }),
      ]),
    );
    // The warning has to name the cap, not just the declared value — that is
    // the number the reader needs in order to act on it.
    const capWarning = plan.diagnostics.find(
      (diagnostic) => diagnostic.code === 'hook-timeout-capped-by-runtime',
    );
    expect(capWarning?.message).toContain('3s');

    // The load-bearing assertion. Warning and clamping are indistinguishable
    // from the diagnostic alone; only the emitted bytes tell them apart.
    const hookOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/capped/hooks/hooks.json'),
    );
    expect(hookOutput).toBeDefined();
    const translated = JSON.parse(hookOutput?.content ?? '{}');
    expect(translated.hooks.SessionEnd[0].hooks[0].timeout).toBe(10);
  });

  test('leaves an under-cap SessionEnd timeout and any other event uncapped and unreported', async () => {
    const loaded = await loadMarketplaceDefinition(TIMEOUT_FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    // Exactly one handler is over the cap, so exactly one warning. A second
    // would mean the 2s sibling or the 30s SessionStart had been swept in.
    const capWarnings = plan.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'hook-timeout-capped-by-runtime',
    );
    expect(capWarnings).toHaveLength(1);

    const hookOutput = findGenerated(plan.outputs, (destination) =>
      destination.endsWith('/capped/hooks/hooks.json'),
    );
    const translated = JSON.parse(hookOutput?.content ?? '{}');
    expect(translated.hooks.SessionEnd[0].hooks[1].timeout).toBe(2);
    // The cap is SessionEnd-only; 30s on SessionStart is legal and untouched.
    expect(translated.hooks.SessionStart[0].hooks[0].timeout).toBe(30);
  });
});

// Fibery #121, surface B. A hook diagnostic already names the offending
// event in its message, but `retainedSource` only carries the file, so on a
// `hooks.json` declaring several events the reader gets the file and then
// scans. These diagnostics now also carry `locations`, found by re-scanning
// the raw JSON text for the event name anchored in key position.
describe('Codex hook diagnostic source locations', () => {
  const LOCATIONS_FIXTURE = join(
    import.meta.dir,
    'fixtures',
    'definitions',
    'codex-hook-locations',
    'MARKETPLACE.yaml',
  );

  test('points an unsupported-hook-event diagnostic at the event key line, not the decoy text above it', async () => {
    const loaded = await loadMarketplaceDefinition(LOCATIONS_FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    const diagnostic = plan.diagnostics.find(
      (candidate) =>
        candidate.code === 'unsupported-hook-event' && candidate.provenance.packageId === 'located',
    );
    expect(diagnostic).toBeDefined();

    // The fixture's "Notification" key sits on line 13; a decoy occurrence of
    // the same word inside a `command` string on line 8 must not be mistaken
    // for it.
    expect(diagnostic?.locations).toEqual([
      expect.objectContaining({
        path: expect.stringContaining('located/hooks/hooks.json'),
        line: 13,
      }),
    ]);
  });

  // `JSON.parse` keeps the last duplicate key, so a hooks.json declaring the
  // same event twice yields a `source.hooks` entry built from the SECOND
  // block. The location must scan for the last occurrence too, or it points
  // at the stale first declaration while the diagnostic describes the second.
  test('points a diagnostic for a duplicated hook event at its second (surviving) declaration', async () => {
    const loaded = await loadMarketplaceDefinition(LOCATIONS_FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    const diagnostic = plan.diagnostics.find(
      (candidate) =>
        candidate.code === 'unsupported-hook-event' &&
        candidate.provenance.packageId === 'duplicated',
    );
    expect(diagnostic).toBeDefined();

    // The fixture declares "Notification" twice: line 3 (stale) and line 23
    // (the declaration JSON.parse actually kept).
    expect(diagnostic?.locations).toEqual([
      expect.objectContaining({
        path: expect.stringContaining('duplicated/hooks/hooks.json'),
        line: 23,
      }),
    ]);
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

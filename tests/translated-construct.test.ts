import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { supportFor } from '../src/capabilities.ts';
import { compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition, parsePackageDefinition } from '../src/definitions.ts';

// Coverage for JUN-357.
//
// Two constructs are translated faithfully into a Codex-native form today, and
// in both cases the fact is expressed as a hard-coded negation rather than as a
// value in the model:
//
// - `disable-model-invocation` becomes `agents/openai.yaml`, but the knowledge
//   lives as an inline conjunct in the Claude-only frontmatter filter
//   (`src/render.ts:135`), which merely suppresses the "stripped" warning. The
//   compile report says nothing at all.
// - `${CLAUDE_PLUGIN_ROOT}` in a hook configuration becomes `${PLUGIN_ROOT}`
//   (`src/targets/codex-marketplace.ts:56-59`), but the detector is told to
//   skip non-prose artifacts by comment (`src/compatibility.ts:125-126`)
//   because it has no way to say "this one is handled."
//
// The capability table already answers "what does this target do with this
// construct" per (target, surface). `translated` is the verdict missing from
// that set. It is deliberately NOT a declared-loss `state`: `ndr:4nshwv` says a
// losslessly translated construct is not a loss, so putting it there would make
// `ndr:62pj9p` emit a loss note on every compile for a loss that never
// happened — the same failure the model review used to reject `documented`.

const FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'translated-construct',
  'MARKETPLACE.yaml',
);

describe('translated constructs', () => {
  test('reports a note naming the native form a skill frontmatter construct becomes', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);
    const plan = compileMarketplace(loaded, [codexMarketplaceAdapter]);

    const translated = plan.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'translated-construct',
    );
    const skillNote = translated.find((diagnostic) =>
      diagnostic.message.includes('disable-model-invocation'),
    );

    expect(skillNote).toBeDefined();
    expect(skillNote?.severity).toBe('note');
    // Names what the construct became, not merely that it was not lost.
    expect(skillNote?.message).toContain('agents/openai.yaml');
  });

  test('reports a note naming the native form a hook environment variable becomes', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);
    const plan = compileMarketplace(loaded, [codexMarketplaceAdapter]);

    const hookNote = plan.diagnostics
      .filter((diagnostic) => diagnostic.code === 'translated-construct')
      .find((diagnostic) => diagnostic.message.includes('CLAUDE_PLUGIN_ROOT'));

    expect(hookNote).toBeDefined();
    expect(hookNote?.severity).toBe('note');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Codex variable name is the assertion
    expect(hookNote?.message).toContain('${PLUGIN_ROOT}');
  });

  test('requires no declared loss for either translated construct', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);

    // Neither package declares a `losses:` entry. A translated construct is not
    // a loss, so compilation must succeed without one (ndr:4nshwv).
    expect(() => compileMarketplace(loaded, [codexMarketplaceAdapter])).not.toThrow();
  });

  test('resolves both constructs to a `translated` verdict in the capability table', () => {
    // The observable behind "no exemption is expressed as an inline conditional
    // or a comment": both facts are readable from the table itself.
    expect(supportFor('codex', 'skill', 'disable-model-invocation')).toBe('translated');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Claude variable name is the table key
    expect(supportFor('codex', 'skill', '${CLAUDE_PLUGIN_ROOT}')).toBe('translated');
  });

  test('leaves the declared-loss state enum closed to `stripped` and `retained-unenforced`', () => {
    const parse = () =>
      parsePackageDefinition(
        [
          'schema: agentforge.package/v1',
          'id: sample',
          'defaults:',
          '  name: sample',
          '  version: 1.0.0',
          '  description: Fixture package asserting the declared-loss state enum stays closed.',
          'artifacts:',
          '  - type: skill',
          '    pattern: skills/*/SKILL.md',
          'targets:',
          '  codex:',
          '    losses:',
          '      - construct: mcp-tool-reference',
          '        state: translated',
        ].join('\n'),
      );

    expect(parse).toThrow('stripped');
  });
});

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
//   (`src/targets/codex-marketplace.ts`), but the detector is told to skip
//   non-prose artifacts by comment (`src/compatibility.ts`, `isProse`) because
//   it has no way to say "this one is handled." This translation lives on the
//   `codex/hook` capability row, not `codex/skill`: the docs and binary
//   evidence scope `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` to a hook
//   command's process environment (and Agent Plugins MCP stdio `cwd`), never
//   to SKILL.md body text, so a `codex/skill` occurrence resolves unsupported
//   instead (task #101).
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

  test('resolves both constructs to a `translated` verdict on their own surface', () => {
    // The observable behind "no exemption is expressed as an inline conditional
    // or a comment": both facts are readable from the table itself.
    expect(supportFor('codex', 'skill', 'disable-model-invocation')).toBe('translated');
    // The plugin-root variables are a hook-surface fact, not a skill-surface
    // one — see the `codex/hook` row's citation (task #101).
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Claude variable name is the table key
    expect(supportFor('codex', 'hook', '${CLAUDE_PLUGIN_ROOT}')).toBe('translated');
  });

  test('resolves the plugin-root variables as unsupported on the skill surface', () => {
    // Nothing carries `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` into a
    // native form inside SKILL.md body text, and `codex/skill`'s translated
    // map no longer has an entry for the literal, so a body occurrence falls
    // through to the normalized `${CLAUDE_*}` family (the token `scanBody`
    // actually looks up once `translationFor` misses) and resolves
    // unsupported — an honestly reported loss, not a silently claimed one
    // (task #101).
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Claude variable name is the table key
    expect(supportFor('codex', 'skill', '${CLAUDE_PLUGIN_ROOT}')).toBe('unknown');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the normalized family token is the table key
    expect(supportFor('codex', 'skill', '${CLAUDE_*}')).toBe('unsupported');
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

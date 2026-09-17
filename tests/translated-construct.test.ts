import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { supportFor, translationsFor } from '../src/capabilities.ts';
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
//   instead (ndr:61cmc9).
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

  test('reports a declared-loss diagnostic, not a translated-construct note, for CLAUDE_PLUGIN_ROOT in a skill body', async () => {
    // End-to-end coverage for the defect this fixture package exists to
    // close: before ndr:61cmc9, `${CLAUDE_PLUGIN_ROOT}` inside SKILL.md prose
    // resolved `translated` off the `codex/skill` row, so `scanBody` filed it
    // under `detection.translated` and it never reached the declared-loss
    // gate at all. It must now resolve `unsupported` on `codex/skill` (see
    // the surface-split test above) and be reported as an ordinary loss the
    // fixture package's `targets.codex.losses` entry declares.
    const loaded = await loadMarketplaceDefinition(FIXTURE);
    const plan = compileMarketplace(loaded, [codexMarketplaceAdapter]);

    // `CompilationDiagnostic` carries package identity under `provenance`,
    // not a top-level `packageId` (that field is stripped when a proposed
    // diagnostic is finalized — see `CompilationDiagnostic` in compiler.ts).
    const forThisPackage = plan.diagnostics.filter(
      (diagnostic) => diagnostic.provenance.packageId === 'skill-with-plugin-root',
    );

    // The marketplace-compile gate's own verdict: an occurrence of a declared
    // construct, named by construct id and state.
    const declaredLoss = forThisPackage.find(
      (diagnostic) =>
        diagnostic.code === 'declared-loss' &&
        diagnostic.message.includes('body-template-variable'),
    );
    expect(declaredLoss).toBeDefined();
    expect(declaredLoss?.severity).toBe('note');
    expect(declaredLoss?.message).toContain('retained-unenforced');

    // The skill's own render-level warning for the same construct (skills
    // still go through the standard render pipeline in render.ts, unlike
    // agent/command/hook artifacts, which have dedicated translators).
    const bodyFeatureWarning = forThisPackage.find(
      (diagnostic) =>
        diagnostic.code === 'claude-only-body-feature' &&
        diagnostic.message.includes('CLAUDE_PLUGIN_ROOT'),
    );
    expect(bodyFeatureWarning).toBeDefined();
    expect(bodyFeatureWarning?.severity).toBe('warning');

    // The one thing this fixture exists to rule out: nothing claims the
    // literal was carried into a native form.
    const translatedNote = forThisPackage.find(
      (diagnostic) =>
        diagnostic.code === 'translated-construct' &&
        diagnostic.message.includes('CLAUDE_PLUGIN_ROOT'),
    );
    expect(translatedNote).toBeUndefined();
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
    // one — see the `codex/hook` row's citation (ndr:61cmc9).
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Claude variable name is the table key
    expect(supportFor('codex', 'hook', '${CLAUDE_PLUGIN_ROOT}')).toBe('translated');
  });

  test('the plugin-root literal resolves unknown, and its normalized family resolves unsupported, on the skill surface', () => {
    // Nothing carries `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` into a
    // native form inside SKILL.md body text, and `codex/skill`'s translated
    // map no longer has an entry for the literal, so looking the literal up
    // directly matches nothing on this row and resolves `unknown` (ndr:61cmc9).
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal Claude variable name is the table key
    expect(supportFor('codex', 'skill', '${CLAUDE_PLUGIN_ROOT}')).toBe('unknown');
    // `scanBody` falls through to this normalized `${CLAUDE_*}` family token
    // once `translationFor` misses on the literal — this is the real runtime
    // path for a `${CLAUDE_PLUGIN_ROOT}` occurrence inside SKILL.md prose, and
    // it resolves unsupported: an honestly reported loss, not a silently
    // claimed translation (ndr:61cmc9).
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the normalized family token is the table key
    expect(supportFor('codex', 'skill', '${CLAUDE_*}')).toBe('unsupported');
  });

  test('every codex/hook translated key is a template-variable token, not an arbitrary literal', () => {
    // `codex-marketplace.ts`'s hook rewriter does a literal find/replace of
    // each translated key over a hook command *string* (`rewriteClaudeHookEnv`
    // / `foldHookCommand`). That is only safe for a variable-shaped token: a
    // non-`${...}` key (e.g. a bare word or punctuation) could match and
    // rewrite unrelated substring content inside a real command, silently
    // corrupting it. This asserts the contract the rewriter depends on rather
    // than restoring the old `.filter(([token]) => token.startsWith('${'))`
    // guard, so a future non-variable-shaped addition to the `codex/hook` row
    // fails a test instead of leaking into the rewriter unnoticed.
    const hookTranslations = translationsFor('codex', 'hook');
    expect(hookTranslations.length).toBeGreaterThan(0);
    for (const [token] of hookTranslations) {
      expect(token).toMatch(/^\$\{[A-Z_][A-Z0-9_]*\}$/);
    }
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

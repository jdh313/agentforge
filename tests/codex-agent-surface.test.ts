import { describe, expect, test } from 'bun:test';
import { supportFor } from '../src/capabilities.ts';
import { projectArtifact } from '../src/render.ts';

// The `codex/agent` capability row (Fibery #112, F-3).
//
// Before the row existed, every construct in a Codex agent body resolved to
// `unknown`, so a leaf render reported `${CLAUDE_PLUGIN_ROOT}` as merely
// unclassified while a marketplace compile — which scans agent bodies on the
// default `skill` surface — refused the identical construct in the identical
// file. These tests pin the verdict the row settles on, and pin the two things
// it must NOT change.

// Suppressed file-wide, on the `src/capabilities.ts` precedent: every
// `${CLAUDE_*}` here is a literal capability-table key or a literal construct
// under assertion, never a template string that lost its backticks.
// biome-ignore-start lint/suspicious/noTemplateCurlyInString: literal Claude variable names are what these assertions are about

// A body carrying one construct from each family the table calls Claude-only.
const CONSTRUCT_BODY = [
  '# Vault reader',
  '',
  'Read ${CLAUDE_PLUGIN_ROOT}/references/vault-conventions.md first.',
  '',
  'Then use mcp__obsidian-mcp__search_notes for the lookup.',
].join('\n');

const agentSource = (body: string, frontmatter = '') =>
  `---\nname: surface-probe\ndescription: Exercises the codex agent construct surface.\n${frontmatter}---\n\n${body}\n`;

describe('codex/agent capability row', () => {
  test('reports a Claude-only body construct as a confirmed loss, not as unclassified', () => {
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'codex',
      sourcePath: '/virtual/surface-probe/AGENT.md',
      source: agentSource(CONSTRUCT_BODY),
    });

    const bodyWarnings = projection.warnings.filter(
      ({ kind }) => kind === 'claude-only-body-feature' || kind === 'unclassified-body-construct',
    );

    // One warning, and it is the confirmed-loss kind. `unclassified` would mean
    // agentforge has no entry covering the construct, which is exactly the
    // false statement this row removes.
    expect(bodyWarnings.map(({ kind }) => kind)).toEqual(['claude-only-body-feature']);
    expect(bodyWarnings[0]?.detail).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(bodyWarnings[0]?.detail).toContain('mcp__obsidian-mcp__search_notes');
  });

  test('agrees with the skill surface, which the marketplace path applies to the same bodies', () => {
    // The disagreement this row closes was between two surfaces, so the
    // assertion is the agreement itself rather than either verdict alone.
    for (const token of ['$ARGUMENTS', '$N', '${CLAUDE_*}', 'inline-shell', 'mcp-tool']) {
      expect(supportFor('codex', 'agent', token)).toBe(supportFor('codex', 'skill', token));
      expect(supportFor('codex', 'agent', token)).toBe('unsupported');
    }
  });

  test('does not translate the plugin-root variables, which are hook-scoped', () => {
    // ndr:61cmc9: the documented `CLAUDE_PLUGIN_ROOT` -> `PLUGIN_ROOT` mapping
    // is scoped to hook command execution. Claiming it on an agent role's
    // instruction body would assert an expansion nothing performs.
    //
    // Asked with the literal token, not the `${CLAUDE_*}` family token: a
    // translation is keyed on the literal (ndr:987ary), so the family token is
    // the wrong question to put to the hook row and answers `unknown` there.
    expect(supportFor('codex', 'hook', '${CLAUDE_PLUGIN_ROOT}')).toBe('translated');
    expect(supportFor('codex', 'agent', '${CLAUDE_PLUGIN_ROOT}')).toBe('unknown');
    expect(supportFor('codex', 'agent', '${CLAUDE_*}')).toBe('unsupported');
  });

  test('leaves frontmatter key reporting exactly as it was', () => {
    // The row carries body-construct tokens only. A frontmatter key must still
    // resolve to `unknown` here, because the checked-in acceptance table in
    // src/frontmatter.ts — not the capability table — decides what Codex keeps,
    // and `claudeOnlyPresent` only excludes keys the capability table calls
    // `translated`. A key drifting to `translated` would silently delete its
    // stripped-key warning.
    for (const key of ['model', 'maxTurns', 'tools', 'permissionMode', 'isolation']) {
      expect(supportFor('codex', 'agent', key)).toBe('unknown');
    }

    const projection = projectArtifact({
      artifact: 'agent',
      target: 'codex',
      sourcePath: '/virtual/surface-probe/AGENT.md',
      source: agentSource('Plain body with no constructs.', 'model: sonnet\nmaxTurns: 10\n'),
    });

    const stripped = projection.warnings.filter(
      ({ kind }) => kind === 'claude-only-frontmatter-stripped',
    );
    expect(stripped).toHaveLength(1);
    expect(stripped[0]?.detail).toBe('stripped model, maxTurns');
  });

  test('a targets.codex.body override still suppresses the body warning', () => {
    // The row changes which verdict a construct gets, never whether an explicit
    // per-target body is honored (ndr:h3aggj).
    const projection = projectArtifact({
      artifact: 'agent',
      target: 'codex',
      sourcePath: '/virtual/surface-probe/AGENT.md',
      source: `---\nname: surface-probe\ndescription: Exercises the codex agent construct surface.\ntargets:\n  codex:\n    body: |\n      Codex-native instructions with no Claude constructs.\n---\n\n${CONSTRUCT_BODY}\n`,
    });

    expect(
      projection.warnings.filter(
        ({ kind }) => kind === 'claude-only-body-feature' || kind === 'unclassified-body-construct',
      ),
    ).toEqual([]);
  });
});

// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal Claude variable names are what these assertions are about

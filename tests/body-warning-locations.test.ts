import { describe, expect, test } from 'bun:test';
import { projectArtifact } from '../src/render.ts';

// Coverage for Fibery #121 (surface A): `claude-only-body-feature` and
// `unclassified-body-construct` used to collapse every occurrence of a
// literal into one positionless warning (`detectClaudeOnlyBodyFeatures` threw
// `shape.line` away while deduping into a `Set<string>`). Each occurrence now
// carries its own `path:line`, and the deduped, sorted literal list in
// `detail` is unchanged.

// Suppressed for this file: every `${CLAUDE_PLUGIN_ROOT}` below is the literal
// construct under assertion, never a template string that lost its backticks.
// biome-ignore-start lint/suspicious/noTemplateCurlyInString: literal Claude variable name under assertion

const SOURCE_PATH = '/virtual/repeated-construct/SKILL.md';

const skillSource = (body: string) =>
  `---\nname: repeated-construct\ndescription: Exercises repeated body constructs.\n---\n\n${body}\n`;

describe('leaf body warning locations', () => {
  test('the same literal at three lines produces three locations, one per occurrence', () => {
    const body = [
      'Read ${CLAUDE_PLUGIN_ROOT}/a.md first.',
      '',
      'Then read ${CLAUDE_PLUGIN_ROOT}/b.md.',
      '',
      'Finally read ${CLAUDE_PLUGIN_ROOT}/c.md.',
    ].join('\n');

    const projection = projectArtifact({
      artifact: 'skill',
      target: 'opencode',
      sourcePath: SOURCE_PATH,
      source: skillSource(body),
    });

    const warning = projection.warnings.find(({ kind }) => kind === 'claude-only-body-feature');
    expect(warning).toBeDefined();
    // The literal appears once in the message regardless of occurrence count.
    expect(warning?.detail).toBe(
      'body uses ${CLAUDE_PLUGIN_ROOT} but no targets.opencode.body override',
    );

    expect(warning?.locations).toHaveLength(3);
    expect(warning?.locations?.map((location) => location.path)).toEqual([
      SOURCE_PATH,
      SOURCE_PATH,
      SOURCE_PATH,
    ]);
    // File-relative, counted from the start of the canonical file including
    // the frontmatter block — not from the start of the body gray-matter
    // hands back. `skillSource`'s frontmatter is 4 lines (`---` / `name:` /
    // `description:` / `---`) plus a blank line before the body, so the three
    // constructs land on lines 6, 8, and 10.
    expect(warning?.locations?.map((location) => location.line)).toEqual([6, 8, 10]);
  });
});

// biome-ignore-end lint/suspicious/noTemplateCurlyInString: literal Claude variable name under assertion

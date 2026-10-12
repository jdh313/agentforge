import { expect, test } from 'bun:test';
import matter from 'gray-matter';
import { supportFor } from '../src/capabilities.ts';
import { projectArtifact } from '../src/render.ts';

const tools = ['Bash(git:*)', 'Bash(jj:*)', 'Read'];
const metadata = { name: 'commit', description: 'Create safe commits' };
const source = (fields: Record<string, unknown>) =>
  `---\n${JSON.stringify({ ...metadata, ...fields })}\n---\nCommit instructions.\n`;

for (const [label, fields] of [
  ['shared string', { 'allowed-tools': tools.join(' ') }],
  ['shared array', { 'allowed-tools': tools }],
  ['override-only string', { targets: { pi: { 'allowed-tools': tools.join(' ') } } }],
  ['override-only array', { targets: { pi: { 'allowed-tools': tools } } }],
  [
    'overridden shared field',
    { 'allowed-tools': tools, targets: { pi: { 'allowed-tools': 'bash read' } } },
  ],
] as const) {
  test(`Pi strips ${label} allowed-tools and reports the loss`, () => {
    const projection = projectArtifact({
      sourcePath: 'skills/commit/SKILL.md',
      source: source(fields),
      target: 'pi',
      artifact: 'skill',
    });
    expect(matter(projection.content).data).toEqual(metadata);
    expect(projection.content).toContain('Commit instructions.');
    expect(projection.warnings).toEqual([
      expect.objectContaining({
        kind: 'claude-only-frontmatter-stripped',
        target: 'pi',
        detail: expect.stringContaining('allowed-tools'),
      }),
    ]);
  });
}

for (const value of [tools.join(' '), tools]) {
  test(`Claude preserves ${typeof value === 'string' ? 'string' : 'array'} allowed-tools`, () => {
    const projection = projectArtifact({
      sourcePath: 'skills/commit/SKILL.md',
      source: source({ 'allowed-tools': value }),
      target: 'claude',
      artifact: 'skill',
    });
    expect(matter(projection.content).data['allowed-tools']).toEqual(value);
    expect(projection.warnings).toEqual([]);
  });
}

test('Pi skill allowed-tools is explicitly unsupported, not an unknown construct', () => {
  expect(supportFor('pi', 'skill', 'allowed-tools')).toBe('unsupported');
  expect(supportFor('pi', 'skill', 'disable-model-invocation')).toBe('supported');
});

import { describe, expect, test } from 'bun:test';
import { buildArtifactOutputs, projectArtifact } from 'agentforge/render';
import matter from 'gray-matter';
import { allTargets } from '../src/targets/index.ts';

describe('leaf artifact projection', () => {
  test('projects target content and resource inputs without materializing files', () => {
    const projection = projectArtifact({
      artifact: 'skill',
      target: 'codex',
      sourcePath: '/packages/spec-flow/skills/draft/SKILL.md',
      source: `---
name: draft
description: Draft a change contract.
allowed-tools: [Read]
targets:
  codex:
    body: |
      # Codex draft
---

# Canonical draft
`,
      resourcePaths: [
        '/packages/spec-flow/skills/draft/scripts/check.ts',
        '/packages/spec-flow/skills/draft/notes/private.md',
        '/packages/spec-flow/skills/draft/assets/logo.png',
        '/packages/spec-flow/skills/draft/references/contract.md',
      ],
    });

    expect(projection.artifactName).toBe('draft');
    expect(matter(projection.content)).toMatchObject({
      data: {
        name: 'draft',
        description: 'Draft a change contract.',
      },
      content: '# Codex draft\n',
    });
    expect(projection.resources).toEqual([
      {
        relativePath: 'assets/logo.png',
        sourcePath: '/packages/spec-flow/skills/draft/assets/logo.png',
      },
      {
        relativePath: 'references/contract.md',
        sourcePath: '/packages/spec-flow/skills/draft/references/contract.md',
      },
      {
        relativePath: 'scripts/check.ts',
        sourcePath: '/packages/spec-flow/skills/draft/scripts/check.ts',
      },
    ]);
    expect(projection.warnings).toEqual([
      {
        kind: 'claude-only-frontmatter-stripped',
        target: 'codex',
        detail: 'stripped allowed-tools',
      },
    ]);

    expect(buildArtifactOutputs(projection, 'skill', 'packages/draft')).toEqual([
      {
        kind: 'generated',
        producer: 'generated',
        destination: 'packages/draft/SKILL.md',
        content: projection.content,
      },
      {
        kind: 'copy',
        producer: 'generated',
        destination: 'packages/draft/assets/logo.png',
        sourcePath: '/packages/spec-flow/skills/draft/assets/logo.png',
      },
      {
        kind: 'copy',
        producer: 'generated',
        destination: 'packages/draft/references/contract.md',
        sourcePath: '/packages/spec-flow/skills/draft/references/contract.md',
      },
      {
        kind: 'copy',
        producer: 'generated',
        destination: 'packages/draft/scripts/check.ts',
        sourcePath: '/packages/spec-flow/skills/draft/scripts/check.ts',
      },
    ]);
  });

  test('the target registry owns leaf and optional marketplace capabilities', () => {
    expect(
      allTargets().map(({ name, artifacts, marketplace }) => ({
        name,
        surfaces: Object.fromEntries(
          Object.entries(artifacts).map(([artifact, config]) => [artifact, config?.surface]),
        ),
        marketplace: marketplace !== undefined,
      })),
    ).toEqual([
      { name: 'claude', surfaces: { skill: 'skill', 'output-style': 'skill' }, marketplace: true },
      { name: 'opencode', surfaces: { skill: 'skill' }, marketplace: false },
      { name: 'codex', surfaces: { skill: 'skill' }, marketplace: true },
      { name: 'pi', surfaces: { skill: 'skill' }, marketplace: false },
      { name: 'claude-chat', surfaces: { skill: 'skill' }, marketplace: false },
    ]);
  });
});

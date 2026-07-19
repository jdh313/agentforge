import { describe, expect, test } from 'bun:test';
import matter from 'gray-matter';
import { projectArtifact } from '../src/render.ts';

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
  });
});

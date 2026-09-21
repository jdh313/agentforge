import { describe, expect, test } from 'bun:test';
import { findConstructShapes, supportFor } from '../src/capabilities.ts';
import { detectClaudeOnlyConstructs } from '../src/compatibility.ts';
import type { LoadedArtifact } from '../src/definitions.ts';
import type { TargetName } from '../src/types.ts';

// Coverage for ndr:c5haze — a body naming an agent the target does not register
// is a declarable loss rather than silent prose.
//
// The load-bearing claim is not "we detect `@name`". It is that detection keys
// on the agents the package *declares*, so the detector carries no heuristic:
// a declared name is a collaborator reference and an undeclared one is prose.
// The prose case below is what makes the family safe to add at all, and the
// file-reference case is what proves the deliberate separator requirement in
// `src/capabilities.ts` was left intact rather than widened.
//
// Resolution is package-local on purpose. A body naming a sibling package's
// agent is out of scope here and tracked as Fibery Charting #23.

function agent(path: string, name?: string): LoadedArtifact {
  const frontmatter =
    name === undefined
      ? '---\ndescription: An agent.\n---\n'
      : `---\nname: ${name}\ndescription: An agent.\n---\n`;
  return { path, content: `${frontmatter}\nAgent body.\n` };
}

function skill(body: string): LoadedArtifact {
  return { path: 'skills/teach/SKILL.md', content: `---\nname: teach\n---\n\n${body}\n` };
}

function detect(artifacts: Record<string, LoadedArtifact[]>, target: TargetName = 'codex') {
  return detectClaudeOnlyConstructs({
    artifacts: new Map(Object.entries(artifacts)),
    target,
  });
}

describe('agent-reference detection', () => {
  test('detects a body dispatching an agent the same package declares', () => {
    const { detected } = detect({
      agent: [agent('agents/vault-reader.md', 'vault-reader')],
      skill: [skill('Complex restructuring goes to @vault-reader.')],
    });

    const references = detected.filter(({ construct }) => construct === 'body-agent-reference');
    expect(references).toHaveLength(1);
    expect(references[0]?.sourcePath).toBe('skills/teach/SKILL.md');
    expect(references[0]?.line).toBe(5);
    expect(references[0]?.detail).toBe('body dispatches declared agent @vault-reader');
    expect(references[0]?.retention).toEqual({ kind: 'body-literal', literal: '@vault-reader' });
  });

  // The dominant spelling in real corpora: a collaborator wrapped in backticks.
  // A whitespace-only lookbehind misses every one of them.
  test('detects the backticked spelling, and bracketed or parenthesised ones', () => {
    const { detected } = detect({
      agent: [agent('agents/vault-reader.md', 'vault-reader')],
      skill: [
        skill('The search runs inside `@vault-reader`.\nSee (@vault-reader) and [@vault-reader].'),
      ],
    });

    const references = detected.filter(({ construct }) => construct === 'body-agent-reference');
    expect(references.map(({ line }) => line)).toEqual([5, 6]);
  });

  test('falls back to the filename stem when the agent declares no name', () => {
    const { detected } = detect({
      agent: [agent('agents/note-editor.md')],
      skill: [skill('Hand the note to @note-editor when it needs restructuring.')],
    });

    expect(detected.map(({ construct }) => construct)).toContain('body-agent-reference');
  });

  // The whole point of keying on declared data. An `@` token that names nothing
  // the package declares is text, and a detector that flagged it would fire on
  // every mention of a person, a handle, or an email-shaped string.
  test('ignores an @token that names no declared agent', () => {
    const { detected, unknown } = detect({
      agent: [agent('agents/vault-reader.md', 'vault-reader')],
      skill: [skill('Ask @everyone before you escalate, and cc @team-lead.')],
    });

    expect(detected.filter(({ construct }) => construct === 'body-agent-reference')).toHaveLength(
      0,
    );
    expect(unknown.filter(({ family }) => family === 'agent-reference')).toHaveLength(0);
  });

  test('detects nothing when the package declares no agents at all', () => {
    const { detected } = detect({
      skill: [skill('Complex restructuring goes to @vault-reader.')],
    });

    expect(detected.filter(({ construct }) => construct === 'body-agent-reference')).toHaveLength(
      0,
    );
  });

  // A sibling package's agent is deliberately not resolvable here. This test
  // pins the known blind spot so widening it later is a visible change.
  test('does not resolve a scoped cross-package reference', () => {
    const { detected } = detect({
      agent: [agent('agents/vault-reader.md', 'vault-reader')],
      skill: [skill('Dispatch @librarian:vault-reader for the lookup.')],
    });

    expect(detected.filter(({ construct }) => construct === 'body-agent-reference')).toHaveLength(
      0,
    );
  });

  // `@path/to/file` belongs to the file-reference family, whose matcher requires
  // a path separator on purpose. The two families must stay disjoint.
  test('leaves a path-shaped @reference to the file-reference family', () => {
    const { detected } = detect({
      agent: [agent('agents/references.md', 'references')],
      skill: [skill('Read @references/vault-conventions.md first.')],
    });

    const constructs = detected.map(({ construct }) => construct);
    expect(constructs).toContain('body-file-reference');
    expect(constructs).not.toContain('body-agent-reference');
  });

  test('reports nothing on Claude, which registers the agent it names', () => {
    const { detected, unknown } = detect(
      {
        agent: [agent('agents/vault-reader.md', 'vault-reader')],
        skill: [skill('Complex restructuring goes to @vault-reader.')],
      },
      'claude',
    );

    expect(detected.filter(({ construct }) => construct === 'body-agent-reference')).toHaveLength(
      0,
    );
    expect(unknown.filter(({ family }) => family === 'agent-reference')).toHaveLength(0);
  });

  test('scans an agent body for references to its siblings', () => {
    const { detected } = detect({
      agent: [
        agent('agents/vault-reader.md', 'vault-reader'),
        {
          path: 'agents/curator.md',
          content: '---\nname: curator\n---\n\nDelegate reads to @vault-reader.\n',
        },
      ],
    });

    const references = detected.filter(({ construct }) => construct === 'body-agent-reference');
    expect(references).toHaveLength(1);
    expect(references[0]?.sourcePath).toBe('agents/curator.md');
  });
});

describe('agent-reference capability rows', () => {
  test('Claude registers a package’s agents on both surfaces it projects', () => {
    expect(supportFor('claude', 'skill', 'agent-reference')).toBe('supported');
    expect(supportFor('claude', 'agent', 'agent-reference')).toBe('supported');
  });

  // L-010: codex-cli 0.155.1 registers no agent role from a plugin package, so
  // the loss is unconditional and therefore inside the declared-loss gate.
  test('Codex accepts it on no surface', () => {
    expect(supportFor('codex', 'skill', 'agent-reference')).toBe('unsupported');
    expect(supportFor('codex', 'agent', 'agent-reference')).toBe('unsupported');
    expect(supportFor('codex', 'prompt', 'agent-reference')).toBe('unsupported');
  });

  test('every remaining target that projects no agent artifact rejects it', () => {
    expect(supportFor('opencode', 'skill', 'agent-reference')).toBe('unsupported');
    expect(supportFor('pi', 'skill', 'agent-reference')).toBe('unsupported');
    expect(supportFor('claude-chat', 'skill', 'agent-reference')).toBe('unsupported');
  });
});

describe('findConstructShapes', () => {
  test('matches no agent reference when given no declared names', () => {
    expect(findConstructShapes('Ask @vault-reader.')).toEqual([]);
  });

  test('matches one per occurrence, with its line', () => {
    const shapes = findConstructShapes(
      'Ask @vault-reader.\nThen ask @vault-reader again.',
      new Set(['vault-reader']),
    );

    expect(shapes).toHaveLength(2);
    expect(shapes.map(({ line }) => line)).toEqual([1, 2]);
    expect(shapes.every(({ family }) => family === 'agent-reference')).toBe(true);
  });
});

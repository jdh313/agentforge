import { describe, expect, test } from 'bun:test';
import { parseAgentBehavior, parseCommandBehavior } from 'agentforge/agent-command';

describe('canonical agent and command behaviors', () => {
  test('parses agent execution semantics while retaining source metadata', () => {
    const source = `---
description: Inspect the vault.
model: sonnet
maxTurns: 10
tools: [Read, Grep]
color: green
---
# Vault reader
`;

    expect(parseAgentBehavior('/plugins/librarian/agents/vault-reader.md', source)).toEqual({
      kind: 'agent',
      name: 'vault-reader',
      description: 'Inspect the vault.',
      instructions: '# Vault reader\n',
      source,
      sourceFrontmatter: {
        description: 'Inspect the vault.',
        model: 'sonnet',
        maxTurns: 10,
        tools: ['Read', 'Grep'],
        color: 'green',
      },
      execution: {
        model: 'sonnet',
        maxTurns: 10,
        tools: ['Read', 'Grep'],
      },
    });
  });

  test('parses command invocation semantics', () => {
    const source = `---
description: Dispatch spec-flow.
argument-hint: <subcommand> [args]
allowed-tools: [Skill]
---
# Spec flow
`;

    expect(parseCommandBehavior('/plugins/spec-flow/commands/spec-flow.md', source)).toMatchObject({
      kind: 'command',
      name: 'spec-flow',
      description: 'Dispatch spec-flow.',
      instructions: '# Spec flow\n',
      invocation: {
        argumentHint: '<subcommand> [args]',
        allowedTools: ['Skill'],
      },
    });
  });
});

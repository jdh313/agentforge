import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import { claudeMarketplaceAdapter, codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import matter from 'gray-matter';
import {
  compileMarketplace,
  type DesiredCopiedOutput,
  type DesiredGeneratedOutput,
} from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';

const MARKETPLACE_FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'cc-marketplace',
  'MARKETPLACE.yaml',
);

describe('native marketplace adapters', () => {
  test('Claude compilation emits validated marketplace and plugin documents', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const plan = compileMarketplace(loaded, [
      claudeMarketplaceAdapter,
      { target: 'codex', compilePublication: () => ({ outputs: [] }) },
    ]);

    expect(plan.outputs.map(({ destination }) => destination)).toEqual([
      '.claude-plugin/marketplace.json',
      'packages/commit/.claude-plugin/plugin.json',
      'packages/commit/hooks/destructive-vcs-guard.sh',
      'packages/commit/hooks/hooks.json',
      'packages/commit/skills/commit/SKILL.md',
      'packages/craft/.claude-plugin/plugin.json',
      'packages/craft/skills/tdd/SKILL.md',
      'packages/librarian/.claude-plugin/plugin.json',
      'packages/librarian/agents/vault-reader.md',
      'packages/librarian/skills/wiki-query/SKILL.md',
      'packages/linear/.claude-plugin/plugin.json',
      'packages/linear/skills/linear/SKILL.md',
      'packages/spec-flow/.claude-plugin/plugin.json',
      'packages/spec-flow/LICENSE.txt',
      'packages/spec-flow/commands/spec-flow.md',
      'packages/spec-flow/hooks/hooks.json',
      'packages/spec-flow/native-hooks.json',
      'packages/spec-flow/skills/draft/SKILL.md',
      'packages/spec-flow/skills/draft/assets/logo.txt',
      'packages/spec-flow/skills/draft/references/contract.md',
      'packages/spec-flow/skills/draft/scripts/check.ts',
    ]);

    const marketplace = generatedDocument(plan.outputs, '.claude-plugin/marketplace.json');
    expect(marketplace).toEqual({
      name: 'cc-marketplace',
      description: 'Personal dual-runtime plugin marketplace',
      owner: {
        name: 'Jacob Hoehler',
        email: 'jacob@example.com',
      },
      plugins: [
        {
          name: 'commit',
          version: '3.2.1',
          description: 'Format-aware atomic commits for git and jj.',
          author: { name: 'Jacob Hoehler' },
          license: 'Apache-2.0',
          keywords: ['git', 'jj', 'commits'],
          source: './packages/commit',
        },
        {
          name: 'craft',
          version: '0.8.0',
          description: 'Software craftsmanship discipline skills.',
          author: { name: 'Jacob Hoehler' },
          license: 'Apache-2.0',
          keywords: ['engineering', 'design', 'review'],
          source: './packages/craft',
        },
        {
          name: 'librarian',
          version: '0.17.1',
          description: 'Full Claude-native Librarian package metadata',
          author: { name: 'Jacob Hoehler' },
          license: 'Apache-2.0',
          keywords: ['obsidian', 'knowledge-base', 'notes', 'curation'],
          source: './packages/librarian',
        },
        {
          name: 'linear',
          version: '0.4.1',
          description: 'Linear workflow conventions and ticket operations.',
          author: { name: 'Jacob Hoehler' },
          license: 'Apache-2.0',
          keywords: ['linear', 'issue-tracking', 'workflow'],
          source: './packages/linear',
        },
        {
          name: 'spec-flow',
          version: '0.12.2',
          description: 'Contract-driven change workflow.',
          author: { name: 'Jacob Hoehler' },
          license: 'Apache-2.0',
          keywords: ['sdlc', 'contracts', 'specification'],
          source: './packages/spec-flow',
        },
      ],
    });

    expect(
      generatedDocument(plan.outputs, 'packages/librarian/.claude-plugin/plugin.json'),
    ).toEqual({
      name: 'librarian',
      version: '0.17.1',
      description: 'Full Claude-native Librarian package metadata',
      author: { name: 'Jacob Hoehler' },
      license: 'Apache-2.0',
      keywords: ['obsidian', 'knowledge-base', 'notes', 'curation'],
    });
    expect(
      generatedOutput(plan.outputs, '.claude-plugin/marketplace.json').content.endsWith('\n'),
    ).toBe(true);
  });

  test('Codex compilation emits validated marketplace and plugin documents', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const plan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    expect(plan.outputs.map(({ destination }) => destination)).toEqual([
      '.agents/plugins/marketplace.json',
      'packages/commit/.codex-plugin/plugin.json',
      'packages/commit/skills/commit/SKILL.md',
      'packages/craft/.codex-plugin/plugin.json',
      'packages/craft/skills/tdd/SKILL.md',
      'packages/librarian/.codex-plugin/plugin.json',
      'packages/librarian/agents/vault-reader.md',
      'packages/librarian/skills/wiki-query/SKILL.md',
      'packages/linear/.codex-plugin/plugin.json',
      'packages/linear/skills/linear/SKILL.md',
      'packages/spec-flow/.codex-plugin/plugin.json',
      'packages/spec-flow/LICENSE.txt',
      'packages/spec-flow/config/defaults.json',
      'packages/spec-flow/skills/draft/SKILL.md',
      'packages/spec-flow/skills/draft/agents/openai.yaml',
      'packages/spec-flow/skills/draft/assets/logo.txt',
      'packages/spec-flow/skills/draft/references/contract.md',
      'packages/spec-flow/skills/draft/scripts/check.ts',
      'packages/spec-flow/skills/spec-flow/SKILL.md',
      'packages/spec-flow/skills/spec-flow/agents/openai.yaml',
    ]);

    expect(generatedDocument(plan.outputs, '.agents/plugins/marketplace.json')).toEqual({
      name: 'cc-marketplace',
      interface: { displayName: 'CC Marketplace' },
      plugins: [
        codexMarketplaceEntry('commit', 'Developer Tools'),
        codexMarketplaceEntry('craft', 'Developer Tools'),
        codexMarketplaceEntry('librarian', 'Productivity'),
        codexMarketplaceEntry('linear', 'Productivity'),
        codexMarketplaceEntry('spec-flow', 'Developer Tools'),
      ],
    });

    expect(generatedDocument(plan.outputs, 'packages/librarian/.codex-plugin/plugin.json')).toEqual(
      {
        name: 'librarian',
        version: '0.17.1',
        description: 'Curates and retrieves notes through shared workflows and isolated roles.',
        author: { name: 'Jacob Hoehler' },
        license: 'Apache-2.0',
        keywords: ['obsidian', 'knowledge-base', 'notes', 'curation'],
        interface: {
          displayName: 'Librarian',
          shortDescription: 'Curate and retrieve Obsidian knowledge',
          longDescription:
            'Capture, process, retrieve, and maintain notes through approval-gated workflows and isolated vault roles.',
          developerName: 'Jacob Hoehler',
          category: 'Productivity',
          capabilities: ['Read', 'Write', 'Interactive'],
          defaultPrompt: [
            'Search my knowledge base for this topic.',
            'Capture this as a structured note.',
            'Inspect my vault without changing anything.',
          ],
        },
      },
    );
    expect(
      copiedOutput(plan.outputs, 'packages/spec-flow/skills/draft/agents/openai.yaml').sourcePath,
    ).toEndWith('/packages/spec-flow/skills/draft/agents/openai.yaml');
  });

  test('compiles package skills, resources, passthrough payloads, and diagnostics', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const claudePlan = compileMarketplace(loaded, [
      claudeMarketplaceAdapter,
      { target: 'codex', compilePublication: () => ({ outputs: [] }) },
    ]);
    const codexPlan = compileMarketplace(loaded, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);

    const claudeSkill = generatedOutput(
      claudePlan.outputs,
      'packages/spec-flow/skills/draft/SKILL.md',
    );
    expect(matter(claudeSkill.content)).toMatchObject({
      data: {
        name: 'draft',
        description: 'Draft a change contract.',
        'allowed-tools': ['Read'],
      },
      content: '\n# Draft\n',
    });
    expect(
      copiedOutput(claudePlan.outputs, 'packages/spec-flow/hooks/hooks.json').sourcePath,
    ).toEndWith('/packages/spec-flow/hooks/hooks.json');
    expect(copiedOutput(claudePlan.outputs, 'packages/spec-flow/LICENSE.txt').sourcePath).toEndWith(
      '/packages/spec-flow/LICENSE.txt',
    );
    expect(
      copiedOutput(claudePlan.outputs, 'packages/spec-flow/native-hooks.json').sourcePath,
    ).toEndWith('/packages/spec-flow/hooks/hooks.json');
    expect(
      matter(
        generatedOutput(claudePlan.outputs, 'packages/librarian/agents/vault-reader.md').content,
      ).data,
    ).toMatchObject({
      name: 'vault-reader',
      description: 'Read and synthesize vault context without modifying it.',
      model: 'sonnet',
    });
    expect(
      matter(
        generatedOutput(claudePlan.outputs, 'packages/spec-flow/commands/spec-flow.md').content,
      ).data,
    ).toMatchObject({
      description: 'Drive a change through the spec-flow contract lifecycle.',
      'argument-hint': '<subcommand> [args]',
      'allowed-tools': ['Skill'],
    });
    expect(
      copiedOutput(claudePlan.outputs, 'packages/spec-flow/skills/draft/assets/logo.txt')
        .sourcePath,
    ).toEndWith('/packages/spec-flow/skills/draft/assets/logo.txt');
    expect(
      copiedOutput(claudePlan.outputs, 'packages/spec-flow/skills/draft/references/contract.md')
        .sourcePath,
    ).toEndWith('/packages/spec-flow/skills/draft/references/contract.md');
    expect(
      copiedOutput(claudePlan.outputs, 'packages/spec-flow/skills/draft/scripts/check.ts')
        .sourcePath,
    ).toEndWith('/packages/spec-flow/skills/draft/scripts/check.ts');

    const codexSkill = generatedOutput(
      codexPlan.outputs,
      'packages/spec-flow/skills/draft/SKILL.md',
    );
    expect(matter(codexSkill.content)).toMatchObject({
      data: {
        name: 'draft',
        description: 'Draft a change contract.',
      },
      content: '# Draft for Codex\n',
    });
    expect(
      codexPlan.outputs.some(
        ({ destination }) => destination === 'packages/spec-flow/hooks/hooks.json',
      ),
    ).toBe(false);
    expect(
      copiedOutput(codexPlan.outputs, 'packages/spec-flow/config/defaults.json').sourcePath,
    ).toEndWith('/packages/spec-flow/config/defaults.json');
    expect(
      generatedOutput(codexPlan.outputs, 'packages/librarian/agents/vault-reader.md').content,
    ).toBe('# Vault reader\n\nRead-only role procedure for inspecting the knowledge base.\n');
    expect(
      matter(
        generatedOutput(codexPlan.outputs, 'packages/spec-flow/skills/spec-flow/SKILL.md').content,
      ),
    ).toMatchObject({
      data: {
        name: 'spec-flow',
        description: 'Drive a change through the spec-flow contract lifecycle.',
      },
      content: expect.stringContaining('Dispatch the requested lifecycle operation'),
    });
    expect(
      Bun.YAML.parse(
        generatedOutput(codexPlan.outputs, 'packages/spec-flow/skills/spec-flow/agents/openai.yaml')
          .content,
      ),
    ).toEqual({
      interface: {
        display_name: 'Spec Flow',
        short_description: 'Drive a change through the spec-flow contract lifecycle.',
      },
      policy: { allow_implicit_invocation: false },
    });
    expect(codexPlan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'claude-only-frontmatter-stripped',
          severity: 'warning',
          provenance: expect.objectContaining({ packageId: 'spec-flow' }),
        }),
        expect.objectContaining({
          code: 'inferred-artifact-projection',
          severity: 'note',
          provenance: expect.objectContaining({ packageId: 'librarian' }),
          retainedSource: expect.objectContaining({ artifactType: 'agent' }),
        }),
        expect.objectContaining({
          code: 'inferred-artifact-projection',
          severity: 'note',
          provenance: expect.objectContaining({ packageId: 'spec-flow' }),
          retainedSource: expect.objectContaining({ artifactType: 'command' }),
        }),
        expect.objectContaining({
          code: 'unsupported-artifact-projection',
          severity: 'note',
          provenance: expect.objectContaining({ packageId: 'spec-flow' }),
          retainedSource: expect.objectContaining({ artifactType: 'hook' }),
        }),
      ]),
    );
  });

  test('rejects supplied collisions by default with producer diagnostics', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const specFlow = loaded.packages.get('spec-flow');
    if (!specFlow) throw new Error('missing spec-flow fixture');
    const packages = new Map(loaded.packages);
    packages.set('spec-flow', {
      ...specFlow,
      payloads: {
        ...specFlow.payloads,
        codex: [
          ...(specFlow.payloads.codex ?? []),
          {
            sourcePath: join(dirname(specFlow.path), 'config', 'defaults.json'),
            destination: 'skills/spec-flow/agents/openai.yaml',
            executable: false,
          },
        ],
      },
    });

    expect(() =>
      compileMarketplace({ ...loaded, packages }, [
        { target: 'claude', compilePublication: () => ({ outputs: [] }) },
        codexMarketplaceAdapter,
      ]),
    ).toThrow(
      'supplied output "packages/spec-flow/skills/spec-flow/agents/openai.yaml" collides with translated output for publication "codex", package "spec-flow"; set collision: override on the supplied payload to replace it',
    );
  });

  test('explicit supplied collision override replaces translated output deterministically', async () => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const specFlow = loaded.packages.get('spec-flow');
    if (!specFlow) throw new Error('missing spec-flow fixture');
    const packages = new Map(loaded.packages);
    packages.set('spec-flow', {
      ...specFlow,
      payloads: {
        ...specFlow.payloads,
        codex: [
          ...(specFlow.payloads.codex ?? []),
          {
            sourcePath: join(dirname(specFlow.path), 'config', 'defaults.json'),
            destination: 'skills/spec-flow/agents/openai.yaml',
            executable: false,
            collision: 'override',
          },
        ],
      },
    });

    const plan = compileMarketplace({ ...loaded, packages }, [
      { target: 'claude', compilePublication: () => ({ outputs: [] }) },
      codexMarketplaceAdapter,
    ]);
    const winner = copiedOutput(
      plan.outputs,
      'packages/spec-flow/skills/spec-flow/agents/openai.yaml',
    );
    const diagnostic = plan.diagnostics.find(({ code }) => code === 'supplied-output-override');

    expect({
      winner: {
        kind: winner.kind,
        producer: winner.producer,
        collision: winner.collision,
        destination: winner.destination,
      },
      diagnostic: diagnostic && {
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        publicationId: diagnostic.provenance.publicationId,
        packageId: diagnostic.provenance.packageId,
      },
    }).toMatchInlineSnapshot(`
      {
        "diagnostic": {
          "code": "supplied-output-override",
          "message": "Supplied payload replaced translated output at "packages/spec-flow/skills/spec-flow/agents/openai.yaml".",
          "packageId": "spec-flow",
          "publicationId": "codex",
          "severity": "note",
        },
        "winner": {
          "collision": "override",
          "destination": "packages/spec-flow/skills/spec-flow/agents/openai.yaml",
          "kind": "copy",
          "producer": "supplied",
        },
      }
    `);
  });

  test.each([
    ['claude', { description: 42 }, 'invalid Claude plugin document for package "librarian"'],
    [
      'codex',
      { interface: { displayName: 'Librarian', category: [] } },
      'invalid Codex plugin document for package "librarian"',
    ],
  ] as const)('rejects malformed %s native documents before planning', async (target, native, message) => {
    const loaded = await loadMarketplaceDefinition(MARKETPLACE_FIXTURE);
    const librarian = loaded.packages.get('librarian');
    if (!librarian) throw new Error('missing Librarian fixture');
    const packages = new Map(loaded.packages);
    packages.set('librarian', {
      ...librarian,
      definition: {
        ...librarian.definition,
        targets: {
          ...librarian.definition.targets,
          [target]: {
            ...librarian.definition.targets[target],
            native,
          },
        },
      },
    });

    expect(() =>
      compileMarketplace({ ...loaded, packages }, [
        claudeMarketplaceAdapter,
        codexMarketplaceAdapter,
      ]),
    ).toThrow(message);
  });
});

function codexMarketplaceEntry(name: string, category: string) {
  return {
    name,
    source: {
      source: 'local',
      path: `./packages/${name}`,
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    category,
  };
}

function generatedDocument(outputs: readonly unknown[], destination: string): unknown {
  return JSON.parse(generatedOutput(outputs, destination).content);
}

function generatedOutput(outputs: readonly unknown[], destination: string): DesiredGeneratedOutput {
  const output = outputs.find(
    (candidate): candidate is DesiredGeneratedOutput =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'kind' in candidate &&
      candidate.kind === 'generated' &&
      'destination' in candidate &&
      candidate.destination === destination,
  );
  if (!output) throw new Error(`missing generated output ${destination}`);
  return output;
}

function copiedOutput(outputs: readonly unknown[], destination: string): DesiredCopiedOutput {
  const output = outputs.find(
    (candidate): candidate is DesiredCopiedOutput =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'kind' in candidate &&
      candidate.kind === 'copy' &&
      'destination' in candidate &&
      candidate.destination === destination,
  );
  if (!output) throw new Error(`missing copied output ${destination}`);
  return output;
}

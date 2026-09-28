import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { parseAgentBehavior } from './agent-command.ts';
import { buildArtifactPlan } from './artifact-plan.ts';
import type {
  CompilationPackage,
  CompilationPlan,
  DesiredGeneratedOutput,
  ProposedCompilationDiagnostic,
  ProposedOutput,
} from './compiler.ts';
import { materializeCompilation, materializeCompilationOutputs } from './materializer.ts';
import { loadArtifactProjection, projectArtifact } from './render.ts';
import { CanonicalAgentName } from './schema.ts';
import { codexTomlString } from './targets/codex.ts';
import { getArtifactConfig } from './targets/index.ts';
import type { InstallScope } from './types.ts';

export const CODEX_AGENT_BUNDLE_INDEX = 'agentforge-codex-agent-bundle.json';
export const CODEX_AGENT_BUNDLE_DIRECTORY = '.agentforge/codex-agent-bundle';
const BUNDLE_SCHEMA = 'agentforge.codex-agent-bundle/v2';
const LEGACY_BUNDLE_SCHEMA = 'agentforge.codex-agent-bundle/v1';
const RECEIPT_SCHEMA = 'agentforge.codex-agent-receipt/v2';

const BundleAgent = z.strictObject({
  id: CanonicalAgentName,
  name: z.string().min(1),
  definition: z.string().regex(/^agents\/[a-z0-9]+(?:-[a-z0-9]+)*\.toml$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  execution: z.strictObject({
    model: z.discriminatedUnion('source', [
      z.strictObject({ source: z.literal('explicit'), value: z.string().min(1) }),
      z.strictObject({ source: z.literal('inherited') }),
    ]),
    effort: z.discriminatedUnion('source', [
      z.strictObject({
        source: z.literal('explicit'),
        value: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']),
      }),
      z.strictObject({ source: z.literal('inherited') }),
    ]),
  }),
  losses: z.array(z.enum(['tools', 'disallowedTools', 'permissionMode'])),
});
const BundleIndex = z.strictObject({
  schema: z.literal(BUNDLE_SCHEMA),
  package: z.strictObject({ id: CanonicalAgentName, version: z.string().min(1) }),
  agents: z.array(BundleAgent).min(1),
});
const LegacyBundleIndex = z.strictObject({
  schema: z.literal(LEGACY_BUNDLE_SCHEMA),
  package: z.strictObject({ id: CanonicalAgentName }),
  agent: z.strictObject({
    id: CanonicalAgentName,
    name: z.string().min(1),
    definition: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.toml$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
const Receipt = z.strictObject({
  schema: z.literal(RECEIPT_SCHEMA),
  owner: z.strictObject({ packageId: CanonicalAgentName, packageVersion: z.string().min(1) }),
  agents: z.array(BundleAgent).min(1),
});
export const CodexAgentBundleDocument = {
  role: 'generated-document' as const,
  grammar: 'json' as const,
  label: 'Codex agent bundle index',
  schema: BundleIndex,
};

// Limit the portable format to AgentForge's native role serializer. A digest
// proves bytes did not change; this schema proves those bytes remain a role we
// know how to install.
const CodexBundleDefinition = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().min(1).optional(),
  model_reasoning_effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional(),
  developer_instructions: z.string().min(1),
});

export interface CodexAgentBundleOutputs {
  outputs: ProposedOutput[];
  diagnostics: ProposedCompilationDiagnostic[];
}

/**
 * Compatibility producer retained for JUN-439 callers. New marketplace
 * packages should use `targets.codex.codex-agent-bundle: true`, which emits
 * the multi-agent v2 companion through the normal publication plan.
 */
export function compileCodexAgentBundle(options: {
  sourceDir: string;
  packageId: string;
  outputRoot: string;
}): {
  packageId: string;
  agentId: string;
  agentName: string;
  definitionPath: string;
  digest: string;
  indexPath: string;
  plan: CompilationPlan;
} {
  const packageId = CanonicalAgentName.parse(options.packageId);
  const sourceDir = resolve(options.sourceDir);
  const projection = loadArtifactProjection({ sourceDir, target: 'codex', artifact: 'agent' });
  const agentId = CanonicalAgentName.parse(projection.artifactName);
  const agentName = `${packageId}:${agentId}`;
  const artifact = buildArtifactPlan({
    sourceDir,
    target: 'codex',
    artifact: 'agent',
    publicationId: packageId,
    projection,
  });
  const generated = artifact.plan.outputs[0];
  if (!generated || generated.kind !== 'generated')
    throw new Error('Codex agent projection did not produce a generated TOML definition');
  const content = withCodexAgentName(generated.content, agentName);
  validateCodexDefinition(content, agentName);
  const digest = sha256(content);
  const index = {
    schema: LEGACY_BUNDLE_SCHEMA,
    package: { id: packageId },
    agent: { id: agentId, name: agentName, definition: `${agentId}.toml`, sha256: digest },
  };
  const provenance = {
    marketplacePath: join(sourceDir, 'AGENT.md'),
    publicationId: packageId,
    packageId,
  };
  const plan: CompilationPlan = {
    marketplaceId: packageId,
    outputs: [
      { ...generated, destination: `${agentId}.toml`, content, target: 'codex', provenance },
      {
        kind: 'generated',
        producer: 'generated',
        destination: CODEX_AGENT_BUNDLE_INDEX,
        content: `${JSON.stringify(index, null, 2)}\n`,
        target: 'codex',
        provenance,
      },
    ],
    diagnostics: artifact.plan.diagnostics,
    rootOutputs: [],
    redactions: [],
  };
  materializeCompilation(plan, resolve(options.outputRoot));
  return {
    packageId,
    agentId,
    agentName,
    definitionPath: `${agentId}.toml`,
    digest,
    indexPath: join(resolve(options.outputRoot), CODEX_AGENT_BUNDLE_INDEX),
    plan,
  };
}

/**
 * Build an opt-in companion bundle from the package compiler's loaded sources.
 * Marketplace agents continue to emit Markdown procedures under `agents/`;
 * this is a separate installable role bundle for the Codex role loader.
 */
export function compileCodexAgentBundleOutputs(
  packageInput: CompilationPackage,
  packageDirectory: string,
): CodexAgentBundleOutputs {
  const packageId = CanonicalAgentName.parse(packageInput.id);
  const packageVersion = z.string().min(1).parse(packageInput.metadata.version);
  const agents = packageInput.artifacts.get('agent') ?? [];
  if (agents.length === 0) {
    throw new Error(
      `package ${JSON.stringify(packageId)} opts into a Codex agent bundle but declares no agent artifacts`,
    );
  }
  const seen = new Set<string>();
  const compiled = agents
    .map((artifact) => {
      const projection = projectArtifact({
        sourcePath: artifact.path,
        source: artifact.content,
        target: 'codex',
        artifact: 'agent',
        resourcePaths: packageInput.files,
        authoringKeys: packageInput.authoringKeys,
      });
      const id = CanonicalAgentName.parse(projection.artifactName);
      if (seen.has(id))
        throw new Error(
          `package ${JSON.stringify(packageId)} has duplicate canonical agent id ${JSON.stringify(id)}`,
        );
      seen.add(id);
      assertNoUnresolvedResources(artifact.path, artifact.content);
      const name = `${packageId}:${id}`;
      const content = withCodexAgentName(projection.content, name);
      const definition = validateCodexDefinition(content, name);
      const source = parseAgentBehavior(artifact.path, artifact.content).sourceFrontmatter;
      return {
        id,
        name,
        definition: `agents/${id}.toml`,
        content,
        sha256: sha256(content),
        warnings: projection.warnings,
        execution: {
          model:
            definition.model === undefined
              ? { source: 'inherited' as const }
              : { source: 'explicit' as const, value: definition.model },
          effort:
            definition.model_reasoning_effort === undefined
              ? { source: 'inherited' as const }
              : { source: 'explicit' as const, value: definition.model_reasoning_effort },
        },
        losses: ['tools', 'disallowedTools', 'permissionMode'].filter(
          (field) => source[field] !== undefined,
        ),
      };
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));
  const bundleRoot = `${packageDirectory}/${CODEX_AGENT_BUNDLE_DIRECTORY}`;
  const index = {
    schema: BUNDLE_SCHEMA,
    package: { id: packageId, version: packageVersion },
    agents: compiled.map(({ id, name, definition, sha256: digest, execution, losses }) => ({
      id,
      name,
      definition,
      sha256: digest,
      execution,
      losses,
    })),
  };
  return {
    outputs: [
      ...compiled.map(({ definition, content }) => ({
        kind: 'generated' as const,
        packageId,
        destination: `${bundleRoot}/${definition}`,
        content,
      })),
      {
        kind: 'generated',
        packageId,
        destination: `${bundleRoot}/${CODEX_AGENT_BUNDLE_INDEX}`,
        content: `${JSON.stringify(index, null, 2)}\n`,
        nativeDocument: CodexAgentBundleDocument,
      },
    ],
    diagnostics: compiled.flatMap(({ id, warnings }) =>
      warnings.map((warning) => ({
        code: warning.kind,
        severity: 'warning' as const,
        packageId,
        message: `Codex role bundle agent ${JSON.stringify(id)}: ${warning.detail}.`,
        locations: warning.locations,
      })),
    ),
  };
}

function assertNoUnresolvedResources(sourcePath: string, source: string): void {
  const reference = (source.match(/(?:references|scripts|assets)\/[A-Za-z0-9._/-]+/g) ?? [])[0];
  if (reference)
    throw new Error(
      `${sourcePath}: Codex agent bundle cannot resolve package resource ${JSON.stringify(reference)} after installation; keep the package procedure or remove the reference`,
    );
}

export interface BuildCodexAgentBundleInstallPlanOptions {
  bundleRoot: string;
  scope: Extract<InstallScope, 'user' | 'project'>;
  projectRoot: string;
  homeDirectory?: string;
  codexHomeDirectory?: string;
}
export interface CodexAgentBundleInstallPlan {
  bundleRoot: string;
  destinationRoot: string;
  definitionPaths: readonly string[];
  receiptPath: string;
  registrationPath: string;
  agentNames: readonly string[];
  registrationWasPresent: ReadonlySet<string>;
  plan: CompilationPlan;
}

/** Read all index, definition, and registration state before a destination is writable. */
export function buildCodexAgentBundleInstallPlan(
  options: BuildCodexAgentBundleInstallPlanOptions,
): CodexAgentBundleInstallPlan {
  const bundleRoot = resolve(options.bundleRoot);
  const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
  const index = parseBundleIndex(indexPath);
  const definitions = index.agents.map((agent) => {
    const content = readRegularText(
      join(bundleRoot, agent.sourceDefinition),
      `bundle definition ${agent.id}`,
    );
    if (sha256(content) !== agent.sha256)
      throw new Error(
        `bundle definition digest does not match ${CODEX_AGENT_BUNDLE_INDEX}: ${agent.id}`,
      );
    const definition = validateCodexDefinition(content, agent.name);
    if (index.format === 'v2') validateExecutionProvenance(agent, definition);
    return { ...agent, content, description: definition.description };
  });
  const config = getArtifactConfig('codex', 'agent');
  const location = config?.installLocations[options.scope];
  if (!location)
    throw new Error(`Codex does not support ${options.scope}-scope agent installation`);
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const agentsRoot = location({
    homeDirectory,
    ...(options.codexHomeDirectory === undefined
      ? {}
      : { codexHomeDirectory: resolve(options.codexHomeDirectory) }),
    projectRoot: resolve(options.projectRoot),
  });
  const destinationRoot = resolve(agentsRoot, '..');
  const registrationPath = 'config.toml';
  const registration = buildRoleRegistrations(join(destinationRoot, registrationPath), definitions);
  const receiptPath = `agents/.agentforge/${index.package.id}.json`;
  const receipt = {
    schema: RECEIPT_SCHEMA,
    owner: { packageId: index.package.id, packageVersion: index.package.version },
    agents: index.agents,
  };
  const provenance = {
    marketplacePath: indexPath,
    publicationId: index.package.id,
    packageId: index.package.id,
  };
  const outputs: DesiredGeneratedOutput[] = [
    ...definitions.map(({ definition, content }) => ({
      kind: 'generated' as const,
      producer: 'generated' as const,
      destination: definition,
      content,
      target: 'codex' as const,
      provenance,
    })),
    {
      kind: 'generated',
      producer: 'generated',
      destination: receiptPath,
      content: `${JSON.stringify(receipt, null, 2)}\n`,
      target: 'codex',
      provenance,
    },
    {
      kind: 'generated',
      producer: 'generated',
      destination: registrationPath,
      content: registration.content,
      target: 'codex',
      provenance,
    },
  ];
  return {
    bundleRoot,
    destinationRoot,
    definitionPaths: definitions.map(({ definition }) => definition),
    receiptPath,
    registrationPath,
    agentNames: definitions.map(({ name }) => name),
    registrationWasPresent: registration.present,
    plan: {
      marketplaceId: index.package.id,
      outputs,
      diagnostics: [],
      rootOutputs: [],
      redactions: [],
    },
  };
}

export function materializeCodexAgentBundleInstallPlan(install: CodexAgentBundleInstallPlan): void {
  validateCodexAgentBundleInstallPlan(install);
  materializeCompilationOutputs(install.plan, install.destinationRoot);
}

export function validateCodexAgentBundleInstallPlan(install: CodexAgentBundleInstallPlan): void {
  const receiptPath = join(install.destinationRoot, install.receiptPath);
  const receiptEntry = lstatSync(receiptPath, { throwIfNoEntry: false });
  const definitions = install.definitionPaths.map((path) =>
    lstatSync(join(install.destinationRoot, path), { throwIfNoEntry: false }),
  );
  const count = definitions.filter(Boolean).length;
  if (count === 0 && !receiptEntry) {
    if (install.registrationWasPresent.size > 0)
      throw new Error(
        'refusing bundle collision: existing Codex role registration has no bundle receipt',
      );
    return;
  }
  if (count !== definitions.length || !receiptEntry)
    throw new Error(
      'refusing bundle collision: definitions and ownership receipt must appear together',
    );
  if (!receiptEntry.isFile() || definitions.some((entry) => !entry?.isFile()))
    throw new Error(
      'refusing bundle collision: managed definitions and receipt must be regular files',
    );
  let received: z.infer<typeof Receipt>;
  try {
    received = Receipt.parse(JSON.parse(readFileSync(receiptPath, 'utf8')));
  } catch {
    throw new Error('refusing bundle collision: ownership receipt is invalid');
  }
  const expected = install.plan.outputs.find(
    (output) => output.destination === install.receiptPath,
  );
  if (!expected || expected.kind !== 'generated')
    throw new Error('bundle install plan is missing its receipt');
  if (JSON.stringify(received) !== JSON.stringify(Receipt.parse(JSON.parse(expected.content))))
    throw new Error(
      'refusing bundle collision: destination belongs to another bundle owner or version',
    );
}

interface ParsedBundleIndex {
  format: 'v1' | 'v2';
  package: { id: string; version: string };
  agents: Array<{
    id: string;
    name: string;
    definition: string;
    sourceDefinition: string;
    sha256: string;
    execution: z.infer<typeof BundleAgent>['execution'];
    losses: z.infer<typeof BundleAgent>['losses'];
  }>;
}
function parseBundleIndex(path: string): ParsedBundleIndex {
  let document: unknown;
  try {
    document = JSON.parse(readRegularText(path, 'bundle index'));
  } catch {
    throw new Error('bundle index is invalid: invalid JSON');
  }
  const legacy = LegacyBundleIndex.safeParse(document);
  if (legacy.success) {
    const agent = legacy.data.agent;
    if (agent.name !== `${legacy.data.package.id}:${agent.id}`)
      throw new Error(
        'bundle index is invalid: agent name must match package and canonical agent identities',
      );
    if (agent.definition !== `${agent.id}.toml`)
      throw new Error('bundle index is invalid: definition must match canonical agent identity');
    return {
      format: 'v1',
      package: { id: legacy.data.package.id, version: 'legacy-v1' },
      agents: [
        {
          ...agent,
          definition: `agents/${agent.id}.toml`,
          sourceDefinition: agent.definition,
          execution: { model: { source: 'inherited' }, effort: { source: 'inherited' } },
          losses: [],
        },
      ],
    };
  }
  let index: z.infer<typeof BundleIndex>;
  try {
    index = BundleIndex.parse(document);
  } catch (cause) {
    throw new Error(
      `bundle index is invalid: ${cause instanceof Error ? cause.message : 'invalid JSON'}`,
    );
  }
  const ids = index.agents.map(({ id }) => id);
  if (new Set(ids).size !== ids.length)
    throw new Error('bundle index is invalid: duplicate agent id');
  if (ids.join('\0') !== [...ids].sort().join('\0'))
    throw new Error('bundle index is invalid: agents must be sorted by id');
  for (const agent of index.agents) {
    if (agent.name !== `${index.package.id}:${agent.id}`)
      throw new Error(
        'bundle index is invalid: agent name must match package and canonical agent identities',
      );
    if (agent.definition !== `agents/${agent.id}.toml`)
      throw new Error('bundle index is invalid: definition must match canonical agent identity');
  }
  return {
    format: 'v2',
    package: index.package,
    agents: index.agents.map((agent) => ({ ...agent, sourceDefinition: agent.definition })),
  };
}

function validateExecutionProvenance(
  agent: ParsedBundleIndex['agents'][number],
  definition: z.infer<typeof CodexBundleDefinition>,
): void {
  const expectedModel =
    definition.model === undefined
      ? { source: 'inherited' as const }
      : { source: 'explicit' as const, value: definition.model };
  const expectedEffort =
    definition.model_reasoning_effort === undefined
      ? { source: 'inherited' as const }
      : { source: 'explicit' as const, value: definition.model_reasoning_effort };
  if (JSON.stringify(agent.execution.model) !== JSON.stringify(expectedModel)) {
    throw new Error(`bundle index execution.model does not match definition for ${agent.id}`);
  }
  if (JSON.stringify(agent.execution.effort) !== JSON.stringify(expectedEffort)) {
    throw new Error(`bundle index execution.effort does not match definition for ${agent.id}`);
  }
}
function readRegularText(path: string, label: string): string {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry?.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  return readFileSync(path, 'utf8');
}
function validateCodexDefinition(
  content: string,
  expectedName: string,
): z.infer<typeof CodexBundleDefinition> {
  let document: unknown;
  try {
    document = Bun.TOML.parse(content);
  } catch {
    throw new Error('bundle definition is not valid TOML');
  }
  const parsed = CodexBundleDefinition.safeParse(document);
  if (!parsed.success)
    throw new Error('bundle definition has unsupported or invalid Codex role fields');
  if (parsed.data.name !== expectedName)
    throw new Error('bundle definition does not match indexed Codex agent name');
  return parsed.data;
}
function buildRoleRegistrations(
  configPath: string,
  definitions: readonly { name: string; definition: string; description: string }[],
): { content: string; present: ReadonlySet<string> } {
  const entry = lstatSync(configPath, { throwIfNoEntry: false });
  const content = entry ? readRegularText(configPath, 'Codex role configuration') : '';
  let parsed: unknown = {};
  try {
    if (content) parsed = Bun.TOML.parse(content);
  } catch {
    throw new Error(`Codex role configuration is not valid TOML: ${configPath}`);
  }
  const agents =
    parsed && typeof parsed === 'object' && 'agents' in parsed
      ? (parsed as { agents?: unknown }).agents
      : undefined;
  if (agents !== undefined && (!agents || typeof agents !== 'object'))
    throw new Error(`Codex role configuration has invalid agents table: ${configPath}`);
  const present = new Set<string>();
  const additions: string[] = [];
  for (const agent of definitions) {
    const current =
      agents && typeof agents === 'object'
        ? (agents as Record<string, unknown>)[agent.name]
        : undefined;
    if (current === undefined) {
      if (/^\s*agents\s*=\s*\{/m.test(content))
        throw new Error(
          `Codex role configuration uses an inline agents table and cannot register ${agent.name}`,
        );
      additions.push(registrationText(configPath, agent));
    } else if (
      !current ||
      typeof current !== 'object' ||
      (current as { config_file?: unknown }).config_file !== agent.definition
    )
      throw new Error(`Codex role registration already exists for ${agent.name}`);
    else present.add(agent.name);
  }
  const next =
    additions.length === 0
      ? content
      : `${content}${content.endsWith('\n') || content.length === 0 ? '' : '\n'}${additions.join('')}`;
  try {
    Bun.TOML.parse(next);
  } catch {
    throw new Error(`Codex role registration would make configuration invalid TOML: ${configPath}`);
  }
  return { content: next, present };
}
function registrationText(
  path: string,
  agent: { name: string; definition: string; description: string },
): string {
  return [
    `[agents.${codexTomlString(agent.name, path, 'agent name')}]`,
    `config_file = ${codexTomlString(agent.definition, path, 'config_file')}`,
    `description = ${codexTomlString(agent.description, path, 'description')}`,
    '',
  ].join('\n');
}
function withCodexAgentName(content: string, name: string): string {
  const next = content.replace(/^name = .*$/m, `name = ${JSON.stringify(name)}`);
  if (next === content) throw new Error('Codex agent projection did not emit a name field');
  return next;
}
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { buildArtifactPlan } from './artifact-plan.ts';
import type { CompilationPlan, DesiredGeneratedOutput } from './compiler.ts';
import { materializeCompilation, materializeCompilationOutputs } from './materializer.ts';
import { loadArtifactProjection } from './render.ts';
import { CanonicalAgentName } from './schema.ts';
import { codexTomlString } from './targets/codex.ts';
import { getArtifactConfig } from './targets/index.ts';
import type { InstallScope } from './types.ts';

export const CODEX_AGENT_BUNDLE_INDEX = 'agentforge-codex-agent-bundle.json';
const BUNDLE_SCHEMA = 'agentforge.codex-agent-bundle/v1';
const RECEIPT_SCHEMA = 'agentforge.codex-agent-receipt/v1';

const BundleIndex = z.strictObject({
  schema: z.literal(BUNDLE_SCHEMA),
  package: z.strictObject({ id: CanonicalAgentName }),
  agent: z.strictObject({
    id: CanonicalAgentName,
    name: z.string().min(1),
    definition: z.string().regex(/^[a-z0-9-]+\.toml$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

const Receipt = z.strictObject({
  schema: z.literal(RECEIPT_SCHEMA),
  owner: z.strictObject({ packageId: CanonicalAgentName, agentId: CanonicalAgentName }),
  definition: z.strictObject({
    name: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

// v1 bundles contain exactly the fields produced by the native Codex role
// serializer. Rejecting other role fields here keeps a digest-valid bundle from
// reaching Codex with values its own loader rejects.
const CodexBundleDefinition = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().min(1).optional(),
  model_reasoning_effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional(),
  developer_instructions: z.string().min(1),
});

export interface CompiledCodexAgentBundle {
  packageId: string;
  agentId: string;
  agentName: string;
  definitionPath: string;
  digest: string;
  indexPath: string;
  plan: CompilationPlan;
}

export interface CompileCodexAgentBundleOptions {
  sourceDir: string;
  packageId: string;
  outputRoot: string;
}

/** Compile one canonical agent into a portable, self-validating Codex bundle. */
export function compileCodexAgentBundle(
  options: CompileCodexAgentBundleOptions,
): CompiledCodexAgentBundle {
  const packageId = CanonicalAgentName.parse(options.packageId);
  const sourceDir = resolve(options.sourceDir);
  const outputRoot = resolve(options.outputRoot);
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
  const definition = artifact.plan.outputs[0];
  if (!definition || definition.kind !== 'generated') {
    throw new Error('Codex agent projection did not produce a generated TOML definition');
  }
  const content = withCodexAgentName(definition.content, agentName);
  validateCodexDefinition(content, agentName);
  const digest = sha256(content);
  const definitionPath = `${agentId}.toml`;
  const index = {
    schema: BUNDLE_SCHEMA,
    package: { id: packageId },
    agent: { id: agentId, name: agentName, definition: definitionPath, sha256: digest },
  };
  const provenance = {
    marketplacePath: join(sourceDir, 'AGENT.md'),
    publicationId: packageId,
    packageId,
  };
  const outputs: DesiredGeneratedOutput[] = [
    { ...definition, destination: definitionPath, content, provenance },
    {
      kind: 'generated',
      producer: 'generated',
      destination: CODEX_AGENT_BUNDLE_INDEX,
      content: `${JSON.stringify(index, null, 2)}\n`,
      target: 'codex',
      provenance,
    },
  ];
  const plan: CompilationPlan = {
    marketplaceId: packageId,
    outputs: outputs.toSorted((left, right) => left.destination.localeCompare(right.destination)),
    diagnostics: artifact.plan.diagnostics,
    rootOutputs: [],
    redactions: [],
  };
  materializeCompilation(plan, outputRoot);
  return {
    packageId,
    agentId,
    agentName,
    definitionPath,
    digest,
    indexPath: join(outputRoot, CODEX_AGENT_BUNDLE_INDEX),
    plan,
  };
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
  definitionPath: string;
  receiptPath: string;
  registrationPath: string;
  agentName: string;
  registrationWasPresent: boolean;
  plan: CompilationPlan;
}

/** Load and validate compiled bytes before deriving any destination or writing it. */
export function buildCodexAgentBundleInstallPlan(
  options: BuildCodexAgentBundleInstallPlanOptions,
): CodexAgentBundleInstallPlan {
  const bundleRoot = resolve(options.bundleRoot);
  const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
  const index = parseBundleIndex(indexPath);
  const definitionPath = join(bundleRoot, index.agent.definition);
  const content = readRegularText(definitionPath, 'bundle definition');
  if (sha256(content) !== index.agent.sha256) {
    throw new Error(`bundle definition digest does not match ${CODEX_AGENT_BUNDLE_INDEX}`);
  }
  const definition = validateCodexDefinition(content, index.agent.name);

  const config = getArtifactConfig('codex', 'agent');
  const location = config?.installLocations[options.scope];
  if (!location)
    throw new Error(`Codex does not support ${options.scope}-scope agent installation`);
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const codexHomeDirectory =
    options.codexHomeDirectory === undefined ? undefined : resolve(options.codexHomeDirectory);
  const agentsRoot = location({
    homeDirectory,
    ...(codexHomeDirectory === undefined ? {} : { codexHomeDirectory }),
    projectRoot: resolve(options.projectRoot),
  });
  // The role definition and its required config registration share one scope
  // root. Planning both paths lets the existing planned-file materializer
  // preserve all other agents and config bytes while replacing only these
  // three resolved paths.
  const destinationRoot = resolve(agentsRoot, '..');
  const definitionDestination = join('agents', index.agent.definition);
  const receiptPath = join('agents', '.agentforge', `${index.package.id}--${index.agent.id}.json`);
  const registrationPath = 'config.toml';
  const registration = buildRoleRegistration({
    configPath: join(destinationRoot, registrationPath),
    agentName: index.agent.name,
    definitionPath: definitionDestination,
    description: definition.description,
  });
  const provenance = {
    marketplacePath: indexPath,
    publicationId: index.package.id,
    packageId: index.agent.id,
  };
  const receipt = {
    schema: RECEIPT_SCHEMA,
    owner: { packageId: index.package.id, agentId: index.agent.id },
    definition: { name: index.agent.name, sha256: index.agent.sha256 },
  };
  const outputs: DesiredGeneratedOutput[] = [
    {
      kind: 'generated',
      producer: 'generated',
      destination: definitionDestination,
      content,
      target: 'codex',
      provenance,
    },
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
    definitionPath: definitionDestination,
    receiptPath,
    registrationPath,
    agentName: index.agent.name,
    registrationWasPresent: registration.wasPresent,
    plan: {
      marketplaceId: index.package.id,
      outputs,
      diagnostics: [],
      rootOutputs: [],
      redactions: [],
    },
  };
}

/** Install only after collision ownership is established from the receipt. */
export function materializeCodexAgentBundleInstallPlan(install: CodexAgentBundleInstallPlan): void {
  validateCodexAgentBundleInstallPlan(install);
  materializeCompilationOutputs(install.plan, install.destinationRoot);
}

/** Read-only collision preflight shared by preview and installation. */
export function validateCodexAgentBundleInstallPlan(install: CodexAgentBundleInstallPlan): void {
  const definition = join(install.destinationRoot, install.definitionPath);
  const receipt = join(install.destinationRoot, install.receiptPath);
  const definitionEntry = lstatSync(definition, { throwIfNoEntry: false });
  const receiptEntry = lstatSync(receipt, { throwIfNoEntry: false });
  if (!definitionEntry && !receiptEntry) {
    if (install.registrationWasPresent) {
      throw new Error(
        `refusing bundle collision at ${definition}: existing Codex role registration has no bundle receipt`,
      );
    }
    return;
  }
  if (!definitionEntry || !receiptEntry) {
    throw new Error(
      `refusing bundle collision at ${definition}: definition and ownership receipt must appear together`,
    );
  }
  if (!definitionEntry.isFile() || !receiptEntry.isFile()) {
    throw new Error(
      `refusing bundle collision at ${definition}: managed definition and receipt must be regular files`,
    );
  }
  let receiptJson: unknown;
  try {
    receiptJson = JSON.parse(readFileSync(receipt, 'utf8'));
  } catch {
    throw new Error(`refusing bundle collision at ${definition}: ownership receipt is invalid`);
  }
  const parsed = Receipt.safeParse(receiptJson);
  if (!parsed.success)
    throw new Error(`refusing bundle collision at ${definition}: ownership receipt is invalid`);
  const expected = install.plan.outputs.find(
    (output) => output.destination === install.receiptPath,
  );
  if (!expected || expected.kind !== 'generated')
    throw new Error('bundle install plan is missing its receipt');
  const incoming = JSON.parse(expected.content) as z.infer<typeof Receipt>;
  if (
    parsed.data.owner.packageId !== incoming.owner.packageId ||
    parsed.data.owner.agentId !== incoming.owner.agentId
  ) {
    throw new Error(
      `refusing bundle collision at ${definition}: destination belongs to another bundle owner`,
    );
  }
}

function parseBundleIndex(indexPath: string): z.infer<typeof BundleIndex> {
  const text = readRegularText(indexPath, 'bundle index');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`bundle index is not valid JSON: ${indexPath}`);
  }
  const parsed = BundleIndex.safeParse(json);
  if (!parsed.success)
    throw new Error(`bundle index is invalid: ${parsed.error.issues[0]?.message}`);
  if (parsed.data.agent.name !== `${parsed.data.package.id}:${parsed.data.agent.id}`) {
    throw new Error(
      'bundle index is invalid: agent name must match its package and agent identities',
    );
  }
  if (parsed.data.agent.definition !== `${parsed.data.agent.id}.toml`) {
    throw new Error('bundle index is invalid: definition must match its agent identity');
  }
  return parsed.data;
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
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(content);
  } catch {
    throw new Error('bundle definition is not valid TOML');
  }
  const definition = CodexBundleDefinition.safeParse(parsed);
  if (!definition.success) {
    throw new Error('bundle definition has unsupported or invalid Codex role fields');
  }
  if (definition.data.name !== expectedName) {
    throw new Error('bundle definition does not match the indexed Codex agent name');
  }
  return definition.data;
}

function buildRoleRegistration(options: {
  configPath: string;
  agentName: string;
  definitionPath: string;
  description: string;
}): { content: string; wasPresent: boolean } {
  const entry = lstatSync(options.configPath, { throwIfNoEntry: false });
  if (!entry) {
    return { content: registrationText(options), wasPresent: false };
  }
  if (!entry.isFile()) {
    throw new Error(`Codex role configuration must be a regular file: ${options.configPath}`);
  }
  const content = readFileSync(options.configPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(content);
  } catch {
    throw new Error(`Codex role configuration is not valid TOML: ${options.configPath}`);
  }
  const agents =
    parsed && typeof parsed === 'object' && 'agents' in parsed
      ? (parsed as { agents?: unknown }).agents
      : undefined;
  const role =
    agents && typeof agents === 'object'
      ? (agents as Record<string, unknown>)[options.agentName]
      : undefined;
  if (role === undefined) {
    if (/^\s*agents\s*=\s*\{/m.test(content)) {
      throw new Error(
        `Codex role configuration uses an inline agents table and cannot register ${options.agentName}`,
      );
    }
    const next = `${content}${content.endsWith('\n') || content.length === 0 ? '' : '\n'}${registrationText(options)}`;
    validateCombinedRoleConfiguration(next, options.configPath);
    return {
      content: next,
      wasPresent: false,
    };
  }
  if (
    !role ||
    typeof role !== 'object' ||
    (role as { config_file?: unknown }).config_file !== options.definitionPath
  ) {
    throw new Error(`Codex role registration already exists for ${options.agentName}`);
  }
  return { content, wasPresent: true };
}

function validateCombinedRoleConfiguration(content: string, configPath: string): void {
  try {
    Bun.TOML.parse(content);
  } catch {
    throw new Error(`Codex role registration would make configuration invalid TOML: ${configPath}`);
  }
}

function registrationText(options: {
  configPath: string;
  agentName: string;
  definitionPath: string;
  description: string;
}): string {
  return [
    `[agents.${codexTomlString(options.agentName, options.configPath, 'agent name')}]`,
    `config_file = ${codexTomlString(options.definitionPath, options.configPath, 'config_file')}`,
    `description = ${codexTomlString(options.description, options.configPath, 'description')}`,
    '',
  ].join('\n');
}

function withCodexAgentName(content: string, name: string): string {
  const replaced = content.replace(/^name = .*$/m, `name = ${JSON.stringify(name)}`);
  if (replaced === content) throw new Error('Codex agent projection did not emit a name field');
  return replaced;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

import { createHash } from 'node:crypto';
import { accessSync, constants, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
import {
  assertAnchorUnchanged,
  createManagedOutputLock,
  locateManagedDestination,
  type ManagedOutputAnchor,
  materializeCompilation,
  materializeCompilationOutputChanges,
  materializeCompilationOutputs,
} from './materializer.ts';
import { isContainedPath } from './paths.ts';
import { loadArtifactProjection, projectArtifact } from './render.ts';
import { CanonicalAgentName } from './schema.ts';
import { codexTomlString } from './targets/codex.ts';
import { getArtifactConfig } from './targets/index.ts';
import type { InstallScope } from './types.ts';

export const CODEX_AGENT_BUNDLE_INDEX = 'agentforge-codex-agent-bundle.json';
export const CODEX_AGENT_BUNDLE_DIRECTORY = '.agentforge/codex-agent-bundle';
const BUNDLE_SCHEMA = 'agentforge.codex-agent-bundle/v2';
const LEGACY_BUNDLE_SCHEMA = 'agentforge.codex-agent-bundle/v1';
const RECEIPT_SCHEMA = 'agentforge.codex-agent-receipt/v3';
const LIFECYCLE_JOURNAL_SCHEMA = 'agentforge.codex-agent-lifecycle-journal/v4';
// The lock and journal live at the logical scope root, which is always a real
// directory, so a repointed `agents` link can never hide an interrupted
// operation. The receipt stays under `agents/` because it travels with the
// definitions it describes.
const LIFECYCLE_SCOPE_LOCK = '.agentforge/.agentforge-lifecycle.lock';
// Where releases before the relocation kept it; still honored so an operation
// interrupted by an older build keeps blocking and stays repairable.
const LEGACY_LIFECYCLE_SCOPE_LOCK = 'agents/.agentforge/.agentforge-lifecycle.lock';

const BundleAgent = z.strictObject({
  id: CanonicalAgentName,
  name: z.string().min(1),
  definition: z
    .string()
    .regex(/^agents\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?[a-z0-9]+(?:-[a-z0-9]+)*\.toml$/),
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
const ReceiptAgent = z.strictObject({
  id: CanonicalAgentName,
  name: z.string().min(1),
  destination: z
    .string()
    .regex(/^agents\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?[a-z0-9]+(?:-[a-z0-9]+)*\.toml$/),
  installedSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const Receipt = z.strictObject({
  schema: z.literal(RECEIPT_SCHEMA),
  owner: z.strictObject({ packageId: CanonicalAgentName, packageVersion: z.string().min(1) }),
  agents: z.array(ReceiptAgent).min(1),
});
const LifecycleJournal = z.strictObject({
  schema: z.literal(LIFECYCLE_JOURNAL_SCHEMA),
  operation: z.enum(['update', 'remove']),
  owner: z.strictObject({ packageId: CanonicalAgentName }),
  scope: z.enum(['user', 'project']),
  before: z.array(
    z.strictObject({
      destination: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      content: z.string(),
    }),
  ),
  receipt: z.string().min(1),
  unresolved: z.array(ReceiptAgent),
  absent: z.array(z.string().min(1)),
  after: z.array(z.strictObject({ destination: z.string().min(1), content: z.string() })),
  removals: z.array(z.string().min(1)),
  // Each followed anchor's resolved target when the journal was written. Absent
  // on journals from builds that never followed links.
  anchors: z
    .strictObject({ config: z.string().min(1).optional(), agents: z.string().min(1).optional() })
    .optional(),
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
        definition: packageDefinitionPath(packageId, id),
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
  registrationWasEdited: ReadonlySet<string>;
  registrationConflicts: ReadonlySet<string>;
  anchors: CodexScopeAnchors;
  plan: CompilationPlan;
}

export type CodexAgentBundleCheckStatus =
  | 'current'
  | 'missing'
  | 'edited'
  | 'conflicted'
  | 'unsupported';

export interface CodexAgentBundleCheckIssue {
  status: Exclude<CodexAgentBundleCheckStatus, 'current'>;
  path: string;
  message: string;
}

export interface CodexAgentBundleCheckResult {
  destinationRoot: string;
  filesChecked: readonly string[];
  status: CodexAgentBundleCheckStatus;
  issues: readonly CodexAgentBundleCheckIssue[];
}

/** Read all index, definition, and registration state before a destination is writable. */
export function buildCodexAgentBundleInstallPlan(
  options: BuildCodexAgentBundleInstallPlanOptions,
): CodexAgentBundleInstallPlan {
  const bundleRoot = resolve(options.bundleRoot);
  assertSafeDirectory(bundleRoot, 'bundle root');
  const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
  const index = parseBundleIndex(indexPath);
  const definitions = index.agents.map((agent) => {
    const content = readContainedRegularText(
      bundleRoot,
      agent.sourceDefinition,
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
  assertSafeDestinationRoot(destinationRoot);
  const anchors = resolveScopeAnchors(destinationRoot);
  const registrationPath = 'config.toml';
  const registration = buildRoleRegistrations(
    join(destinationRoot, registrationPath),
    physicalPath(destinationRoot, anchors, registrationPath),
    definitions,
  );
  const receiptPath = `agents/.agentforge/${index.package.id}.json`;
  const receipt = {
    schema: RECEIPT_SCHEMA,
    owner: { packageId: index.package.id, packageVersion: index.package.version },
    agents: definitions.map(({ id, name, definition, sha256: digest }) => ({
      id,
      name,
      destination: definition,
      installedSha256: digest,
    })),
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
    registrationWasEdited: registration.edited,
    registrationConflicts: registration.conflicts,
    anchors,
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
  assertNoIncompleteLifecycle(install.destinationRoot, install.anchors);
  assertAnchorsUnchanged(install.anchors);
  const check = checkCodexAgentBundleInstallPlan(install);
  if (check.status === 'current') return;
  if (check.status !== 'missing' || !isEmptyCodexAgentBundleInstall(install)) {
    const issue = check.issues[0];
    throw new Error(
      `refusing bundle collision: ${issue?.message ?? 'installed bundle state is unsupported'}`,
    );
  }
  createManagedOutputLock(
    install.destinationRoot,
    LIFECYCLE_SCOPE_LOCK,
    '{"schema":"agentforge.codex-agent-install-lock/v1"}\n',
  );
  runThenCleanup(
    () => {
      assertAnchorsUnchanged(install.anchors);
      const lockedCheck = checkCodexAgentBundleInstallPlan(install);
      if (lockedCheck.status !== 'missing' || !isEmptyCodexAgentBundleInstall(install)) {
        const issue = lockedCheck.issues[0];
        throw new Error(
          `refusing bundle collision: ${issue?.message ?? 'installed bundle state is unsupported'}`,
        );
      }
      materializeCompilationOutputs(install.plan, install.destinationRoot, {
        privateDestinations: ['config.toml'],
        anchors: managedAnchors(install.anchors),
      });
    },
    () =>
      materializeCompilationOutputChanges(
        {
          marketplaceId: install.plan.marketplaceId,
          outputs: [],
          diagnostics: [],
          rootOutputs: [],
          redactions: [],
        },
        install.destinationRoot,
        [LIFECYCLE_SCOPE_LOCK],
      ),
  );
}

export function validateCodexAgentBundleInstallPlan(install: CodexAgentBundleInstallPlan): void {
  assertNoIncompleteLifecycle(install.destinationRoot, install.anchors);
  const check = checkCodexAgentBundleInstallPlan(install);
  if (
    check.status === 'current' ||
    (check.status === 'missing' && isEmptyCodexAgentBundleInstall(install))
  )
    return;
  const issue = check.issues[0];
  throw new Error(
    `refusing bundle collision: ${issue?.message ?? 'installed bundle state is unsupported'}`,
  );
}

function isEmptyCodexAgentBundleInstall(install: CodexAgentBundleInstallPlan): boolean {
  return (
    !lstatSync(physicalPath(install.destinationRoot, install.anchors, install.receiptPath), {
      throwIfNoEntry: false,
    }) &&
    install.definitionPaths.every(
      (path) =>
        !lstatSync(physicalPath(install.destinationRoot, install.anchors, path), {
          throwIfNoEntry: false,
        }),
    ) &&
    install.registrationWasPresent.size === 0 &&
    install.registrationWasEdited.size === 0 &&
    install.registrationConflicts.size === 0
  );
}

/**
 * Read only installed-state check. A wholly empty `missing` destination is
 * installable; partial missing state and every other non-current status block
 * installation so managed edits are never silently overwritten.
 */
export function checkCodexAgentBundleInstallPlan(
  install: CodexAgentBundleInstallPlan,
): CodexAgentBundleCheckResult {
  const filesChecked = [...install.definitionPaths, install.receiptPath, install.registrationPath];
  const issues: CodexAgentBundleCheckIssue[] = [];
  const add = (
    status: CodexAgentBundleCheckIssue['status'],
    path: string,
    message: string,
  ): void => {
    issues.push({ status, path: join(install.destinationRoot, path), message });
  };

  for (const name of install.registrationConflicts) {
    add('conflicted', install.registrationPath, `role registration already exists for ${name}`);
  }
  for (const name of install.registrationWasEdited) {
    add('edited', install.registrationPath, `managed role registration differs for ${name}`);
  }
  const receiptPath = physicalPath(install.destinationRoot, install.anchors, install.receiptPath);
  const receiptEntry = lstatSync(receiptPath, { throwIfNoEntry: false });
  const definitionEntries = install.definitionPaths.map((path) => ({
    path,
    entry: lstatSync(physicalPath(install.destinationRoot, install.anchors, path), {
      throwIfNoEntry: false,
    }),
  }));
  for (const path of [...install.definitionPaths, install.receiptPath, install.registrationPath]) {
    if (hasUnsafeManagedParent(install.destinationRoot, install.anchors, path)) {
      add('unsupported', path, 'managed output parent must be a real directory');
    }
  }
  if (issues.length > 0)
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  const anyDefinitions = definitionEntries.some(({ entry }) => entry !== undefined);
  const irregular = definitionEntries.find(({ entry }) => entry && !entry.isFile());
  if (irregular) {
    add('unsupported', irregular.path, 'managed definition must be a regular file');
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  }

  if (!receiptEntry && !anyDefinitions) {
    if (install.registrationWasPresent.size > 0) {
      for (const name of install.registrationWasPresent) {
        add(
          'conflicted',
          install.registrationPath,
          `existing role registration has no bundle receipt: ${name}`,
        );
      }
    } else {
      add('missing', install.receiptPath, 'ownership receipt is missing');
    }
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  }
  if (!receiptEntry) {
    add('conflicted', install.receiptPath, 'definitions have no ownership receipt');
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  }
  for (const { path, entry } of definitionEntries) {
    if (!entry) add('missing', path, 'managed definition is missing');
  }
  for (const name of install.agentNames) {
    if (
      !install.registrationWasPresent.has(name) &&
      !install.registrationWasEdited.has(name) &&
      !install.registrationConflicts.has(name)
    ) {
      add('missing', install.registrationPath, `role registration is missing for ${name}`);
    }
  }
  if (!receiptEntry.isFile()) {
    add('unsupported', install.receiptPath, 'ownership receipt must be a regular file');
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  }
  let received: z.infer<typeof Receipt>;
  try {
    received = Receipt.parse(JSON.parse(readFileSync(receiptPath, 'utf8')));
  } catch {
    add('unsupported', install.receiptPath, 'ownership receipt is invalid or unsupported');
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  }
  const expected = expectedReceipt(install);
  if (JSON.stringify(received) !== JSON.stringify(expected)) {
    add(
      'conflicted',
      install.receiptPath,
      'destination belongs to another bundle owner or version',
    );
    return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
  }
  for (const agent of received.agents) {
    const installed = physicalPath(install.destinationRoot, install.anchors, agent.destination);
    if (!lstatSync(installed, { throwIfNoEntry: false })) {
      continue;
    }
    const content = readFileSync(installed, 'utf8');
    if (sha256(content) !== agent.installedSha256) {
      add('edited', agent.destination, 'managed definition differs from its ownership receipt');
    }
  }
  return checkResult(install.destinationRoot, install.anchors, filesChecked, issues);
}

function hasUnsafeManagedParent(
  root: string,
  anchors: CodexScopeAnchors,
  proposed: string,
): boolean {
  const { destination, parentRoot } = locateManagedDestination(
    root,
    managedAnchors(anchors),
    proposed,
  );
  let current = dirname(destination);
  // A parent outside its own walk root is never safe, and the walk must not
  // run past the filesystem root looking for a base it cannot reach.
  if (current !== parentRoot && !isContainedPath(parentRoot, current)) return true;
  while (current !== parentRoot && current !== dirname(current)) {
    const entry = lstatSync(current, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink() || (entry && !entry.isDirectory())) return true;
    current = dirname(current);
  }
  return false;
}

function expectedReceipt(install: CodexAgentBundleInstallPlan): z.infer<typeof Receipt> {
  const expected = install.plan.outputs.find(
    (output) => output.destination === install.receiptPath,
  );
  if (!expected || expected.kind !== 'generated')
    throw new Error('bundle install plan is missing its receipt');
  return Receipt.parse(JSON.parse(expected.content));
}

function checkResult(
  destinationRoot: string,
  anchors: CodexScopeAnchors,
  filesChecked: readonly string[],
  issues: readonly CodexAgentBundleCheckIssue[],
): CodexAgentBundleCheckResult {
  const status = issues.some(({ status }) => status === 'unsupported')
    ? 'unsupported'
    : issues.some(({ status }) => status === 'conflicted')
      ? 'conflicted'
      : issues.some(({ status }) => status === 'edited')
        ? 'edited'
        : issues.some(({ status }) => status === 'missing')
          ? 'missing'
          : filesChecked.every((path) =>
                lstatSync(physicalPath(destinationRoot, anchors, path), {
                  throwIfNoEntry: false,
                }),
              )
            ? 'current'
            : 'missing';
  return { destinationRoot, filesChecked, status, issues };
}

export interface BuildCodexAgentBundleRemovePlanOptions {
  packageId: string;
  scope: Extract<InstallScope, 'user' | 'project'>;
  projectRoot: string;
  homeDirectory?: string;
  codexHomeDirectory?: string;
}

export interface CodexAgentBundleLifecycleAction {
  kind: 'create' | 'replace' | 'remove' | 'preserve';
  path: string;
  reason: string;
}
export interface CodexAgentBundleLifecycleIssue {
  path: string;
  message: string;
}
export interface CodexAgentBundleLifecyclePreview {
  operation: 'update' | 'remove';
  status: 'ready' | 'refused' | 'interrupted';
  actions: readonly CodexAgentBundleLifecycleAction[];
  issues: readonly CodexAgentBundleLifecycleIssue[];
}
interface LifecyclePrecondition {
  destination: string;
  sha256: string;
  content: string;
}
export interface CodexAgentBundleLifecyclePlan extends CodexAgentBundleLifecyclePreview {
  destinationRoot: string;
  anchors: CodexScopeAnchors;
  journalPath: string;
  scope: Extract<InstallScope, 'user' | 'project'>;
  plan: CompilationPlan;
  removals: readonly string[];
  preconditions: readonly LifecyclePrecondition[];
  unresolved: readonly z.infer<typeof ReceiptAgent>[];
  absences: readonly string[];
  receiptContent?: string;
}

/** Build a receipt-owned update. It never treats a missing receipt as permission to replace files. */
export function buildCodexAgentBundleUpdatePlan(
  options: BuildCodexAgentBundleInstallPlanOptions,
): CodexAgentBundleLifecyclePlan {
  let next: CodexAgentBundleInstallPlan;
  try {
    next = buildCodexAgentBundleInstallPlan(options);
  } catch (cause) {
    if (!(cause instanceof CodexScopeAnchorError)) throw cause;
    const index = parseBundleIndex(join(resolve(options.bundleRoot), CODEX_AGENT_BUNDLE_INDEX));
    return anchorRefusal(
      {
        operation: 'update',
        destinationRoot: resolveCodexAgentDestination(options),
        scope: options.scope,
        packageId: index.package.id,
        receiptPath: `agents/.agentforge/${index.package.id}.json`,
      },
      cause,
    );
  }
  const receipt = expectedReceipt(next);
  const definitions = next.plan.outputs
    .filter(
      (output): output is DesiredGeneratedOutput =>
        output.kind === 'generated' &&
        output.destination.startsWith('agents/') &&
        output.destination.endsWith('.toml'),
    )
    .map((output) => {
      const definition = output.destination;
      const parsed = parseCodexDefinition(output.content);
      const prefix = `${receipt.owner.packageId}:`;
      if (!parsed.name.startsWith(prefix))
        throw new Error('bundle definition does not match indexed Codex agent name');
      const id = CanonicalAgentName.parse(parsed.name.slice(prefix.length));
      if (!isPackageDefinitionPath(receipt.owner.packageId, id, definition))
        throw new Error('bundle definition does not use a supported package definition path');
      if (parsed.name !== `${receipt.owner.packageId}:${id}`)
        throw new Error('bundle definition does not match indexed Codex agent name');
      return {
        id,
        name: parsed.name,
        definition,
        content: output.content,
        sha256: sha256(output.content),
        description: parsed.description,
      };
    });
  // The role name is independently verified by buildCodexAgentBundleInstallPlan;
  // reparse here only to carry the current definition description into config.
  return buildLifecyclePlan({
    operation: 'update',
    destinationRoot: next.destinationRoot,
    scope: options.scope,
    packageId: receipt.owner.packageId,
    receiptPath: next.receiptPath,
    anchors: next.anchors,
    newDefinitions: definitions,
    nextOwner: receipt.owner,
  });
}

/** Build a receipt-owned removal without loading a new bundle. */
export function buildCodexAgentBundleRemovePlan(
  options: BuildCodexAgentBundleRemovePlanOptions,
): CodexAgentBundleLifecyclePlan {
  const packageId = CanonicalAgentName.parse(options.packageId);
  const destinationRoot = resolveCodexAgentDestination(options);
  const receiptPath = `agents/.agentforge/${packageId}.json`;
  let anchors: CodexScopeAnchors;
  try {
    anchors = resolveScopeAnchors(destinationRoot);
  } catch (cause) {
    return anchorRefusal(
      { operation: 'remove', destinationRoot, scope: options.scope, packageId, receiptPath },
      cause,
    );
  }
  return buildLifecyclePlan({
    operation: 'remove',
    destinationRoot,
    scope: options.scope,
    packageId,
    receiptPath,
    anchors,
    newDefinitions: [],
  });
}

export function previewCodexAgentBundleLifecyclePlan(
  lifecycle: CodexAgentBundleLifecyclePlan,
): CodexAgentBundleLifecyclePreview {
  return {
    operation: lifecycle.operation,
    status: lifecycle.status,
    actions: lifecycle.actions,
    issues: lifecycle.issues,
  };
}

/** Apply a ready lifecycle plan. A persisted journal makes a later invocation refuse until repair. */
export function materializeCodexAgentBundleLifecyclePlan(
  lifecycle: CodexAgentBundleLifecyclePlan,
): void {
  if (lifecycle.status !== 'ready') throw lifecycleRefusal(lifecycle);
  if (
    lifecycle.actions.length === 0 &&
    lifecycle.preconditions.length === 0 &&
    lifecycle.absences.length === 0
  )
    return;
  verifyLifecyclePreconditions(lifecycle);
  createManagedOutputLock(
    lifecycle.destinationRoot,
    lifecycle.journalPath,
    journalContent(lifecycle),
    {
      mode: 0o600,
    },
  );
  // A failed final-state mutation leaves the journal in place. It prevents a
  // later operation from guessing whether the earlier operation reached its end.
  verifyLifecyclePreconditions(lifecycle);
  materializeLifecycleFinalState(lifecycle);
  materializeCompilationOutputChanges(
    emptyLifecyclePlan(lifecycle),
    lifecycle.destinationRoot,
    [lifecycle.journalPath],
    { anchors: managedAnchors(lifecycle.anchors) },
  );
}

/** Complete an interrupted operation only from an exact prior state or exact final state. */
export function repairCodexAgentBundleLifecyclePlan(
  lifecycle: CodexAgentBundleLifecyclePlan,
): void {
  if (lifecycle.status !== 'interrupted') throw lifecycleRefusal(lifecycle);
  if (
    lifecycle.plan.outputs.length === 0 &&
    lifecycle.preconditions.length === 0 &&
    lifecycle.absences.length === 0
  )
    throw lifecycleRefusal(lifecycle);
  assertAnchorsUnchanged(lifecycle.anchors);
  if (lifecyclePreconditionsHold(lifecycle)) {
    materializeLifecycleFinalState(lifecycle);
  } else if (lifecycleBeforeReceiptStateHolds(lifecycle)) {
    materializeLifecycleReceipt(lifecycle);
  } else if (!lifecycleFinalStateHolds(lifecycle)) {
    throw new Error(
      `refusing lifecycle repair: interrupted managed state is ambiguous; inspect ${join(lifecycle.destinationRoot, lifecycle.journalPath)} and restore either its recorded before paths or after paths before retrying`,
    );
  }
  materializeCompilationOutputChanges(
    emptyLifecyclePlan(lifecycle),
    lifecycle.destinationRoot,
    [lifecycle.journalPath],
    { anchors: managedAnchors(lifecycle.anchors) },
  );
}

function materializeLifecycleFinalState(lifecycle: CodexAgentBundleLifecyclePlan): void {
  const receipt = lifecycle.plan.outputs.filter((output) => output.destination.endsWith('.json'));
  const prior: CompilationPlan = {
    ...lifecycle.plan,
    outputs: lifecycle.plan.outputs.filter((output) => !receipt.includes(output)),
  };
  materializeCompilationOutputChanges(prior, lifecycle.destinationRoot, lifecycle.removals, {
    privateDestinations: ['config.toml'],
    anchors: managedAnchors(lifecycle.anchors),
  });
  if (receipt.length > 0) {
    materializeCompilationOutputChanges(
      { ...lifecycle.plan, outputs: receipt },
      lifecycle.destinationRoot,
      [],
      { anchors: managedAnchors(lifecycle.anchors) },
    );
  }
}

function materializeLifecycleReceipt(lifecycle: CodexAgentBundleLifecyclePlan): void {
  const receipt = lifecycle.plan.outputs.filter((output) => output.destination.endsWith('.json'));
  if (receipt.length !== 1) throw new Error('interrupted lifecycle has no final ownership receipt');
  materializeCompilationOutputChanges(
    { ...lifecycle.plan, outputs: receipt },
    lifecycle.destinationRoot,
    [],
    { anchors: managedAnchors(lifecycle.anchors) },
  );
}

/** A lifecycle plan refused because a followed link cannot be used; it names the link, not the receipt. */
function anchorRefusal(
  input: {
    operation: 'update' | 'remove';
    destinationRoot: string;
    scope: Extract<InstallScope, 'user' | 'project'>;
    packageId: string;
    receiptPath: string;
  },
  cause: unknown,
): CodexAgentBundleLifecyclePlan {
  return {
    operation: input.operation,
    destinationRoot: input.destinationRoot,
    anchors: {},
    scope: input.scope,
    journalPath: LIFECYCLE_SCOPE_LOCK,
    plan: emptyLifecyclePlan(input),
    removals: [],
    preconditions: [],
    unresolved: [],
    absences: [],
    status: 'refused',
    actions: [],
    issues: [
      {
        path:
          cause instanceof CodexScopeAnchorError
            ? cause.link
            : join(input.destinationRoot, input.receiptPath),
        message: cause instanceof Error ? cause.message : 'scope anchors are unsupported',
      },
    ],
  };
}

function buildLifecyclePlan(input: {
  operation: 'update' | 'remove';
  destinationRoot: string;
  scope: Extract<InstallScope, 'user' | 'project'>;
  packageId: string;
  receiptPath: string;
  anchors: CodexScopeAnchors;
  newDefinitions: readonly OwnedDefinition[];
  nextOwner?: { packageId: string; packageVersion: string };
}): CodexAgentBundleLifecyclePlan {
  const anchors = input.anchors;
  let locks: string[];
  try {
    locks = presentLifecycleLocks(input.destinationRoot, anchors);
  } catch (cause) {
    return {
      ...anchorRefusal(input, cause),
      anchors,
      issues: [
        {
          path: join(input.destinationRoot, '.agentforge'),
          message: cause instanceof Error ? cause.message : 'lifecycle lock is unsupported',
        },
      ],
    };
  }
  const journalPath = locks[0] ?? LIFECYCLE_SCOPE_LOCK;
  const base = {
    operation: input.operation,
    destinationRoot: input.destinationRoot,
    anchors,
    scope: input.scope,
    journalPath,
    plan: emptyLifecyclePlan(input),
    removals: [] as readonly string[],
    preconditions: [] as readonly LifecyclePrecondition[],
    unresolved: [] as readonly z.infer<typeof ReceiptAgent>[],
    absences: [] as readonly string[],
  };
  if (locks.length > 1) {
    return {
      ...base,
      status: 'interrupted',
      actions: [],
      issues: [
        {
          path: join(input.destinationRoot, locks[1] ?? journalPath),
          message: `this scope holds lifecycle locks at both ${locks.join(' and ')}; inspect and remove the stale one by hand`,
        },
      ],
    };
  }
  if (locks.length === 1) {
    try {
      const saved = readLifecycleJournal(input.destinationRoot, anchors, journalPath);
      const moved = anchorMismatch(input.destinationRoot, anchors, saved.anchors);
      if (moved) {
        return {
          ...base,
          status: 'interrupted',
          actions: [],
          issues: [{ path: moved.link, message: moved.message }],
        };
      }
      if (
        saved.operation !== input.operation ||
        saved.owner.packageId !== input.packageId ||
        saved.scope !== input.scope
      ) {
        return {
          ...base,
          status: 'interrupted',
          actions: [],
          issues: [
            {
              path: join(input.destinationRoot, journalPath),
              message: 'this scope is locked by another lifecycle operation',
            },
          ],
        };
      }
      return lifecycleFromJournal(input.destinationRoot, anchors, journalPath, saved);
    } catch (cause) {
      return {
        ...base,
        status: 'interrupted',
        actions: [],
        issues: [
          {
            path: join(input.destinationRoot, journalPath),
            message: cause instanceof Error ? cause.message : 'lifecycle journal is invalid',
          },
        ],
      };
    }
  }
  try {
    const receiptFile = physicalPath(input.destinationRoot, anchors, input.receiptPath);
    if (!lstatSync(receiptFile, { throwIfNoEntry: false })) {
      if (input.operation === 'remove') {
        return { ...base, status: 'ready', actions: [], issues: [] };
      }
      throw new Error('ownership receipt is missing');
    }
    const receiptContent = readRegularText(receiptFile, 'ownership receipt');
    const receipt = Receipt.parse(JSON.parse(receiptContent));
    if (receipt.owner.packageId !== input.packageId)
      throw new Error('ownership receipt belongs to another package');
    const inspected = inspectOwnedDefinitions(input.destinationRoot, anchors, receipt);
    const configPath = join(input.destinationRoot, 'config.toml');
    const configContent = readRegularText(
      physicalPath(input.destinationRoot, anchors, 'config.toml'),
      'Codex role configuration',
    );
    const registration = inspectOwnedRegistrations(configPath, configContent, inspected.owned);
    const oldDefinitions = registration.owned;
    const unresolvedDestinations = new Set(
      [...inspected.unresolved, ...registration.unresolved].map(({ destination }) => destination),
    );
    const unresolved = receipt.agents.filter(({ destination }) =>
      unresolvedDestinations.has(destination),
    );
    if (input.operation === 'update' && unresolved.length > 0) {
      throw new Error(
        'managed bundle has unresolved or user-edited roles; update preserves them without mutation',
      );
    }
    const unresolvedIds = new Set(unresolved.map(({ id }) => id));
    const effectiveNewDefinitions = input.newDefinitions.filter(({ id }) => !unresolvedIds.has(id));
    for (const definition of effectiveNewDefinitions) {
      if (oldDefinitions.some(({ definition: old }) => old === definition.definition)) continue;
      if (
        lstatSync(physicalPath(input.destinationRoot, anchors, definition.definition), {
          throwIfNoEntry: false,
        })
      ) {
        throw new Error(`unowned definition already exists at ${definition.definition}`);
      }
    }
    const nextConfig = rewriteOwnedRegistrations(
      configPath,
      configContent,
      oldDefinitions,
      effectiveNewDefinitions,
    );
    const provenance = {
      marketplacePath: join(input.destinationRoot, input.receiptPath),
      publicationId: input.packageId,
      packageId: input.packageId,
    };
    const nextReceipt = {
      schema: RECEIPT_SCHEMA,
      owner: input.operation === 'update' ? (input.nextOwner ?? receipt.owner) : receipt.owner,
      agents: [...unresolved, ...effectiveNewDefinitions].map(receiptAgentFromDefinition),
    };
    const outputs: DesiredGeneratedOutput[] = [
      ...effectiveNewDefinitions.map(({ definition, content }) => ({
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
        destination: 'config.toml',
        content: nextConfig,
        target: 'codex',
        provenance,
      },
      ...(input.operation === 'update' || unresolved.length > 0
        ? [
            {
              kind: 'generated' as const,
              producer: 'generated' as const,
              destination: input.receiptPath,
              content: `${JSON.stringify(nextReceipt, null, 2)}\n`,
              target: 'codex' as const,
              provenance,
            },
          ]
        : []),
    ];
    const removals = [
      ...oldDefinitions
        .filter(
          ({ definition }) =>
            !effectiveNewDefinitions.some((next) => next.definition === definition),
        )
        .map(({ definition }) => definition),
      ...(input.operation === 'remove' && unresolved.length === 0 ? [input.receiptPath] : []),
    ];
    const plan: CompilationPlan = {
      marketplaceId: input.packageId,
      outputs,
      diagnostics: [],
      rootOutputs: [],
      redactions: [],
    };
    const preconditions = [
      ...oldDefinitions.map(({ definition, content }) => ({
        destination: definition,
        sha256: sha256(content),
        content,
      })),
      {
        destination: input.receiptPath,
        sha256: sha256(receiptContent),
        content: receiptContent,
      },
      { destination: 'config.toml', sha256: sha256(configContent), content: configContent },
    ];
    const preconditionDestinations = new Set(preconditions.map(({ destination }) => destination));
    const absences = outputs
      .map(({ destination }) => destination)
      .filter((destination) => !preconditionDestinations.has(destination));
    return {
      ...base,
      status: 'ready',
      actions: [
        ...lifecycleActions(input.destinationRoot, anchors, outputs, removals),
        ...unresolved.map((agent) => ({
          kind: 'preserve' as const,
          path: join(input.destinationRoot, agent.destination),
          reason: 'receipt ownership is unresolved or user-edited',
        })),
      ],
      issues: [],
      plan,
      removals,
      preconditions,
      unresolved,
      absences,
      receiptContent,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'ownership state is unsupported';
    return {
      ...base,
      status: 'refused',
      actions: [],
      issues: [{ path: join(input.destinationRoot, input.receiptPath), message }],
    };
  }
}

interface OwnedDefinition {
  id: string;
  name: string;
  definition: string;
  content: string;
  sha256: string;
  description: string;
}

function resolveCodexAgentDestination(
  options: Pick<
    BuildCodexAgentBundleInstallPlanOptions,
    'scope' | 'projectRoot' | 'homeDirectory' | 'codexHomeDirectory'
  >,
): string {
  const config = getArtifactConfig('codex', 'agent');
  const location = config?.installLocations[options.scope];
  if (!location)
    throw new Error(`Codex does not support ${options.scope}-scope agent installation`);
  const agentsRoot = location({
    homeDirectory: resolve(options.homeDirectory ?? homedir()),
    ...(options.codexHomeDirectory === undefined
      ? {}
      : { codexHomeDirectory: resolve(options.codexHomeDirectory) }),
    projectRoot: resolve(options.projectRoot),
  });
  const destinationRoot = resolve(agentsRoot, '..');
  assertSafeDestinationRoot(destinationRoot);
  return destinationRoot;
}

function inspectOwnedDefinitions(
  destinationRoot: string,
  anchors: CodexScopeAnchors,
  receipt: z.infer<typeof Receipt>,
): { owned: OwnedDefinition[]; unresolved: z.infer<typeof ReceiptAgent>[] } {
  assertReceiptIdentities(receipt);
  const seen = new Set<string>();
  const owned: OwnedDefinition[] = [];
  const unresolved: z.infer<typeof ReceiptAgent>[] = [];
  for (const agent of receipt.agents) {
    if (
      agent.name !== `${receipt.owner.packageId}:${agent.id}` ||
      !isPackageDefinitionPath(receipt.owner.packageId, agent.id, agent.destination) ||
      seen.has(agent.id)
    ) {
      throw new Error('ownership receipt has inconsistent agent identity');
    }
    seen.add(agent.id);
    try {
      const path = physicalPath(destinationRoot, anchors, agent.destination);
      const content = readRegularText(path, `managed definition ${agent.id}`);
      if (sha256(content) !== agent.installedSha256)
        throw new Error(`managed definition differs from its ownership receipt: ${agent.id}`);
      const definition = validateCodexDefinition(content, agent.name);
      owned.push({
        id: agent.id,
        name: agent.name,
        definition: agent.destination,
        content,
        sha256: agent.installedSha256,
        description: definition.description,
      });
    } catch {
      unresolved.push(agent);
    }
  }
  return { owned, unresolved };
}

function assertReceiptIdentities(receipt: z.infer<typeof Receipt>): void {
  const ids = new Set<string>();
  const destinations = new Set<string>();
  for (const agent of receipt.agents) {
    if (
      agent.name !== `${receipt.owner.packageId}:${agent.id}` ||
      !isPackageDefinitionPath(receipt.owner.packageId, agent.id, agent.destination) ||
      ids.has(agent.id) ||
      destinations.has(agent.destination)
    ) {
      throw new Error('ownership receipt has inconsistent agent identity');
    }
    ids.add(agent.id);
    destinations.add(agent.destination);
  }
}

function inspectOwnedRegistrations(
  configPath: string,
  content: string,
  definitions: readonly OwnedDefinition[],
): { owned: OwnedDefinition[]; unresolved: z.infer<typeof ReceiptAgent>[] } {
  const parsed = parseRoleConfiguration(configPath, content);
  const agents = parsed.agents;
  const owned: OwnedDefinition[] = [];
  const unresolved: z.infer<typeof ReceiptAgent>[] = [];
  for (const definition of definitions) {
    const current = agents[definition.name];
    if (
      !current ||
      typeof current !== 'object' ||
      (current as { config_file?: unknown }).config_file !== definition.definition ||
      (current as { description?: unknown }).description !== definition.description ||
      Object.keys(current).some((key) => key !== 'config_file' && key !== 'description')
    ) {
      unresolved.push(receiptAgentFromDefinition(definition));
    } else owned.push(definition);
  }
  return { owned, unresolved };
}

function receiptAgentFromDefinition(
  definition: OwnedDefinition | z.infer<typeof ReceiptAgent>,
): z.infer<typeof ReceiptAgent> {
  return 'destination' in definition
    ? definition
    : {
        id: definition.id,
        name: definition.name,
        destination: definition.definition,
        installedSha256: definition.sha256,
      };
}

function rewriteOwnedRegistrations(
  configPath: string,
  content: string,
  oldDefinitions: readonly OwnedDefinition[],
  newDefinitions: readonly OwnedDefinition[],
): string {
  let next = content;
  for (const definition of oldDefinitions) {
    const rewritten = removeRoleRegistration(next, definition.name);
    if (rewritten === undefined)
      throw new Error(`managed role registration has unresolved formatting for ${definition.name}`);
    next = rewritten;
  }
  const registration = buildRoleRegistrationContent(configPath, next, newDefinitions);
  if (registration.conflicts.size > 0 || registration.edited.size > 0) {
    const name = [...registration.conflicts, ...registration.edited][0];
    throw new Error(`unowned role registration already exists for ${name}`);
  }
  return registration.content;
}

/** Remove one semantic role table while preserving every unrelated config byte. */
function removeRoleRegistration(content: string, name: string): string | undefined {
  const lines = content.split(/(?<=\n)/);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(
      /^\s*\[\s*agents\s*\.\s*("(?:\\.|[^"\\])*"|'[^']*')\s*\]\s*(?:#.*)?(?:\r?\n)?$/,
    );
    if (!match) continue;
    try {
      if ((Bun.TOML.parse(`value = ${match[1]}`) as { value?: unknown }).value === name) {
        start = index;
        break;
      }
    } catch {
      // The full configuration parser reports malformed TOML before this helper is reached.
    }
  }
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end] ?? '')) end += 1;
  return [...lines.slice(0, start), ...lines.slice(end)].join('');
}

function lifecycleActions(
  destinationRoot: string,
  anchors: CodexScopeAnchors,
  outputs: readonly DesiredGeneratedOutput[],
  removals: readonly string[],
): CodexAgentBundleLifecycleAction[] {
  return [
    ...outputs.map((output) => {
      const path = join(destinationRoot, output.destination);
      const physical = physicalPath(destinationRoot, anchors, output.destination);
      const entry = lstatSync(physical, { throwIfNoEntry: false });
      return {
        kind: !entry
          ? 'create'
          : entry.isFile() && readFileSync(physical, 'utf8') === output.content
            ? 'preserve'
            : 'replace',
        path,
        reason: entry ? 'managed output changes' : 'managed output is absent',
      } as CodexAgentBundleLifecycleAction;
    }),
    ...removals.map((destination) => ({
      kind: 'remove' as const,
      path: join(destinationRoot, destination),
      reason: 'no longer owned by the requested bundle state',
    })),
  ];
}

function readLifecycleJournal(
  destinationRoot: string,
  anchors: CodexScopeAnchors,
  journalPath: string,
): z.infer<typeof LifecycleJournal> {
  const path = join(destinationRoot, journalPath);
  try {
    const journal = LifecycleJournal.parse(
      JSON.parse(
        readRegularText(physicalPath(destinationRoot, anchors, journalPath), 'lifecycle journal'),
      ),
    );
    assertSafeLifecycleJournal(journal);
    return journal;
  } catch (cause) {
    throw new Error(
      `lifecycle journal is invalid at ${path}: ${cause instanceof Error ? cause.message : 'invalid JSON'}`,
    );
  }
}

function assertSafeLifecycleJournal(journal: z.infer<typeof LifecycleJournal>): void {
  const receipt = Receipt.parse(JSON.parse(journal.receipt));
  assertReceiptIdentities(receipt);
  if (receipt.owner.packageId !== journal.owner.packageId)
    throw new Error('lifecycle journal receipt belongs to another package');
  const receiptPath = `agents/.agentforge/${journal.owner.packageId}.json`;
  const ownedDefinitions = new Set(receipt.agents.map(({ destination }) => destination));
  const isManagedPath = (destination: string): boolean =>
    destination === 'config.toml' ||
    destination === receiptPath ||
    ownedDefinitions.has(destination);
  const invalidBefore = journal.before.find(({ destination }) => !isManagedPath(destination));
  if (invalidBefore) {
    throw new Error(
      `lifecycle journal names a path outside its managed Codex scope: ${invalidBefore.destination}`,
    );
  }
  const before = new Map(journal.before.map((entry) => [entry.destination, entry]));
  if (
    before.size !== journal.before.length ||
    !before.has('config.toml') ||
    before.get(receiptPath)?.content !== journal.receipt ||
    before.get(receiptPath)?.sha256 !== sha256(journal.receipt) ||
    [...before.values()].some(({ content, sha256: digest }) => sha256(content) !== digest)
  )
    throw new Error('lifecycle journal does not bind its configuration and receipt before-state');
  const receiptByDestination = new Map(receipt.agents.map((agent) => [agent.destination, agent]));
  const invalidUnresolved = journal.unresolved.find((agent) => {
    const prior = receiptByDestination.get(agent.destination);
    return prior === undefined || JSON.stringify(prior) !== JSON.stringify(agent);
  });
  if (
    invalidUnresolved ||
    new Set(journal.unresolved.map(({ destination }) => destination)).size !==
      journal.unresolved.length
  )
    throw new Error('lifecycle journal has invalid unresolved ownership');
  const unresolvedDestinations = new Set(journal.unresolved.map(({ destination }) => destination));
  const cleanAgents = receipt.agents.filter(
    ({ destination }) => !unresolvedDestinations.has(destination),
  );
  assertExactJournalPaths(
    journal.before.map(({ destination }) => destination),
    ['config.toml', receiptPath, ...cleanAgents.map(({ destination }) => destination)],
    'before state',
  );
  const named = [...journal.after.map(({ destination }) => destination), ...journal.removals];
  if (new Set(named).size !== named.length)
    throw new Error('lifecycle journal has overlapping final writes and removals');
  const afterConfig = journal.after.find(({ destination }) => destination === 'config.toml');
  if (!afterConfig) throw new Error('lifecycle journal has no managed configuration state');
  const afterReceipt = journal.after.find(({ destination }) => destination === receiptPath);
  const afterDefinitions = journal.after.filter(
    ({ destination }) => destination.startsWith('agents/') && destination.endsWith('.toml'),
  );
  const priorDefinitions = receipt.agents.flatMap((agent) => {
    const prior = before.get(agent.destination);
    if (!prior) return [];
    if (prior.sha256 !== agent.installedSha256)
      throw new Error('lifecycle journal definition does not match its ownership receipt');
    const definition = validateCodexDefinition(prior.content, agent.name);
    return [
      {
        id: agent.id,
        name: agent.name,
        definition: agent.destination,
        content: prior.content,
        sha256: prior.sha256,
        description: definition.description,
      },
    ];
  });
  const invalidRemoval = journal.removals.find(
    (destination) =>
      destination !== receiptPath &&
      !priorDefinitions.some((definition) => definition.definition === destination),
  );
  if (invalidRemoval)
    throw new Error(
      `lifecycle journal removes a definition without exact prior ownership: ${invalidRemoval}`,
    );
  if (journal.operation === 'remove') {
    if (afterDefinitions.length > 0)
      throw new Error('remove lifecycle journal must not introduce role definitions');
    if (afterReceipt) {
      const retained = Receipt.parse(JSON.parse(afterReceipt.content));
      assertReceiptIdentities(retained);
      if (
        JSON.stringify(retained.owner) !== JSON.stringify(receipt.owner) ||
        JSON.stringify(retained.agents) !== JSON.stringify(journal.unresolved)
      ) {
        throw new Error(
          'remove lifecycle journal receipt does not retain exactly unresolved ownership',
        );
      }
    } else if (journal.unresolved.length > 0) {
      throw new Error('remove lifecycle journal does not retain unresolved ownership');
    }
    assertExactJournalPaths(
      journal.after.map(({ destination }) => destination),
      ['config.toml', ...(afterReceipt ? [receiptPath] : [])],
      'final writes',
    );
    assertExactJournalPaths(
      journal.removals,
      [
        ...cleanAgents.map(({ destination }) => destination),
        ...(journal.unresolved.length === 0 ? [receiptPath] : []),
      ],
      'removals',
    );
    assertExactJournalPaths(journal.absent, [], 'absence preconditions');
    assertJournalConfigRewrite(journal, priorDefinitions, [], afterConfig.content);
    return;
  }
  if (!afterReceipt) throw new Error('update lifecycle journal has no final ownership receipt');
  const next = Receipt.parse(JSON.parse(afterReceipt.content));
  assertReceiptIdentities(next);
  if (next.owner.packageId !== receipt.owner.packageId)
    throw new Error('update lifecycle journal receipt belongs to another package');
  if (journal.unresolved.length > 0)
    throw new Error('update lifecycle journal cannot preserve unresolved ownership');
  const priorIds = new Set(receipt.agents.map(({ id }) => id));
  const legacyAddition = next.agents.find(
    (agent) =>
      !priorIds.has(agent.id) &&
      agent.destination !== packageDefinitionPath(receipt.owner.packageId, agent.id),
  );
  if (legacyAddition)
    throw new Error(
      `update lifecycle journal introduces a role outside its package namespace: ${legacyAddition.destination}`,
    );
  const byDestination = new Map(
    afterDefinitions.map((output) => [output.destination, output.content]),
  );
  if (byDestination.size !== afterDefinitions.length || byDestination.size !== next.agents.length)
    throw new Error('update lifecycle journal definition set does not match its receipt');
  assertExactJournalPaths(
    journal.after.map(({ destination }) => destination),
    ['config.toml', receiptPath, ...next.agents.map(({ destination }) => destination)],
    'final writes',
  );
  const priorDestinations = new Set(receipt.agents.map(({ destination }) => destination));
  assertExactJournalPaths(
    journal.absent,
    next.agents
      .map(({ destination }) => destination)
      .filter((destination) => !priorDestinations.has(destination)),
    'absence preconditions',
  );
  const nextDestinations = new Set(next.agents.map(({ destination }) => destination));
  assertExactJournalPaths(
    journal.removals,
    priorDefinitions
      .map(({ definition }) => definition)
      .filter((destination) => !nextDestinations.has(destination)),
    'removals',
  );
  for (const agent of next.agents) {
    const content = byDestination.get(agent.destination);
    if (
      content === undefined ||
      sha256(content) !== agent.installedSha256 ||
      (() => {
        try {
          validateCodexDefinition(content, agent.name);
          return false;
        } catch {
          return true;
        }
      })()
    ) {
      throw new Error('update lifecycle journal definition does not match its receipt');
    }
  }
  const nextDefinitions = next.agents.map((agent) => {
    const content = byDestination.get(agent.destination);
    if (content === undefined)
      throw new Error('update lifecycle journal definition set does not match its receipt');
    const definition = validateCodexDefinition(content, agent.name);
    return {
      id: agent.id,
      name: agent.name,
      definition: agent.destination,
      content,
      sha256: agent.installedSha256,
      description: definition.description,
    };
  });
  assertJournalConfigRewrite(journal, priorDefinitions, nextDefinitions, afterConfig.content);
}

function assertExactJournalPaths(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((destination) => !expected.includes(destination))
  )
    throw new Error(`lifecycle journal has invalid ${label}`);
}

function assertJournalConfigRewrite(
  journal: z.infer<typeof LifecycleJournal>,
  oldDefinitions: readonly OwnedDefinition[],
  newDefinitions: readonly OwnedDefinition[],
  afterConfig: string,
): void {
  const beforeConfig = journal.before.find(({ destination }) => destination === 'config.toml');
  if (!beforeConfig)
    throw new Error('lifecycle journal does not bind its configuration before-state');
  if (
    inspectOwnedRegistrations('config.toml', beforeConfig.content, oldDefinitions).unresolved
      .length > 0
  )
    throw new Error('lifecycle journal would remove an edited role registration');
  const expected = rewriteOwnedRegistrations(
    'config.toml',
    beforeConfig.content,
    oldDefinitions,
    newDefinitions,
  );
  if (afterConfig !== expected)
    throw new Error('lifecycle journal final configuration does not match its owned role changes');
}

function lifecycleFromJournal(
  destinationRoot: string,
  anchors: CodexScopeAnchors,
  journalPath: string,
  journal: z.infer<typeof LifecycleJournal>,
): CodexAgentBundleLifecyclePlan {
  const provenance = {
    marketplacePath: join(destinationRoot, journalPath),
    publicationId: journal.owner.packageId,
    packageId: journal.owner.packageId,
  };
  const outputs: DesiredGeneratedOutput[] = journal.after.map((output) => ({
    kind: 'generated' as const,
    producer: 'generated' as const,
    destination: output.destination,
    content: output.content,
    target: 'codex' as const,
    provenance,
  }));
  const plan: CompilationPlan = {
    marketplaceId: journal.owner.packageId,
    outputs,
    diagnostics: [],
    rootOutputs: [],
    redactions: [],
  };
  return {
    operation: journal.operation,
    status: 'interrupted',
    destinationRoot,
    anchors,
    scope: journal.scope,
    journalPath,
    plan,
    removals: journal.removals,
    preconditions: journal.before,
    unresolved: journal.unresolved,
    absences: journal.absent,
    receiptContent: journal.receipt,
    actions: lifecycleActions(destinationRoot, anchors, outputs, journal.removals),
    issues: [
      {
        path: join(destinationRoot, journalPath),
        message: 'a prior lifecycle operation is incomplete; run the matching repair command',
      },
    ],
  };
}

function lifecycleRefusal(lifecycle: CodexAgentBundleLifecyclePlan): Error {
  const issue = lifecycle.issues[0];
  return new Error(
    `refusing lifecycle ${lifecycle.operation}: ${issue?.message ?? lifecycle.status}`,
  );
}

function journalContent(lifecycle: CodexAgentBundleLifecyclePlan): string {
  const outputs = lifecycle.plan.outputs.filter(
    (output): output is DesiredGeneratedOutput => output.kind === 'generated',
  );
  if (outputs.length !== lifecycle.plan.outputs.length)
    throw new Error('lifecycle journal can only record generated managed outputs');
  return `${JSON.stringify({
    schema: LIFECYCLE_JOURNAL_SCHEMA,
    operation: lifecycle.operation,
    owner: { packageId: lifecycle.plan.marketplaceId },
    scope: lifecycle.scope,
    before: lifecycle.preconditions,
    receipt: lifecycle.receiptContent ?? '',
    unresolved: lifecycle.unresolved,
    absent: lifecycle.absences,
    after: outputs.map(({ destination, content }) => ({ destination, content })),
    removals: lifecycle.removals,
    anchors: {
      ...(lifecycle.anchors.config ? { config: lifecycle.anchors.config.target } : {}),
      ...(lifecycle.anchors.agents ? { agents: lifecycle.anchors.agents.target } : {}),
    },
  })}\n`;
}

function emptyLifecyclePlan(
  input: { packageId: string } | CodexAgentBundleLifecyclePlan,
): CompilationPlan {
  return {
    marketplaceId: 'plan' in input ? input.plan.marketplaceId : input.packageId,
    outputs: [],
    diagnostics: [],
    rootOutputs: [],
    redactions: [],
  };
}

function lifecyclePath(lifecycle: CodexAgentBundleLifecyclePlan, destination: string): string {
  return physicalPath(lifecycle.destinationRoot, lifecycle.anchors, destination);
}

function lifecyclePreconditionsHold(lifecycle: CodexAgentBundleLifecyclePlan): boolean {
  return (
    lifecycle.preconditions.every(({ destination, sha256: digest }) => {
      const path = lifecyclePath(lifecycle, destination);
      const entry = lstatSync(path, { throwIfNoEntry: false });
      return Boolean(entry?.isFile() && sha256(readFileSync(path, 'utf8')) === digest);
    }) &&
    lifecycle.absences.every(
      (destination) => !lstatSync(lifecyclePath(lifecycle, destination), { throwIfNoEntry: false }),
    )
  );
}

function verifyLifecyclePreconditions(lifecycle: CodexAgentBundleLifecyclePlan): void {
  assertAnchorsUnchanged(lifecycle.anchors);
  if (!lifecyclePreconditionsHold(lifecycle))
    throw new Error('refusing lifecycle mutation: managed scope changed after preview');
}

function lifecycleFinalStateHolds(lifecycle: CodexAgentBundleLifecyclePlan): boolean {
  return (
    lifecycle.plan.outputs.every((output) => {
      const entry = lstatSync(lifecyclePath(lifecycle, output.destination), {
        throwIfNoEntry: false,
      });
      return (
        entry?.isFile() &&
        output.kind === 'generated' &&
        (output.destination !== 'config.toml' || (entry.mode & 0o777) === 0o600) &&
        readFileSync(lifecyclePath(lifecycle, output.destination), 'utf8') === output.content
      );
    }) &&
    lifecycle.removals.every(
      (destination) => !lstatSync(lifecyclePath(lifecycle, destination), { throwIfNoEntry: false }),
    )
  );
}

function lifecycleBeforeReceiptStateHolds(lifecycle: CodexAgentBundleLifecyclePlan): boolean {
  const receipt = lifecycle.plan.outputs.filter((output) => output.destination.endsWith('.json'));
  if (receipt.length !== 1) return false;
  const oldReceipt = lifecycle.preconditions.find((entry) => entry.destination.endsWith('.json'));
  if (!oldReceipt) return false;
  const currentReceipt = lifecyclePath(lifecycle, oldReceipt.destination);
  const receiptEntry = lstatSync(currentReceipt, { throwIfNoEntry: false });
  if (!receiptEntry?.isFile() || sha256(readFileSync(currentReceipt, 'utf8')) !== oldReceipt.sha256)
    return false;
  return (
    lifecycle.plan.outputs
      .filter((output) => !receipt.includes(output))
      .every((output) => {
        const entry = lstatSync(lifecyclePath(lifecycle, output.destination), {
          throwIfNoEntry: false,
        });
        return (
          entry?.isFile() &&
          output.kind === 'generated' &&
          (output.destination !== 'config.toml' || (entry.mode & 0o777) === 0o600) &&
          readFileSync(lifecyclePath(lifecycle, output.destination), 'utf8') === output.content
        );
      }) &&
    lifecycle.removals.every(
      (destination) => !lstatSync(lifecyclePath(lifecycle, destination), { throwIfNoEntry: false }),
    )
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
          definition: legacyDefinitionPath(agent.id),
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
    if (!isPackageDefinitionPath(index.package.id, agent.id, agent.definition))
      throw new Error('bundle index is invalid: definition must match canonical agent identity');
  }
  return {
    format: 'v2',
    package: index.package,
    agents: index.agents.map((agent) => ({ ...agent, sourceDefinition: agent.definition })),
  };
}

function legacyDefinitionPath(id: string): string {
  return `agents/${id}.toml`;
}

function packageDefinitionPath(packageId: string, id: string): string {
  return `agents/${packageId}/${id}.toml`;
}

/** v3 bundles namespace new roles; legacy v1/v2 indexes and v3 receipts retain their old path. */
function isPackageDefinitionPath(packageId: string, id: string, definition: string): boolean {
  return (
    definition === legacyDefinitionPath(id) || definition === packageDefinitionPath(packageId, id)
  );
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
export interface CodexScopeAnchor {
  link: string;
  target: string;
}
/**
 * The two paths of a Codex scope that a dotfiles tool may own through a
 * symbolic link. Only these are followed; every other managed path keeps the
 * no-symlink invariant, so a link is trusted exactly where it was resolved.
 */
export interface CodexScopeAnchors {
  config?: CodexScopeAnchor;
  agents?: CodexScopeAnchor;
}

/** A followed link that cannot be used; `link` names the offender for refusals. */
export class CodexScopeAnchorError extends Error {
  readonly link: string;
  readonly target: string | undefined;
  constructor(message: string, link: string, target?: string) {
    super(message);
    this.name = 'CodexScopeAnchorError';
    this.link = link;
    this.target = target;
  }
}

/** Resolve each anchor once; the result is the only place a link is followed. */
function resolveScopeAnchors(root: string): CodexScopeAnchors {
  const config = resolveAnchor(join(root, 'config.toml'), 'file', 'Codex role configuration');
  const agents = resolveAnchor(join(root, 'agents'), 'directory', 'Codex agents directory');
  return { ...(config ? { config } : {}), ...(agents ? { agents } : {}) };
}

function resolveAnchor(
  link: string,
  kind: 'file' | 'directory',
  label: string,
): CodexScopeAnchor | undefined {
  if (!lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) return undefined;
  let target: string;
  try {
    target = realpathSync(link);
  } catch {
    throw new CodexScopeAnchorError(`${label} symbolic link is dangling: ${link}`, link);
  }
  const entry = statSync(target);
  const named = `${link} -> ${target}`;
  if (kind === 'file' ? !entry.isFile() : !entry.isDirectory())
    throw new CodexScopeAnchorError(
      `${label} symbolic link must resolve to a ${kind === 'file' ? 'regular file' : 'real directory'}: ${named}`,
      link,
      target,
    );
  // The target's mode is not a precondition: like a regular config.toml, it is
  // replaced by a 0600 file through `privateDestinations`.
  try {
    accessSync(target, constants.W_OK);
    accessSync(dirname(target), constants.W_OK);
  } catch {
    throw new CodexScopeAnchorError(
      `${label} symbolic link target is not writable: ${named}`,
      link,
      target,
    );
  }
  return { link, target };
}

/** Refuse when an anchor no longer resolves to the target planned against. */
function assertAnchorsUnchanged(anchors: CodexScopeAnchors): void {
  for (const anchor of [anchors.config, anchors.agents]) {
    if (anchor) assertAnchorUnchanged(anchor, 'write', '; re-run to plan against the new target');
  }
}

/** The on-disk path a scope-relative managed destination is read from and written to. */
function physicalPath(root: string, anchors: CodexScopeAnchors, destination: string): string {
  return locateManagedDestination(root, managedAnchors(anchors), destination).destination;
}

function managedAnchors(anchors: CodexScopeAnchors): ManagedOutputAnchor[] {
  return [
    ...(anchors.config ? [{ destination: 'config.toml', ...anchors.config }] : []),
    ...(anchors.agents ? [{ destination: 'agents/', ...anchors.agents }] : []),
  ];
}

/**
 * Logical paths of every lifecycle lock or journal in a scope, current
 * location first. The current one sits under the scope root, never behind an
 * anchor; the legacy one is read through whichever anchor now resolves.
 */
function presentLifecycleLocks(root: string, anchors: CodexScopeAnchors): string[] {
  const directory = join(root, '.agentforge');
  const entry = lstatSync(directory, { throwIfNoEntry: false });
  if (entry && (entry.isSymbolicLink() || !entry.isDirectory()))
    throw new Error(`lifecycle lock directory must be a real directory: ${directory}`);
  return [LIFECYCLE_SCOPE_LOCK, LEGACY_LIFECYCLE_SCOPE_LOCK].filter((path) =>
    lstatSync(physicalPath(root, anchors, path), { throwIfNoEntry: false }),
  );
}

/** Refuse an install while any lock is held; name a moved anchor when the lock is a journal that recorded one. */
function assertNoIncompleteLifecycle(root: string, anchors: CodexScopeAnchors): void {
  const [held] = presentLifecycleLocks(root, anchors);
  if (!held) return;
  let moved: string | undefined;
  try {
    moved = anchorMismatch(
      root,
      anchors,
      readLifecycleJournal(root, anchors, held).anchors,
    )?.message;
  } catch {
    moved = undefined;
  }
  throw new Error(
    `refusing bundle installation: this Codex scope has an incomplete lifecycle operation${moved ? `: ${moved}` : ''}`,
  );
}

/** Compare a journal's recorded anchor targets with what the links resolve to now. */
function anchorMismatch(
  root: string,
  anchors: CodexScopeAnchors,
  recorded: { config?: string | undefined; agents?: string | undefined } | undefined,
): { link: string; message: string } | undefined {
  if (!recorded) return undefined;
  for (const role of ['config', 'agents'] as const) {
    const was = recorded[role];
    const now = anchors[role]?.target;
    if (was === now) continue;
    const link = anchors[role]?.link ?? join(root, role === 'config' ? 'config.toml' : 'agents');
    return {
      link,
      message: `${link} resolved to ${was ?? 'a real path (not a symbolic link)'} when the lifecycle operation was interrupted but now resolves to ${now ?? 'a real path (not a symbolic link)'}; restore the link before retrying or repairing`,
    };
  }
  return undefined;
}

/**
 * Run `body`, then `cleanup`. A cleanup failure never replaces the error
 * `body` raised: the primary error surfaces with the cleanup failure appended.
 */
function runThenCleanup(body: () => void, cleanup: () => void): void {
  try {
    body();
  } catch (primary) {
    try {
      cleanup();
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : String(failure);
      if (primary instanceof Error) {
        primary.message = `${primary.message}; additionally, cleanup failed: ${detail}`;
        throw primary;
      }
      throw new Error(`${String(primary)}; additionally, cleanup failed: ${detail}`, {
        cause: primary,
      });
    }
    throw primary;
  }
  cleanup();
}

/** Human-readable `<role>: <link> -> <target>` lines for each followed anchor. */
export function describeCodexScopeAnchors(anchors: CodexScopeAnchors): string[] {
  return [
    ...(anchors.config ? [`config: ${anchors.config.link} -> ${anchors.config.target}`] : []),
    ...(anchors.agents ? [`agents: ${anchors.agents.link} -> ${anchors.agents.target}`] : []),
  ];
}

function readRegularText(path: string, label: string): string {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry?.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readContainedRegularText(root: string, proposed: string, label: string): string {
  const path = resolve(root, proposed);
  if (!isContainedPath(root, path))
    throw new Error(`${label} escapes the bundle root: ${proposed}`);
  assertSafeDirectoryPath(root, path, label);
  return readRegularText(path, label);
}

function assertSafeDestinationRoot(root: string): void {
  const entry = lstatSync(root, { throwIfNoEntry: false });
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error(`Codex installation root must be a real directory: ${root}`);
  }
}

function assertSafeDirectory(root: string, label: string): void {
  const entry = lstatSync(root, { throwIfNoEntry: false });
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${root}`);
  }
}

function assertSafeDirectoryPath(root: string, path: string, label: string): void {
  let current = path;
  while (current !== root) {
    current = dirname(current);
    const entry = lstatSync(current, { throwIfNoEntry: false });
    if (!entry?.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symbolic link or irregular directory: ${path}`);
    }
  }
}
function validateCodexDefinition(
  content: string,
  expectedName: string,
): z.infer<typeof CodexBundleDefinition> {
  const parsed = parseCodexDefinition(content);
  if (parsed.name !== expectedName)
    throw new Error('bundle definition does not match indexed Codex agent name');
  return parsed;
}

function parseCodexDefinition(content: string): z.infer<typeof CodexBundleDefinition> {
  let document: unknown;
  try {
    document = Bun.TOML.parse(content);
  } catch {
    throw new Error('bundle definition is not valid TOML');
  }
  const parsed = CodexBundleDefinition.safeParse(document);
  if (!parsed.success)
    throw new Error('bundle definition has unsupported or invalid Codex role fields');
  return parsed.data;
}
function buildRoleRegistrations(
  configPath: string,
  physicalConfigPath: string,
  definitions: readonly { name: string; definition: string; description: string }[],
): {
  content: string;
  present: ReadonlySet<string>;
  edited: ReadonlySet<string>;
  conflicts: ReadonlySet<string>;
} {
  const entry = lstatSync(physicalConfigPath, { throwIfNoEntry: false });
  const content = entry ? readRegularText(physicalConfigPath, 'Codex role configuration') : '';
  return buildRoleRegistrationContent(configPath, content, definitions);
}

function buildRoleRegistrationContent(
  configPath: string,
  content: string,
  definitions: readonly { name: string; definition: string; description: string }[],
): {
  content: string;
  present: ReadonlySet<string>;
  edited: ReadonlySet<string>;
  conflicts: ReadonlySet<string>;
} {
  const { agents } = parseRoleConfiguration(configPath, content);
  const present = new Set<string>();
  const edited = new Set<string>();
  const conflicts = new Set<string>();
  const additions: string[] = [];
  for (const agent of definitions) {
    const current = agents[agent.name];
    if (current === undefined) {
      if (/^\s*agents\s*=\s*\{/m.test(content))
        throw new Error(
          `Codex role configuration uses an inline agents table and cannot register ${agent.name}`,
        );
      additions.push(registrationText(configPath, agent));
    } else if (!current || typeof current !== 'object') {
      conflicts.add(agent.name);
    } else if ((current as { config_file?: unknown }).config_file !== agent.definition) {
      conflicts.add(agent.name);
    } else if (
      (current as { description?: unknown }).description !== agent.description ||
      Object.keys(current).some((key) => key !== 'config_file' && key !== 'description')
    ) {
      edited.add(agent.name);
    } else {
      present.add(agent.name);
    }
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
  return { content: next, present, edited, conflicts };
}

function parseRoleConfiguration(
  configPath: string,
  content: string,
): { agents: Record<string, unknown> } {
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
  return { agents: (agents ?? {}) as Record<string, unknown> };
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

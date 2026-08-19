import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import type { z } from 'zod';
import type { CompilationPlan, DesiredOutput, RootAnchoredOutput } from './compiler.ts';
import { ClaudeMarketplace, ClaudePluginManifest } from './targets/claude-marketplace.ts';
import { CodexMarketplace, CodexPluginManifest } from './targets/codex-marketplace.ts';
import { getArtifactConfig } from './targets/index.ts';

export type MarketplaceCheckIssueCode =
  | 'missing-output'
  | 'changed-output'
  | 'changed-output-mode'
  | 'unexpected-output'
  | 'invalid-native-document'
  | 'unsafe-plugin-path'
  | 'broken-plugin-reference'
  | 'package-identity-mismatch'
  | 'package-version-mismatch'
  | 'invalid-artifact-frontmatter'
  | 'unsafe-output-entry';

export interface MarketplaceCheckIssue {
  code: MarketplaceCheckIssueCode;
  publicationId: string;
  packageId?: string;
  path: string;
  message: string;
}

// A marketplace-root-anchored file that was checked. Kept apart from
// `filesChecked` because those paths are relative to the output root, and the
// same string under a different anchor names a different file.
export interface RootFileChecked {
  publicationId: string;
  path: string;
}

export interface MarketplaceCheckResult {
  outputRoot: string;
  filesChecked: string[];
  rootFilesChecked: RootFileChecked[];
  issues: MarketplaceCheckIssue[];
}

export function checkMarketplace(
  plan: CompilationPlan,
  outputRoot: string,
): MarketplaceCheckResult {
  const expected = new Map(plan.outputs.map((output) => [output.destination, output]));
  const publicationIds = new Set(plan.outputs.map(({ provenance }) => provenance.publicationId));
  const actualPaths = new Set<string>();

  for (const publicationId of publicationIds) {
    const publicationRoot = join(outputRoot, publicationId);
    for (const path of listFiles(publicationRoot)) {
      actualPaths.add(`${publicationId}/${path}`);
    }
  }

  const issues: MarketplaceCheckIssue[] = [];
  for (const output of plan.outputs) {
    const actualPath = join(outputRoot, ...output.destination.split('/'));
    if (!existsSync(actualPath)) {
      issues.push(issueFor(output, 'missing-output', 'managed output is missing'));
      continue;
    }
    if (!lstatSync(actualPath).isFile()) {
      issues.push(
        issueFor(
          output,
          'unsafe-output-entry',
          'managed output must be a regular file contained by its publication root',
        ),
      );
      continue;
    }
    if (process.platform !== 'win32') {
      const actualMode = lstatSync(actualPath).mode & 0o777;
      const expectedMode = expectedOutputMode(output);
      if (actualMode !== expectedMode) {
        issues.push(
          issueFor(
            output,
            'changed-output-mode',
            `managed output mode is ${formatMode(actualMode)}; expected ${formatMode(expectedMode)}`,
          ),
        );
      }
    }
    if (!readFileSync(actualPath).equals(expectedBytes(output))) {
      issues.push(
        issueFor(output, 'changed-output', 'managed output differs from the compilation plan'),
      );
    }
    const nativeIssue = validateNativeDocument(output, actualPath);
    if (nativeIssue) issues.push(nativeIssue);
  }

  for (const path of actualPaths) {
    if (expected.has(path)) continue;
    const [publicationId = ''] = path.split('/');
    issues.push({
      code: 'unexpected-output',
      publicationId,
      path,
      message: 'file is not managed by the compilation plan',
    });
  }

  issues.push(...validatePluginPaths(plan, outputRoot));
  issues.push(...validateManifestParity(plan, outputRoot));
  issues.push(...validateArtifactFrontmatter(plan, outputRoot));

  const rootFilesChecked: RootFileChecked[] = [];
  for (const output of plan.rootOutputs ?? []) {
    rootFilesChecked.push({
      publicationId: output.provenance.publicationId,
      path: rootDisplayPath(output.destination),
    });
    issues.push(...checkRootOutput(output));
  }

  issues.sort(
    (left, right) => compareStrings(left.path, right.path) || compareStrings(left.code, right.code),
  );
  return {
    outputRoot,
    filesChecked: [...expected.keys()].toSorted(compareStrings),
    rootFilesChecked: rootFilesChecked.toSorted((left, right) =>
      compareStrings(left.path, right.path),
    ),
    issues,
  };
}

// Marketplace-root-anchored, and labelled as such: the same destination under
// `--out` is a different file, and an unlabelled path would conflate them.
function rootDisplayPath(destination: string): string {
  return `<root>/${destination}`;
}

// Drift and absence, checked exactly as for a managed output. What is
// deliberately not checked is the root's *siblings*: the marketplace root is
// the user's repository, not a directory the compiler owns, so an unmanaged
// file beside the manifest is not an `unexpected-output`.
function checkRootOutput(output: RootAnchoredOutput): MarketplaceCheckIssue[] {
  const marketplaceRoot = dirname(output.provenance.marketplacePath);
  const actualPath = join(marketplaceRoot, ...output.destination.split('/'));
  const path = rootDisplayPath(output.destination);
  const base = {
    publicationId: output.provenance.publicationId,
    ...(output.provenance.packageId === undefined
      ? {}
      : { packageId: output.provenance.packageId }),
    path,
  };

  if (!existsSync(actualPath)) {
    return [{ ...base, code: 'missing-output', message: 'managed root manifest is missing' }];
  }
  if (!lstatSync(actualPath).isFile()) {
    return [
      {
        ...base,
        code: 'unsafe-output-entry',
        message: 'managed root manifest must be a regular file',
      },
    ];
  }

  const issues: MarketplaceCheckIssue[] = [];
  if (process.platform !== 'win32') {
    const actualMode = lstatSync(actualPath).mode & 0o777;
    if (actualMode !== 0o644) {
      issues.push({
        ...base,
        code: 'changed-output-mode',
        message: `managed root manifest mode is ${formatMode(actualMode)}; expected ${formatMode(0o644)}`,
      });
    }
  }
  if (!readFileSync(actualPath).equals(Buffer.from(output.content, 'utf8'))) {
    issues.push({
      ...base,
      code: 'changed-output',
      message: 'managed root manifest differs from the compilation plan',
    });
  }

  const native = nativeDocumentFor(output);
  if (native) {
    let document: unknown;
    try {
      document = JSON.parse(readFileSync(actualPath, 'utf8'));
    } catch {
      issues.push({
        ...base,
        code: 'invalid-native-document',
        message: `invalid ${native.label}: <root>: invalid JSON`,
      });
      return issues;
    }
    const result = native.schema.safeParse(document);
    if (!result.success) {
      const issue = result.error.issues[0];
      issues.push({
        ...base,
        code: 'invalid-native-document',
        message: `invalid ${native.label}: ${issue?.path.join('.') || '<root>'}: ${issue?.message ?? 'validation failed'}`,
      });
    }
  }
  return issues;
}

function validateArtifactFrontmatter(
  plan: CompilationPlan,
  outputRoot: string,
): MarketplaceCheckIssue[] {
  const issues: MarketplaceCheckIssue[] = [];
  for (const output of plan.outputs) {
    if (output.kind !== 'generated' || !output.destination.endsWith('/SKILL.md')) continue;
    const config = getArtifactConfig(output.target, 'skill');
    const actualPath = join(outputRoot, ...output.destination.split('/'));
    if (!config || !isRegularFile(actualPath)) continue;
    let frontmatter: unknown;
    try {
      frontmatter = matter(readFileSync(actualPath, 'utf8')).data;
    } catch {
      issues.push(
        issueFor(
          output,
          'invalid-artifact-frontmatter',
          `invalid ${targetLabel(output.target)} skill frontmatter: <root>: invalid YAML`,
        ),
      );
      continue;
    }
    const result = config.outputFrontmatterSchema.safeParse(frontmatter);
    if (result.success) continue;
    const issue = result.error.issues[0];
    issues.push(
      issueFor(
        output,
        'invalid-artifact-frontmatter',
        `invalid ${targetLabel(output.target)} skill frontmatter: ${issue?.path.join('.') || '<root>'}: ${issue?.message ?? 'validation failed'}`,
      ),
    );
  }
  return issues;
}

function targetLabel(target: DesiredOutput['target']): string {
  if (target === 'claude') return 'Claude';
  if (target === 'codex') return 'Codex';
  return target;
}

function validateManifestParity(
  plan: CompilationPlan,
  outputRoot: string,
): MarketplaceCheckIssue[] {
  const issues: MarketplaceCheckIssue[] = [];
  for (const output of plan.outputs) {
    if (
      output.kind !== 'generated' ||
      output.provenance.packageId === undefined ||
      !output.destination.endsWith('/plugin.json')
    ) {
      continue;
    }
    const native = nativeDocumentFor(output);
    const actualPath = join(outputRoot, ...output.destination.split('/'));
    if (!native || !isRegularFile(actualPath)) continue;
    let expectedDocument: unknown;
    let actualDocument: unknown;
    try {
      expectedDocument = JSON.parse(output.content);
      actualDocument = JSON.parse(readFileSync(actualPath, 'utf8'));
    } catch {
      continue;
    }
    const expected = native.schema.safeParse(expectedDocument);
    const actual = native.schema.safeParse(actualDocument);
    if (!expected.success || !actual.success) continue;
    const expectedManifest = expected.data as { name?: unknown; version?: unknown };
    const actualManifest = actual.data as { name?: unknown; version?: unknown };
    if (actualManifest.name !== expectedManifest.name) {
      issues.push(
        issueFor(
          output,
          'package-identity-mismatch',
          `plugin manifest name ${JSON.stringify(actualManifest.name)} does not match compiled package name ${JSON.stringify(expectedManifest.name)}`,
        ),
      );
    }
    if (actualManifest.version !== expectedManifest.version) {
      issues.push(
        issueFor(
          output,
          'package-version-mismatch',
          `plugin manifest version ${JSON.stringify(actualManifest.version)} does not match compiled package version ${JSON.stringify(expectedManifest.version)}`,
        ),
      );
    }
  }
  return issues;
}

function validatePluginPaths(plan: CompilationPlan, outputRoot: string): MarketplaceCheckIssue[] {
  const issues: MarketplaceCheckIssue[] = [];
  for (const registry of plan.outputs.filter(isMarketplaceRegistry)) {
    const actualPath = join(outputRoot, ...registry.destination.split('/'));
    if (!isRegularFile(actualPath)) continue;
    const schema = registry.target === 'claude' ? ClaudeMarketplace : CodexMarketplace;
    let document: unknown;
    try {
      document = JSON.parse(readFileSync(actualPath, 'utf8'));
    } catch {
      continue;
    }
    const parsed = schema.safeParse(document);
    if (!parsed.success) continue;

    const packageIdsByName = expectedPackageIdsByName(plan, registry.provenance.publicationId);
    for (const plugin of parsed.data.plugins) {
      const source = pluginSource(registry.target, plugin);
      const directory = source === undefined ? undefined : safePluginDirectory(source);
      const packageId = packageIdsByName.get(plugin.name);
      if (directory === undefined) {
        issues.push({
          code: 'unsafe-plugin-path',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `plugin ${JSON.stringify(plugin.name)} source ${JSON.stringify(source)} must be a contained ./-relative package path`,
        });
        continue;
      }
      const manifestPath = `${registry.provenance.publicationId}/${directory}/${registry.target === 'claude' ? '.claude-plugin' : '.codex-plugin'}/plugin.json`;
      const manifestFile = join(outputRoot, ...manifestPath.split('/'));
      if (!isRegularFile(manifestFile)) {
        issues.push({
          code: 'broken-plugin-reference',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `plugin ${JSON.stringify(plugin.name)} references missing manifest ${JSON.stringify(manifestPath)}`,
        });
        continue;
      }
      const manifestSchema =
        registry.target === 'claude' ? ClaudePluginManifest : CodexPluginManifest;
      let manifestDocument: unknown;
      try {
        manifestDocument = JSON.parse(readFileSync(manifestFile, 'utf8'));
      } catch {
        continue;
      }
      const manifest = manifestSchema.safeParse(manifestDocument);
      if (!manifest.success) continue;
      if (plugin.name !== manifest.data.name) {
        issues.push({
          code: 'package-identity-mismatch',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `registry name ${JSON.stringify(plugin.name)} does not match plugin manifest name ${JSON.stringify(manifest.data.name)}`,
        });
      }
      const registryVersion = pluginVersion(plugin);
      if (registryVersion !== undefined && registryVersion !== manifest.data.version) {
        issues.push({
          code: 'package-version-mismatch',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `registry version ${JSON.stringify(registryVersion)} does not match plugin manifest version ${JSON.stringify(manifest.data.version)}`,
        });
      }
    }
  }
  return issues;
}

function pluginVersion(plugin: unknown): string | undefined {
  if (typeof plugin !== 'object' || plugin === null || !('version' in plugin)) return undefined;
  return typeof plugin.version === 'string' ? plugin.version : undefined;
}

function isMarketplaceRegistry(
  output: DesiredOutput,
): output is DesiredOutput & { kind: 'generated' } {
  return (
    output.kind === 'generated' &&
    (output.destination.endsWith('/.claude-plugin/marketplace.json') ||
      output.destination.endsWith('/.agents/plugins/marketplace.json'))
  );
}

function expectedPackageIdsByName(
  plan: CompilationPlan,
  publicationId: string,
): ReadonlyMap<string, string> {
  const packages = new Map<string, string>();
  for (const output of plan.outputs) {
    if (
      output.kind !== 'generated' ||
      output.provenance.publicationId !== publicationId ||
      output.provenance.packageId === undefined ||
      !output.destination.endsWith('/plugin.json')
    ) {
      continue;
    }
    try {
      const document = JSON.parse(output.content) as { name?: unknown };
      if (typeof document.name === 'string') {
        packages.set(document.name, output.provenance.packageId);
      }
    } catch {}
  }
  return packages;
}

function pluginSource(target: DesiredOutput['target'], plugin: unknown): string | undefined {
  if (typeof plugin !== 'object' || plugin === null || !('source' in plugin)) return undefined;
  const source = plugin.source;
  if (typeof source === 'string') return source;
  if (typeof source !== 'object' || source === null) return undefined;
  if (target === 'codex' && 'path' in source && typeof source.path === 'string') {
    return source.path;
  }
  if ('source' in source && typeof source.source === 'string') return source.source;
  return undefined;
}

function safePluginDirectory(source: string): string | undefined {
  if (!source.startsWith('./') || source.includes('\\')) return undefined;
  const path = source.slice(2);
  const segments = path.split('/');
  if (
    path.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return undefined;
  }
  return path;
}

function validateNativeDocument(
  output: DesiredOutput,
  actualPath: string,
): MarketplaceCheckIssue | undefined {
  if (output.kind !== 'generated') return undefined;
  const native = nativeDocumentFor(output);
  if (!native) return undefined;

  let document: unknown;
  try {
    document = JSON.parse(readFileSync(actualPath, 'utf8'));
  } catch {
    return issueFor(
      output,
      'invalid-native-document',
      `invalid ${native.label}: <root>: invalid JSON`,
    );
  }
  const result = native.schema.safeParse(document);
  if (result.success) return undefined;
  const issue = result.error.issues[0];
  return issueFor(
    output,
    'invalid-native-document',
    `invalid ${native.label}: ${issue?.path.join('.') || '<root>'}: ${issue?.message ?? 'validation failed'}`,
  );
}

function nativeDocumentFor(
  output: DesiredOutput,
): { schema: z.ZodType; label: string } | undefined {
  if (output.target === 'claude') {
    if (hasTail(output.destination, '.claude-plugin/marketplace.json')) {
      return { schema: ClaudeMarketplace, label: 'Claude marketplace registry' };
    }
    if (hasTail(output.destination, '.claude-plugin/plugin.json')) {
      return { schema: ClaudePluginManifest, label: 'Claude plugin manifest' };
    }
  }
  if (output.target === 'codex') {
    if (hasTail(output.destination, '.agents/plugins/marketplace.json')) {
      return { schema: CodexMarketplace, label: 'Codex marketplace registry' };
    }
    if (hasTail(output.destination, '.codex-plugin/plugin.json')) {
      return { schema: CodexPluginManifest, label: 'Codex plugin manifest' };
    }
  }
  return undefined;
}

// A root manifest's destination is anchored at the marketplace root, so it is
// the bare tail with no publication prefix in front of it.
function hasTail(destination: string, tail: string): boolean {
  return destination === tail || destination.endsWith(`/${tail}`);
}

function issueFor(
  output: DesiredOutput,
  code: Exclude<MarketplaceCheckIssueCode, 'unexpected-output'>,
  message: string,
): MarketplaceCheckIssue {
  return {
    code,
    publicationId: output.provenance.publicationId,
    ...(output.provenance.packageId === undefined
      ? {}
      : { packageId: output.provenance.packageId }),
    path: output.destination,
    message,
  };
}

function expectedBytes(output: DesiredOutput): Buffer {
  return output.kind === 'generated'
    ? Buffer.from(output.content, 'utf8')
    : readFileSync(output.sourcePath);
}

function expectedOutputMode(output: DesiredOutput): number {
  if (output.kind === 'generated') return 0o644;
  if (output.executable !== undefined) return output.executable ? 0o755 : 0o644;
  return lstatSync(output.sourcePath).mode & 0o777;
}

function formatMode(mode: number): string {
  return mode.toString(8).padStart(4, '0');
}

function isRegularFile(path: string): boolean {
  return existsSync(path) && lstatSync(path).isFile();
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  visit(root);
  return files.toSorted(compareStrings);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import type {
  CompilationPlan,
  DesiredGeneratedOutput,
  DesiredOutput,
  MarketplaceRegistryHandle,
  NativeDocumentHandle,
  PackageManifestHandle,
  RootAnchoredOutput,
} from './compiler.ts';
import { rootDisplayPath } from './root-manifest.ts';
import { getArtifactConfig, getTarget } from './targets/index.ts';

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
  | 'invalid-output-document'
  | 'unsafe-output-content'
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
    issues.push(...checkManagedOutput(output, publicationAnchor(outputRoot), plan.redactions));
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
  for (const output of plan.rootOutputs) {
    rootFilesChecked.push({
      publicationId: output.provenance.publicationId,
      path: rootDisplayPath(output.destination),
    });
    issues.push(...checkManagedOutput(output, marketplaceRootAnchor(output), plan.redactions));
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

/** Compare one complete, AgentForge-owned destination against its pure plan. */
export function checkCompilationSnapshot(
  plan: CompilationPlan,
  outputRoot: string,
): MarketplaceCheckResult {
  const expected = new Map(plan.outputs.map((output) => [output.destination, output]));
  const publicationId = plan.outputs[0]?.provenance.publicationId ?? 'install';
  const issues: MarketplaceCheckIssue[] = [];

  for (const output of plan.outputs) {
    issues.push(...checkManagedOutput(output, publicationAnchor(outputRoot), plan.redactions));
  }
  for (const path of listFiles(outputRoot)) {
    if (expected.has(path)) continue;
    issues.push({
      code: 'unexpected-output',
      publicationId,
      path,
      message: 'file is not managed by the compilation plan',
    });
  }
  issues.push(...validateArtifactFrontmatter(plan, outputRoot));
  issues.sort(
    (left, right) => compareStrings(left.path, right.path) || compareStrings(left.code, right.code),
  );
  return {
    outputRoot,
    filesChecked: [...expected.keys()].toSorted(compareStrings),
    rootFilesChecked: [],
    issues,
  };
}

// Which anchor a managed output is checked against: `--out` for the compiled
// tree, the marketplace root for a `root-manifest` copy. Parameterized rather
// than duplicated, because two copies of "exists, is a regular file, has the
// expected mode and bytes, parses as its native schema" drift apart silently.
interface OutputAnchor {
  baseDirectory: string;
  displayPath: (destination: string) => string;
  // Names the thing in every message, so the reader can tell which copy failed.
  label: string;
  irregularEntryMessage: string;
}

function publicationAnchor(outputRoot: string): OutputAnchor {
  return {
    baseDirectory: outputRoot,
    displayPath: (destination) => destination,
    label: 'managed output',
    irregularEntryMessage:
      'managed output must be a regular file contained by its publication root',
  };
}

// Drift and absence, checked exactly as for a managed output. What is
// deliberately not checked is the root's *siblings*: the marketplace root is
// the user's repository, not a directory the compiler owns, so an unmanaged
// file beside the manifest is not an `unexpected-output`.
function marketplaceRootAnchor(output: RootAnchoredOutput): OutputAnchor {
  return {
    baseDirectory: dirname(output.provenance.marketplacePath),
    displayPath: rootDisplayPath,
    label: 'managed root manifest',
    irregularEntryMessage: 'managed root manifest must be a regular file',
  };
}

function checkManagedOutput(
  output: DesiredOutput,
  anchor: OutputAnchor,
  redactions: readonly string[],
): MarketplaceCheckIssue[] {
  const path = anchor.displayPath(output.destination);
  const actualPath = join(anchor.baseDirectory, ...output.destination.split('/'));

  // One lstat and one read for the whole file: the earlier shape stat'd three
  // times and read twice, and the answers could disagree between calls.
  const stats = lstatSync(actualPath, { throwIfNoEntry: false });
  if (!stats) {
    return [issueFor(output, 'missing-output', `${anchor.label} is missing`, path)];
  }
  if (!stats.isFile()) {
    return [issueFor(output, 'unsafe-output-entry', anchor.irregularEntryMessage, path)];
  }

  const issues: MarketplaceCheckIssue[] = [];
  if (process.platform !== 'win32') {
    const actualMode = stats.mode & 0o777;
    const expectedMode = expectedOutputMode(output);
    if (actualMode !== expectedMode) {
      issues.push(
        issueFor(
          output,
          'changed-output-mode',
          `${anchor.label} mode is ${formatMode(actualMode)}; expected ${formatMode(expectedMode)}`,
          path,
        ),
      );
    }
  }

  const actualBytes = readFileSync(actualPath);
  if (!actualBytes.equals(expectedBytes(output))) {
    issues.push(
      issueFor(output, 'changed-output', `${anchor.label} differs from the compilation plan`, path),
    );
  }
  const nativeIssue = validateNativeDocument(output, path, actualBytes);
  if (nativeIssue) issues.push(nativeIssue);
  else {
    const jsonIssue = validateOutputJson(output, path, actualBytes);
    if (jsonIssue) issues.push(jsonIssue);
  }
  issues.push(...scanOutputContent(output, path, actualBytes, redactions));
  return issues;
}

// A `.json` output that is not one of the native documents above: a hook
// configuration, a package's own settings file, anything a publication ships
// verbatim. Malformed JSON here is a real defect rather than a style opinion —
// the harness parses these at load time, so a file that does not parse is one
// the runtime will reject.
//
// Deliberately narrower than the linter this replaces, which also failed an
// empty markdown file and warned on a short one. Neither is a runtime failure
// on either harness, and turning one repository's house style into every
// consumer's build error is the same overreach `ndr:17dhph` rejected for strict
// target schemas.
function validateOutputJson(
  output: DesiredOutput,
  path: string,
  actualBytes: Buffer,
): MarketplaceCheckIssue | undefined {
  if (!output.destination.endsWith('.json')) return undefined;
  try {
    JSON.parse(actualBytes.toString('utf8'));
    return undefined;
  } catch {
    return issueFor(output, 'invalid-output-document', 'managed output is not valid JSON', path);
  }
}

// Absolute home directories, the one leak class that generalizes across every
// repository: a compiler that interpolated a source path into a manifest ships
// the author's username to whoever installs the plugin. Both spellings, because
// the same publication is compiled on macOS and on Linux CI.
const ABSOLUTE_HOME_PATH = /\/(?:Users|home)\/[A-Za-z0-9._-]+\//;

// Scans what a managed output actually contains. Runs against the bytes already
// read for the drift comparison, so a copied resource costs no extra read than
// the one `checkManagedOutput` performs regardless — which is why this covers
// passthrough resources and not only generated documents.
//
// A gate on `check` rather than on `compile`: compilation stays total, and what
// is publishable is a judgement about a finished tree (ndr:tfee0d). A leak that
// reaches disk under `--out` has not been published; one that survives `check`
// is about to be.
function scanOutputContent(
  output: DesiredOutput,
  path: string,
  bytes: Buffer,
  redactions: readonly string[],
): MarketplaceCheckIssue[] {
  // Binary payloads — an icon, a compiled helper — have no text to scan, and
  // decoding them produces replacement characters that match nothing useful.
  if (bytes.includes(0)) return [];
  const content = bytes.toString('utf8');

  const issues: MarketplaceCheckIssue[] = [];
  const home = ABSOLUTE_HOME_PATH.exec(content);
  if (home) {
    issues.push(
      issueFor(
        output,
        'unsafe-output-content',
        `managed output contains an absolute home directory ${JSON.stringify(home[0])}`,
        path,
      ),
    );
  }
  for (const redaction of redactions) {
    if (!content.includes(redaction)) continue;
    issues.push(
      issueFor(
        output,
        'unsafe-output-content',
        `managed output contains the declared redaction ${JSON.stringify(redaction)}`,
        path,
      ),
    );
  }
  return issues;
}

function validateArtifactFrontmatter(
  plan: CompilationPlan,
  outputRoot: string,
): MarketplaceCheckIssue[] {
  const issues: MarketplaceCheckIssue[] = [];
  for (const output of plan.outputs) {
    if (
      output.kind !== 'generated' ||
      (output.destination !== 'SKILL.md' && !output.destination.endsWith('/SKILL.md'))
    ) {
      continue;
    }
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
  return getTarget(target).label;
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
    const schema = registry.nativeDocument.schema;
    let document: unknown;
    try {
      document = JSON.parse(readFileSync(actualPath, 'utf8'));
    } catch {
      continue;
    }
    const parsed = schema.safeParse(document);
    if (!parsed.success) continue;

    const packageIdsByName = expectedPackageIdsByName(plan, registry.provenance.publicationId);
    for (const plugin of registry.nativeDocument.plugins(parsed.data)) {
      const source = plugin.source;
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
      const manifestOutput = packageId
        ? plan.outputs
            .filter(isPackageManifest)
            .find(
              (output) =>
                output.provenance.publicationId === registry.provenance.publicationId &&
                output.provenance.packageId === packageId,
            )
        : undefined;
      const rootedManifestPath = `${registry.provenance.publicationId}/${registry.nativeDocument.manifestPath(directory)}`;
      const manifestFile = join(outputRoot, ...rootedManifestPath.split('/'));
      if (!isRegularFile(manifestFile)) {
        issues.push({
          code: 'broken-plugin-reference',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `plugin ${JSON.stringify(plugin.name)} references missing manifest ${JSON.stringify(rootedManifestPath)}`,
        });
        continue;
      }
      const manifestSchema = manifestOutput?.nativeDocument?.schema;
      if (!manifestSchema) continue;
      let manifestDocument: unknown;
      try {
        manifestDocument = JSON.parse(readFileSync(manifestFile, 'utf8'));
      } catch {
        continue;
      }
      const manifest = manifestSchema.safeParse(manifestDocument);
      if (!manifest.success) continue;
      const manifestData = manifestOutput.nativeDocument.identity(manifest.data);
      if (plugin.name !== manifestData.name) {
        issues.push({
          code: 'package-identity-mismatch',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `registry name ${JSON.stringify(plugin.name)} does not match plugin manifest name ${JSON.stringify(manifestData.name)}`,
        });
      }
      const registryVersion = plugin.version;
      if (registryVersion !== undefined && registryVersion !== manifestData.version) {
        issues.push({
          code: 'package-version-mismatch',
          publicationId: registry.provenance.publicationId,
          ...(packageId === undefined ? {} : { packageId }),
          path: registry.destination,
          message: `registry version ${JSON.stringify(registryVersion)} does not match plugin manifest version ${JSON.stringify(manifestData.version)}`,
        });
      }
    }
  }
  return issues;
}

function isMarketplaceRegistry(
  output: DesiredOutput,
): output is DesiredGeneratedOutput & { nativeDocument: MarketplaceRegistryHandle } {
  return output.kind === 'generated' && output.nativeDocument?.role === 'marketplace-registry';
}

function isPackageManifest(
  output: DesiredOutput,
): output is DesiredGeneratedOutput & { nativeDocument: PackageManifestHandle } {
  return output.kind === 'generated' && output.nativeDocument?.role === 'package-manifest';
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
      output.nativeDocument?.role !== 'package-manifest'
    ) {
      continue;
    }
    try {
      const document = JSON.parse(output.content);
      const identity = output.nativeDocument.identity(document);
      if (identity.name !== undefined) {
        packages.set(identity.name, output.provenance.packageId);
      }
    } catch {}
  }
  return packages;
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
  path: string,
  actualBytes: Buffer,
): MarketplaceCheckIssue | undefined {
  if (output.kind !== 'generated') return undefined;
  const native = nativeDocumentFor(output);
  if (!native) return undefined;

  let document: unknown;
  try {
    document = JSON.parse(actualBytes.toString('utf8'));
  } catch {
    return issueFor(
      output,
      'invalid-native-document',
      `invalid ${native.label}: <root>: invalid JSON`,
      path,
    );
  }
  const result = native.schema.safeParse(document);
  if (result.success) return undefined;
  const issue = result.error.issues[0];
  return issueFor(
    output,
    'invalid-native-document',
    `invalid ${native.label}: ${issue?.path.join('.') || '<root>'}: ${issue?.message ?? 'validation failed'}`,
    path,
  );
}

function nativeDocumentFor(output: DesiredOutput): NativeDocumentHandle | undefined {
  return output.kind === 'generated' ? output.nativeDocument : undefined;
}

// `path` defaults to the destination because most callers check the compiled
// tree, where the destination *is* the display path; a root-anchored caller
// passes the prefixed form instead.
function issueFor(
  output: DesiredOutput,
  code: Exclude<MarketplaceCheckIssueCode, 'unexpected-output'>,
  message: string,
  path: string = output.destination,
): MarketplaceCheckIssue {
  return {
    code,
    publicationId: output.provenance.publicationId,
    ...(output.provenance.packageId === undefined
      ? {}
      : { packageId: output.provenance.packageId }),
    path,
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

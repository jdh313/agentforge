import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import matter from 'gray-matter';
import JSZip from 'jszip';
import { findConstructShapes, supportFor } from './capabilities.ts';
import { deepMerge } from './deep-merge.ts';
import { ARTIFACT_DEFS, CLAUDE_ONLY_KEYS } from './schema.ts';
import { getArtifactConfig } from './targets/index.ts';
import type { ArtifactType, RenderResult, TargetName, Warning } from './types.ts';

export interface RenderOptions {
  sourceDir: string;
  target: TargetName;
  outDir: string;
  artifact?: ArtifactType;
}

export interface ArtifactProjectionOptions {
  sourcePath: string;
  source: string;
  target: TargetName;
  artifact: ArtifactType;
  resourcePaths?: readonly string[];
}

export interface ProjectedResource {
  sourcePath: string;
  relativePath: string;
}

export interface ProjectedGeneratedFile {
  relativePath: string;
  content: string;
}

export interface ArtifactProjection {
  artifactName: string;
  content: string;
  generatedFiles: readonly ProjectedGeneratedFile[];
  resources: readonly ProjectedResource[];
  warnings: readonly Warning[];
}

// The enumerated pattern table that used to live here is gone. It named eight
// literals and was silent about everything else, so whatever Claude shipped next
// passed unexamined. Both this path and marketplace compilation now resolve the
// same construct shapes against the same capability table; only the reporting
// differs, because a standalone render has no PACKAGE.yaml to declare a loss in
// and so can only warn.
// Everything agentforge emits today lands on a target's skill surface: Codex
// commands project to skills rather than to custom prompts, and `output-style`
// renders only to Claude, where every construct is native. If a target ever
// gains a second surface for a projected artifact, this needs to be derived
// rather than assumed.
const PROJECTED_SURFACE = 'skill';

// The enumerated pattern table that used to live here is gone. It named eight
// literals and was silent about everything else, so whatever Claude shipped next
// passed unexamined. Both this path and marketplace compilation now resolve the
// same construct shapes against the same capability table; only the reporting
// differs, because a standalone render has no PACKAGE.yaml to declare a loss in
// and so can only warn.
//
// `unsupported` and `unknown` are kept apart. A confirmed loss and an
// unrecognized shape warrant different words — collapsing them would report an
// ordinary `$PATH` as a Claude-only feature the target is about to drop.
const detectClaudeOnlyBodyFeatures = (
  body: string,
  target: TargetName,
): { lost: string[]; unclassified: string[] } => {
  const lost = new Set<string>();
  const unclassified = new Set<string>();
  for (const shape of findConstructShapes(body)) {
    const support = supportFor(target, PROJECTED_SURFACE, shape.token);
    if (support === 'unsupported') lost.add(shape.literal);
    else if (support === 'unknown') unclassified.add(shape.literal);
  }
  return { lost: [...lost].toSorted(), unclassified: [...unclassified].toSorted() };
};

const pickKeys = (
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) out[key] = obj[key];
  }
  return out;
};

const omitKey = <T extends Record<string, unknown>>(
  obj: T,
  key: string,
): Record<string, unknown> => {
  const { [key]: _, ...rest } = obj;
  return rest;
};

export const projectArtifact = (opts: ArtifactProjectionOptions): ArtifactProjection => {
  const { sourcePath, source, target, artifact, resourcePaths = [] } = opts;
  const artifactDef = ARTIFACT_DEFS[artifact];
  const artifactConfig = getArtifactConfig(target, artifact);
  if (!artifactConfig) {
    throw new Error(`target ${target} does not support artifact ${artifact}`);
  }

  const parsed = matter(source);
  const data = artifactDef.canonicalSchema.parse(parsed.data) as Record<string, unknown> & {
    targets?: Record<string, unknown>;
  };
  const canonicalBody = parsed.content;

  const { targets, ...canonicalFrontmatter } = data;
  const overrideRaw = (targets?.[target] as Record<string, unknown> | undefined) ?? {};
  const overrideBody =
    typeof (overrideRaw as { body?: unknown }).body === 'string'
      ? (overrideRaw as { body: string }).body
      : undefined;
  const overrideFields = omitKey(overrideRaw as Record<string, unknown>, 'body');

  const merged = deepMerge(canonicalFrontmatter as Record<string, unknown>, overrideFields);
  const body = overrideBody ?? canonicalBody;
  const filtered = pickKeys(merged, artifactConfig.allowedFrontmatterKeys);
  artifactConfig.outputFrontmatterSchema.parse(filtered);

  const warnings: Warning[] = [];
  if (target !== 'claude') {
    const claudeOnlyPresent = Object.keys(canonicalFrontmatter).filter(
      (key) =>
        CLAUDE_ONLY_KEYS.has(key) &&
        !(target === 'codex' && artifact === 'skill' && key === 'disable-model-invocation'),
    );
    if (claudeOnlyPresent.length > 0) {
      warnings.push({
        kind: 'claude-only-frontmatter-stripped',
        target,
        detail: `stripped ${claudeOnlyPresent.join(', ')}`,
      });
    }
    if (overrideBody === undefined) {
      const { lost, unclassified } = detectClaudeOnlyBodyFeatures(canonicalBody, target);
      if (lost.length > 0) {
        warnings.push({
          kind: 'claude-only-body-feature',
          target,
          detail: `body uses ${lost.join(', ')} but no targets.${target}.body override`,
        });
      }
      if (unclassified.length > 0) {
        warnings.push({
          kind: 'unclassified-body-construct',
          target,
          detail: `body uses ${unclassified.join(', ')}, which no capability-table entry covers`,
        });
      }
    }
  }

  const artifactName =
    typeof (filtered as { name?: unknown }).name === 'string' &&
    (filtered as { name: string }).name.length > 0
      ? (filtered as { name: string }).name
      : nameFromSourceDir(dirname(sourcePath));

  const rendered = matter.stringify(body, filtered);
  const generatedFiles =
    target === 'codex' && artifact === 'skill' && merged['disable-model-invocation'] === true
      ? [
          {
            relativePath: 'agents/openai.yaml',
            content: 'policy:\n  allow_implicit_invocation: false\n',
          },
        ]
      : [];
  const sourceDir = dirname(sourcePath);
  const resources = resourcePaths
    .map((resourcePath) => ({
      sourcePath: resourcePath,
      relativePath: relative(sourceDir, resourcePath).split('\\').join('/'),
    }))
    .filter(({ relativePath }) => {
      const [subdir] = relativePath.split('/');
      return subdir !== undefined && artifactConfig.resourceSubdirs.has(subdir);
    })
    .toSorted((left, right) => {
      if (left.relativePath < right.relativePath) return -1;
      if (left.relativePath > right.relativePath) return 1;
      return 0;
    });

  return { artifactName, content: rendered, generatedFiles, resources, warnings };
};

export const render = async (opts: RenderOptions): Promise<RenderResult> => {
  const { sourceDir, target, outDir, artifact = 'skill' } = opts;
  const artifactDef = ARTIFACT_DEFS[artifact];
  const canonicalFile = join(sourceDir, artifactDef.canonicalFilename);
  if (!existsSync(canonicalFile)) {
    throw new Error(`${artifactDef.canonicalFilename} not found at ${canonicalFile}`);
  }

  const artifactConfig = getArtifactConfig(target, artifact);
  if (!artifactConfig) {
    throw new Error(`target ${target} does not support artifact ${artifact}`);
  }

  const resourcePaths = [...artifactConfig.resourceSubdirs].flatMap((subdir) => {
    const resourceDir = join(sourceDir, subdir);
    return existsSync(resourceDir)
      ? walkFiles(resourceDir).map((path) => join(resourceDir, path))
      : [];
  });
  const projection = projectArtifact({
    sourcePath: canonicalFile,
    source: readFileSync(canonicalFile, 'utf-8'),
    target,
    artifact,
    resourcePaths,
  });
  const resourcesCopied = [
    ...new Set(projection.resources.map(({ relativePath }) => relativePath.split('/')[0])),
  ];

  if (artifactDef.layout === 'file') {
    mkdirSync(outDir, { recursive: true });
    const outputPath = join(outDir, `${projection.artifactName}.md`);
    writeFileSync(outputPath, projection.content, 'utf-8');
    return { outputPath, resourcesCopied, warnings: [...projection.warnings] };
  }

  const isZip = artifactConfig.bundle === 'zip';
  const tempRoot = isZip ? mkdtempSync(join(tmpdir(), 'agentforge-zip-')) : null;
  const materializeDir = tempRoot ? join(tempRoot, projection.artifactName) : outDir;

  mkdirSync(materializeDir, { recursive: true });
  const canonicalOutPath = join(materializeDir, artifactDef.canonicalFilename);
  writeFileSync(canonicalOutPath, projection.content, 'utf-8');

  for (const generatedFile of projection.generatedFiles) {
    const destination = join(materializeDir, generatedFile.relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, generatedFile.content, 'utf-8');
  }

  for (const resource of projection.resources) {
    const destination = join(materializeDir, resource.relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resource.sourcePath, destination);
  }

  let outputPath = canonicalOutPath;
  if (tempRoot) {
    const zip = new JSZip();
    for (const rel of walkFiles(tempRoot)) {
      zip.file(rel, readFileSync(join(tempRoot, rel)));
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    mkdirSync(outDir, { recursive: true });
    outputPath = join(outDir, `${projection.artifactName}.zip`);
    writeFileSync(outputPath, buf);
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return {
    outputPath,
    resourcesCopied,
    warnings: [...projection.warnings],
  };
};

const walkFiles = (root: string): string[] => {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        visit(abs);
      } else {
        out.push(relative(root, abs));
      }
    }
  };
  visit(root);
  return out.toSorted();
};

export const nameFromSourceDir = (sourceDir: string): string => basename(sourceDir);

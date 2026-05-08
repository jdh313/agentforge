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
import { basename, join, relative } from 'node:path';
import matter from 'gray-matter';
import JSZip from 'jszip';
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

// biome-ignore-start lint/suspicious/noTemplateCurlyInString: labels are literal docs of Claude-only patterns
const CLAUDE_ONLY_BODY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\$ARGUMENTS\b/, label: '$ARGUMENTS' },
  { pattern: /\$ARGUMENTS\[\d+\]/, label: '$ARGUMENTS[N]' },
  { pattern: /(?<![A-Za-z_])\$\d+/, label: '$N positional' },
  { pattern: /\$\{CLAUDE_SKILL_DIR\}/, label: '${CLAUDE_SKILL_DIR}' },
  { pattern: /\$\{CLAUDE_SESSION_ID\}/, label: '${CLAUDE_SESSION_ID}' },
  { pattern: /\$\{CLAUDE_EFFORT\}/, label: '${CLAUDE_EFFORT}' },
  { pattern: /(^|\n)!`[^`]+`/, label: 'inline shell !`...`' },
  { pattern: /(^|\n)```!/, label: 'fenced shell ```!' },
];
// biome-ignore-end lint/suspicious/noTemplateCurlyInString: labels are literal docs of Claude-only patterns

const detectClaudeOnlyBodyFeatures = (body: string): string[] =>
  CLAUDE_ONLY_BODY_PATTERNS.filter(({ pattern }) => pattern.test(body)).map(({ label }) => label);

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

  const raw = readFileSync(canonicalFile, 'utf-8');
  const parsed = matter(raw);
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
    const claudeOnlyPresent = Object.keys(canonicalFrontmatter).filter((k) =>
      CLAUDE_ONLY_KEYS.has(k),
    );
    if (claudeOnlyPresent.length > 0) {
      warnings.push({
        kind: 'claude-only-frontmatter-stripped',
        target,
        detail: `stripped ${claudeOnlyPresent.join(', ')}`,
      });
    }
    if (overrideBody === undefined) {
      const features = detectClaudeOnlyBodyFeatures(canonicalBody);
      if (features.length > 0) {
        warnings.push({
          kind: 'claude-only-body-feature',
          target,
          detail: `body uses ${features.join(', ')} but no targets.${target}.body override`,
        });
      }
    }
  }

  const artifactName =
    typeof (filtered as { name?: unknown }).name === 'string' &&
    (filtered as { name: string }).name.length > 0
      ? (filtered as { name: string }).name
      : nameFromSourceDir(sourceDir);

  const rendered = matter.stringify(body, filtered);
  const resourcesCopied: string[] = [];

  if (artifactDef.layout === 'file') {
    mkdirSync(outDir, { recursive: true });
    const outputPath = join(outDir, `${artifactName}.md`);
    writeFileSync(outputPath, rendered, 'utf-8');
    return { outputPath, resourcesCopied, warnings };
  }

  const isZip = artifactConfig.bundle === 'zip';
  const tempRoot = isZip ? mkdtempSync(join(tmpdir(), 'agentforge-zip-')) : null;
  const materializeDir = tempRoot ? join(tempRoot, artifactName) : outDir;

  mkdirSync(materializeDir, { recursive: true });
  const canonicalOutPath = join(materializeDir, artifactDef.canonicalFilename);
  writeFileSync(canonicalOutPath, rendered, 'utf-8');

  for (const sub of artifactConfig.resourceSubdirs) {
    const srcSub = join(sourceDir, sub);
    if (existsSync(srcSub)) {
      const destSub = join(materializeDir, sub);
      cpSync(srcSub, destSub, { recursive: true });
      resourcesCopied.push(sub);
    }
  }

  let outputPath = canonicalOutPath;
  if (tempRoot) {
    const zip = new JSZip();
    for (const rel of walkFiles(tempRoot)) {
      zip.file(rel, readFileSync(join(tempRoot, rel)));
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    mkdirSync(outDir, { recursive: true });
    outputPath = join(outDir, `${artifactName}.zip`);
    writeFileSync(outputPath, buf);
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return {
    outputPath,
    resourcesCopied,
    warnings,
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

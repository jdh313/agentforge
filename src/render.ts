import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { deepMerge } from './deep-merge.ts';
import { CanonicalFrontmatter, CLAUDE_ONLY_KEYS } from './schema.ts';
import { getTarget } from './targets/index.ts';
import type { RenderResult, TargetName, Warning } from './types.ts';

export interface RenderOptions {
  sourceDir: string;
  target: TargetName;
  outDir: string;
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
  const { sourceDir, target, outDir } = opts;
  const skillFile = join(sourceDir, 'SKILL.md');
  if (!existsSync(skillFile)) {
    throw new Error(`SKILL.md not found at ${skillFile}`);
  }

  const raw = readFileSync(skillFile, 'utf-8');
  const parsed = matter(raw);
  const data = CanonicalFrontmatter.parse(parsed.data);
  const canonicalBody = parsed.content;

  const adapter = getTarget(target);
  const { targets, ...canonicalFrontmatter } = data;
  const overrideRaw = targets?.[target] ?? {};
  const overrideBody =
    typeof (overrideRaw as { body?: unknown }).body === 'string'
      ? (overrideRaw as { body: string }).body
      : undefined;
  const overrideFields = omitKey(overrideRaw as Record<string, unknown>, 'body');

  const merged = deepMerge(canonicalFrontmatter as Record<string, unknown>, overrideFields);
  const body = overrideBody ?? canonicalBody;
  const filtered = pickKeys(merged, adapter.allowedFrontmatterKeys);
  adapter.outputFrontmatterSchema.parse(filtered);

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

  mkdirSync(outDir, { recursive: true });
  const outputPath = join(outDir, 'SKILL.md');
  const rendered = matter.stringify(body, filtered);
  writeFileSync(outputPath, rendered, 'utf-8');

  const resourcesCopied: string[] = [];
  for (const sub of adapter.resourceSubdirs) {
    const srcSub = join(sourceDir, sub);
    if (existsSync(srcSub)) {
      const destSub = join(outDir, sub);
      cpSync(srcSub, destSub, { recursive: true });
      resourcesCopied.push(sub);
    }
  }

  return {
    outputPath,
    resourcesCopied,
    warnings,
  };
};

export const skillNameFromSourceDir = (sourceDir: string): string => basename(sourceDir);

import { z } from 'zod';
import type { ArtifactType } from './types.ts';

const TargetOverride = z.looseObject({
  body: z.string().optional(),
});

const TargetsBlock = z
  .object({
    claude: TargetOverride.optional(),
    opencode: TargetOverride.optional(),
    codex: TargetOverride.optional(),
    'claude-chat': TargetOverride.optional(),
  })
  .optional();

export const CanonicalSkillFrontmatter = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'name must be lowercase letters, digits, and hyphens')
    .max(64)
    .optional(),
  description: z.string(),

  when_to_use: z.string().optional(),
  'argument-hint': z.string().optional(),
  arguments: z.union([z.string(), z.array(z.string())]).optional(),
  'disable-model-invocation': z.boolean().optional(),
  'user-invocable': z.boolean().optional(),
  'allowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
  model: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  context: z.enum(['fork']).optional(),
  agent: z.string().optional(),
  hooks: z.unknown().optional(),
  paths: z.union([z.string(), z.array(z.string())]).optional(),
  shell: z.enum(['bash', 'powershell']).optional(),

  targets: TargetsBlock,
});

export type CanonicalSkillFrontmatterT = z.infer<typeof CanonicalSkillFrontmatter>;

export const CanonicalOutputStyleFrontmatter = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'name must be lowercase letters, digits, and hyphens')
    .max(64)
    .optional(),
  description: z.string(),
  'keep-coding-instructions': z.boolean().optional(),
  'force-for-plugin': z.boolean().optional(),

  targets: TargetsBlock,
});

export type CanonicalOutputStyleFrontmatterT = z.infer<typeof CanonicalOutputStyleFrontmatter>;

export const CLAUDE_ONLY_KEYS: ReadonlySet<string> = new Set([
  'when_to_use',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'hooks',
  'paths',
  'shell',
]);

export const COMMON_KEYS: ReadonlySet<string> = new Set(['name', 'description']);

export const ALL_CLAUDE_KEYS: ReadonlySet<string> = new Set([...COMMON_KEYS, ...CLAUDE_ONLY_KEYS]);

export const OUTPUT_STYLE_KEYS: ReadonlySet<string> = new Set([
  'name',
  'description',
  'keep-coding-instructions',
  'force-for-plugin',
]);

export interface ArtifactDefinition {
  canonicalFilename: string;
  canonicalSchema: z.ZodType;
  layout: 'directory' | 'file';
}

export const ARTIFACT_DEFS: Record<ArtifactType, ArtifactDefinition> = {
  skill: {
    canonicalFilename: 'SKILL.md',
    canonicalSchema: CanonicalSkillFrontmatter,
    layout: 'directory',
  },
  'output-style': {
    canonicalFilename: 'OUTPUT_STYLE.md',
    canonicalSchema: CanonicalOutputStyleFrontmatter,
    layout: 'file',
  },
};

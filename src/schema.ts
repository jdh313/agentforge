import { z } from 'zod';

const TargetOverride = z.looseObject({
  body: z.string().optional(),
});

export const CanonicalFrontmatter = z.object({
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

  targets: z
    .object({
      claude: TargetOverride.optional(),
      opencode: TargetOverride.optional(),
      codex: TargetOverride.optional(),
    })
    .optional(),
});

export type CanonicalFrontmatterT = z.infer<typeof CanonicalFrontmatter>;

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

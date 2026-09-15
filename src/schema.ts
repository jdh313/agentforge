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
    pi: TargetOverride.optional(),
    'claude-chat': TargetOverride.optional(),
  })
  .optional();

// Loose on purpose. A closed object here discards an unrecognized key before any
// target adapter runs, before checked-in acceptance filtering, and before the
// construct detector scans — so a key agentforge has not learned yet ceases to
// exist with nothing reported. That is the inverse of ndr:17dhph, which keeps
// generated native documents open precisely to retain unrecognized keys; the
// input side, where the author's intent enters, has the stronger claim on the
// same rule. The checked-in target key table then decides what may be emitted;
// an unrecognized key is reported and stripped on every target.
export const CanonicalSkillFrontmatter = z.looseObject({
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
  'disallowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
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

export const CanonicalOutputStyleFrontmatter = z.looseObject({
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

export interface ArtifactDefinition {
  canonicalFilename: string;
  canonicalSchema: z.ZodType;
  // The keys this artifact's canonical schema enumerates. Read off the schema
  // rather than restated, so a fourteenth key is recognized by adding it in one
  // place. A key outside this set is one agentforge has never heard of — which
  // is a different fact from a key a particular target does not accept, and the
  // two must not be reported with the same words.
  canonicalKeys: ReadonlySet<string>;
  layout: 'directory' | 'file';
}

const keysOf = (schema: z.ZodObject): ReadonlySet<string> => new Set(Object.keys(schema.shape));

export const ARTIFACT_DEFS: Record<ArtifactType, ArtifactDefinition> = {
  skill: {
    canonicalFilename: 'SKILL.md',
    canonicalSchema: CanonicalSkillFrontmatter,
    canonicalKeys: keysOf(CanonicalSkillFrontmatter),
    layout: 'directory',
  },
  'output-style': {
    canonicalFilename: 'OUTPUT_STYLE.md',
    canonicalSchema: CanonicalOutputStyleFrontmatter,
    canonicalKeys: keysOf(CanonicalOutputStyleFrontmatter),
    layout: 'file',
  },
};

import { z } from 'zod';
import type { ArtifactType } from './types.ts';

const TargetOverride = z.looseObject({
  body: z.string().optional(),
});

export const CanonicalAgentName = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'name must be a lowercase hyphenated identifier');

const ToolList = z.union([z.string(), z.array(z.string())]);

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

// Claude Code's agent loader accepts either a YAML boolean or the literal
// strings "true"/"false" for its two boolean-ish keys, so the canonical schema
// accepts exactly what the runtime does. Narrowing to `z.boolean()` would
// refuse a document Claude loads.
const LoaderBoolean = z.union([z.boolean(), z.enum(['true', 'false'])]);

// This is also the package-agent parser's schema. Leaf rendering and
// marketplace compilation must normalize one canonical behavior model rather
// than maintain parallel interpretations of the same source (0.8 boundary).
//
// The key set is the one Claude Code's shipped `.claude/agents/*.md` loader
// reads and validates (2.1.274), because a key the source dialect's own runtime
// enforces must not reach ndr:4x4yyv's unrecognized-key path: that rule strips
// a key nobody has ruled on, and stripping `permissionMode` or `disallowedTools`
// out of Claude's own projection silently discards a restriction the author
// wrote. Values are typed to the loader's own validation, and only where the
// loader *rejects* a bad value — where it silently ignores one instead (`color`,
// `hooks` shape, `experimental` shape), the schema stays as loose as the runtime
// so agentforge never refuses a document Claude accepts.
//
// Deliberately absent: `observer`, `observerMessage`, `observeSubagents`. The
// loader reads all three, but no published documentation does, so enumerating
// them would claim a contract that nothing backs.
export const CanonicalAgentFrontmatter = z.looseObject({
  name: CanonicalAgentName,
  description: z.string().min(1),
  model: z.string().min(1).optional(),
  maxTurns: z.number().int().positive().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  tools: ToolList.optional(),

  disallowedTools: ToolList.optional(),
  permissionMode: z
    .enum(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan', 'manual'])
    .optional(),
  isolation: z.enum(['worktree', 'remote']).optional(),
  memory: z.enum(['user', 'project', 'local']).optional(),
  background: LoaderBoolean.optional(),
  omitClaudeMd: LoaderBoolean.optional(),
  skills: ToolList.optional(),
  initialPrompt: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  mcpServers: z.array(z.unknown()).optional(),
  hooks: z.unknown().optional(),
  experimental: z.unknown().optional(),

  targets: TargetsBlock,
});

export type CanonicalAgentFrontmatterT = z.infer<typeof CanonicalAgentFrontmatter>;

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
  agent: {
    canonicalFilename: 'AGENT.md',
    canonicalSchema: CanonicalAgentFrontmatter,
    canonicalKeys: keysOf(CanonicalAgentFrontmatter),
    layout: 'file',
  },
  'output-style': {
    canonicalFilename: 'OUTPUT_STYLE.md',
    canonicalSchema: CanonicalOutputStyleFrontmatter,
    canonicalKeys: keysOf(CanonicalOutputStyleFrontmatter),
    layout: 'file',
  },
};

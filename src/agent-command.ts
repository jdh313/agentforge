import { basename, extname } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { CanonicalAgentFrontmatter, CanonicalAgentName } from './schema.ts';

const Slug = CanonicalAgentName;

const ToolList = z.union([z.string(), z.array(z.string())]);

const CommandFrontmatter = z.looseObject({
  name: Slug.optional(),
  description: z.string().min(1),
  'argument-hint': z.string().min(1).optional(),
  'allowed-tools': ToolList.optional(),
  'short-description': z.string().min(1).optional(),
});

interface CanonicalBehavior {
  name: string;
  description: string;
  instructions: string;
  source: string;
  sourceFrontmatter: Record<string, unknown>;
}

export type CanonicalAgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type CanonicalAgentReasoningSummary = 'auto' | 'concise' | 'detailed' | 'none';
export type CanonicalAgentVerbosity = 'low' | 'medium' | 'high';
export type CanonicalAgentSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type CanonicalAgentApprovalPolicy = 'on-request' | 'never';

export interface CanonicalAgentExecution {
  model?: string;
  maxTurns?: number;
  effort?: CanonicalAgentEffort;
  reasoningSummary?: CanonicalAgentReasoningSummary;
  verbosity?: CanonicalAgentVerbosity;
  sandboxMode?: CanonicalAgentSandboxMode;
  approvalPolicy?: CanonicalAgentApprovalPolicy;
  tools?: string | string[];
}

export interface CanonicalAgentBehavior extends CanonicalBehavior {
  kind: 'agent';
  execution: CanonicalAgentExecution;
}

const CANONICAL_EFFORTS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);

const CANONICAL_REASONING_SUMMARIES = new Set<string>(['auto', 'concise', 'detailed', 'none']);
const CANONICAL_VERBOSITIES = new Set<string>(['low', 'medium', 'high']);
const CANONICAL_SANDBOX_MODES = new Set<string>([
  'read-only',
  'workspace-write',
  'danger-full-access',
]);
const CANONICAL_APPROVAL_POLICIES = new Set<string>(['on-request', 'never']);

function isCanonicalSandboxMode(value: unknown): value is CanonicalAgentSandboxMode {
  return typeof value === 'string' && CANONICAL_SANDBOX_MODES.has(value);
}

function isCanonicalApprovalPolicy(value: unknown): value is CanonicalAgentApprovalPolicy {
  return typeof value === 'string' && CANONICAL_APPROVAL_POLICIES.has(value);
}

function isCanonicalReasoningSummary(value: unknown): value is CanonicalAgentReasoningSummary {
  return typeof value === 'string' && CANONICAL_REASONING_SUMMARIES.has(value);
}

function isCanonicalVerbosity(value: unknown): value is CanonicalAgentVerbosity {
  return typeof value === 'string' && CANONICAL_VERBOSITIES.has(value);
}

function isCanonicalEffort(value: unknown): value is CanonicalAgentEffort {
  return typeof value === 'string' && CANONICAL_EFFORTS.has(value);
}

// Shared by the package-agent parser and the leaf render pipeline
// (`src/render.ts`), so the two never drift into separate interpretations of
// which loosely-typed fields become which execution settings. Every field is
// read defensively (not assumed pre-validated) because the leaf pipeline's
// merged frontmatter bag is not schema-checked the way `parsed.data` here is.
export function agentExecutionFrom(fields: {
  model?: unknown;
  maxTurns?: unknown;
  effort?: unknown;
  'reasoning-summary'?: unknown;
  verbosity?: unknown;
  'sandbox-mode'?: unknown;
  'approval-policy'?: unknown;
  tools?: unknown;
}): CanonicalAgentExecution {
  return {
    ...(typeof fields.model === 'string' ? { model: fields.model } : {}),
    ...(typeof fields.maxTurns === 'number' ? { maxTurns: fields.maxTurns } : {}),
    ...(isCanonicalEffort(fields.effort) ? { effort: fields.effort } : {}),
    ...(isCanonicalReasoningSummary(fields['reasoning-summary'])
      ? { reasoningSummary: fields['reasoning-summary'] }
      : {}),
    ...(isCanonicalVerbosity(fields.verbosity) ? { verbosity: fields.verbosity } : {}),
    ...(isCanonicalSandboxMode(fields['sandbox-mode'])
      ? { sandboxMode: fields['sandbox-mode'] }
      : {}),
    ...(isCanonicalApprovalPolicy(fields['approval-policy'])
      ? { approvalPolicy: fields['approval-policy'] }
      : {}),
    ...(fields.tools !== undefined ? { tools: fields.tools as string | string[] } : {}),
  };
}

export interface CanonicalCommandBehavior extends CanonicalBehavior {
  kind: 'command';
  // Codex-only UI blurb (`interface.short_description`); never derived from `description`.
  shortDescription?: string;
  invocation: {
    argumentHint?: string;
    allowedTools?: string | string[];
  };
}

export function parseAgentBehavior(sourcePath: string, source: string): CanonicalAgentBehavior {
  const parsed = parseBehaviorSource(
    sourcePath,
    source,
    CanonicalAgentFrontmatter,
    'agent',
    basename(sourcePath, extname(sourcePath)),
  );
  return {
    kind: 'agent',
    ...parsed.common,
    execution: agentExecutionFrom(parsed.data),
  };
}

export function parseCommandBehavior(sourcePath: string, source: string): CanonicalCommandBehavior {
  const parsed = parseBehaviorSource(sourcePath, source, CommandFrontmatter, 'command');
  return {
    kind: 'command',
    ...parsed.common,
    ...(parsed.data['short-description'] === undefined
      ? {}
      : { shortDescription: parsed.data['short-description'] }),
    invocation: {
      ...(parsed.data['argument-hint'] === undefined
        ? {}
        : { argumentHint: parsed.data['argument-hint'] }),
      ...(parsed.data['allowed-tools'] === undefined
        ? {}
        : { allowedTools: parsed.data['allowed-tools'] }),
    },
  };
}

function parseBehaviorSource<T extends { name?: string; description: string }>(
  sourcePath: string,
  source: string,
  schema: z.ZodType<T>,
  kind: string,
  fallbackName = basename(sourcePath, extname(sourcePath)),
): { data: T; common: CanonicalBehavior } {
  const parsed = matter(source);
  const data = schema.parse(
    parsed.data.name === undefined ? { ...parsed.data, name: fallbackName } : parsed.data,
  );
  if (parsed.content.trim().length === 0) {
    throw new Error(`${sourcePath}: ${kind} instructions must not be empty`);
  }

  return {
    data,
    common: {
      name: Slug.parse(data.name ?? basename(sourcePath, extname(sourcePath))),
      description: data.description,
      instructions: parsed.content,
      source,
      sourceFrontmatter: { ...parsed.data },
    },
  };
}

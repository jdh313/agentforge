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
});

interface CanonicalBehavior {
  name: string;
  description: string;
  instructions: string;
  source: string;
  sourceFrontmatter: Record<string, unknown>;
}

export type CanonicalAgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CanonicalAgentExecution {
  model?: string;
  maxTurns?: number;
  effort?: CanonicalAgentEffort;
  tools?: string | string[];
}

export interface CanonicalAgentBehavior extends CanonicalBehavior {
  kind: 'agent';
  execution: CanonicalAgentExecution;
}

const CANONICAL_EFFORTS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);

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
  tools?: unknown;
}): CanonicalAgentExecution {
  return {
    ...(typeof fields.model === 'string' ? { model: fields.model } : {}),
    ...(typeof fields.maxTurns === 'number' ? { maxTurns: fields.maxTurns } : {}),
    ...(isCanonicalEffort(fields.effort) ? { effort: fields.effort } : {}),
    ...(fields.tools !== undefined ? { tools: fields.tools as string | string[] } : {}),
  };
}

export interface CanonicalCommandBehavior extends CanonicalBehavior {
  kind: 'command';
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

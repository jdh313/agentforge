import { basename, extname } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';

const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'name must be a lowercase hyphenated identifier');

const ToolList = z.union([z.string(), z.array(z.string())]);

const AgentFrontmatter = z.looseObject({
  name: Slug.optional(),
  description: z.string().min(1),
  model: z.string().min(1).optional(),
  maxTurns: z.number().int().positive().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  tools: ToolList.optional(),
});

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

export interface CanonicalAgentBehavior extends CanonicalBehavior {
  kind: 'agent';
  execution: {
    model?: string;
    maxTurns?: number;
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    tools?: string | string[];
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
  const parsed = parseBehaviorSource(sourcePath, source, AgentFrontmatter, 'agent');
  return {
    kind: 'agent',
    ...parsed.common,
    execution: {
      ...(parsed.data.model === undefined ? {} : { model: parsed.data.model }),
      ...(parsed.data.maxTurns === undefined ? {} : { maxTurns: parsed.data.maxTurns }),
      ...(parsed.data.effort === undefined ? {} : { effort: parsed.data.effort }),
      ...(parsed.data.tools === undefined ? {} : { tools: parsed.data.tools }),
    },
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
): { data: T; common: CanonicalBehavior } {
  const parsed = matter(source);
  const data = schema.parse(parsed.data);
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

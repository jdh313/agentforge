import { join } from 'node:path';
import { z } from 'zod';
import type { CanonicalAgentBehavior } from '../agent-command.ts';
import { CanonicalAgentName } from '../schema.ts';
import {
  agentSkillsTarget,
  type NativeAgentDocument,
  type NativeAgentDocumentContext,
  type TargetAdapter,
} from '../target-adapter.ts';

const CodexOutputFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
});

// Mirrors the accepted-key set `src/frontmatter.ts` grants Codex for the
// `agent` artifact (name, description, effort) — this validates the leaf
// projection's merged frontmatter bag, not the emitted TOML field names,
// which `codexAgentDocument.serialize` below renames on the way out. `model`
// is deliberately absent: it never reaches Codex through the merged bag (see
// `src/render.ts`'s native-document model sourcing), only through a raw
// `targets.codex.model` override this schema never sees.
const CodexAgentOutputFrontmatter = z.looseObject({
  name: CanonicalAgentName,
  description: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
});

// A TOML basic string allows any Unicode scalar value except an unescaped
// control character (U+0000-U+001F, U+007F) and the two characters TOML
// itself uses for delimiting (`"`, `\`). `JSON.stringify` looked close enough
// at a glance — same named escapes for `\n`/`\t`/etc — but it does not escape
// U+007F (DEL) at all, and it never rejects a lone UTF-16 surrogate (neither
// TOML nor Unicode has a scalar value for one), so it can silently produce
// invalid TOML or a string with no faithful meaning. This escapes exactly
// what the TOML spec requires and refuses a lone surrogate outright instead
// of guessing at a replacement.
function assertUnicodeScalarValues(value: string, sourcePath: string, field: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
        throw new Error(
          `${sourcePath}: ${field} contains a lone UTF-16 surrogate at index ${index}, which is not a valid Unicode scalar value and cannot be represented in TOML`,
        );
      }
      index += 1; // valid pair consumed together; skip its low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(
        `${sourcePath}: ${field} contains a lone UTF-16 surrogate at index ${index}, which is not a valid Unicode scalar value and cannot be represented in TOML`,
      );
    }
  }
}

const NAMED_ESCAPES: Readonly<Record<number, string>> = {
  8: '\\b', // U+0008
  9: '\\t', // U+0009
  10: '\\n', // U+000A
  12: '\\f', // U+000C
  13: '\\r', // U+000D
};

function tomlString(value: string, sourcePath: string, field: string): string {
  assertUnicodeScalarValues(value, sourcePath, field);
  let out = '"';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] as string;
    const code = value.charCodeAt(index);
    if (char === '"') {
      out += '\\"';
    } else if (char === '\\') {
      out += '\\\\';
    } else if (NAMED_ESCAPES[code] !== undefined) {
      out += NAMED_ESCAPES[code];
    } else if (code <= 0x1f || code === 0x7f) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += char;
    }
  }
  return `${out}"`;
}

// codex-cli 0.154.0 agent-role TOML: `name`, `description`, and a required
// non-blank `developer_instructions` (verified via the binary's
// `.developer_instructions cannot be blank` / `must define developer_instructions`
// validation strings). `model` and `model_reasoning_effort` map directly —
// every canonical effort value is a confirmed-accepted Codex reasoning-effort
// string per the bundled model catalog's `supported_reasoning_levels` list
// (low, medium, high, xhigh, max, ultra). There is no per-role turn-limit key
// and no tool-allowlist key anywhere in the binary's agent-role or plugin-
// manifest field sets, so `maxTurns` and `tools` are never emitted here; the
// shared leaf pipeline already reports both as `claude-only-frontmatter-stripped`
// once `src/frontmatter.ts` withholds them from Codex's accepted-key set.
// `sandbox_mode` is available through the flattened role config layer but is
// deliberately never set from `tools`, `disallowedTools`, or `permissionMode`:
// filesystem/network sandboxing cannot preserve named-tool or source approval
// policy. Those fields are permanent losses on this projection (ndr:bqyqfd).
const codexAgentDocument: NativeAgentDocument = {
  extension: '.toml',
  serialize(behavior: CanonicalAgentBehavior, { sourcePath }: NativeAgentDocumentContext) {
    const string = (value: string, field: string) => tomlString(value, sourcePath, field);
    const lines = [
      `name = ${string(behavior.name, 'name')}`,
      `description = ${string(behavior.description, 'description')}`,
    ];
    if (behavior.execution.model !== undefined) {
      lines.push(`model = ${string(behavior.execution.model, 'model')}`);
    }
    if (behavior.execution.effort !== undefined) {
      lines.push(
        `model_reasoning_effort = ${string(behavior.execution.effort, 'model_reasoning_effort')}`,
      );
    }
    lines.push(
      `developer_instructions = ${string(behavior.instructions.trim(), 'developer_instructions')}`,
    );
    return { content: `${lines.join('\n')}\n`, warnings: [] };
  },
};

const codexAgentSkills = agentSkillsTarget({
  name: 'codex',
  label: 'Codex',
  installLocations: {
    user: ({ homeDirectory }) => join(homeDirectory, '.agents/skills'),
    project: ({ projectRoot }) => join(projectRoot, '.agents/skills'),
    plugin: ({ pluginRoot }) => {
      if (pluginRoot === undefined) {
        throw new Error('install scope plugin for target codex requires --plugin-root <dir>');
      }
      return join(pluginRoot, 'skills');
    },
  },
  outputFrontmatterSchema: CodexOutputFrontmatter,
});

export const codexTarget = {
  ...codexAgentSkills,
  artifacts: {
    ...codexAgentSkills.artifacts,
    agent: {
      // codex-cli 0.155.1 discovers standalone roles from both the user and
      // project config layers. Project roles live beside `.codex/config.toml`
      // in `.codex/agents`; explicit `agent_type` selection was verified live
      // on 2026-09-21 (docs/limitations.md L-011 and L-012).
      installLocations: {
        user: ({ homeDirectory }) => join(homeDirectory, '.codex/agents'),
        project: ({ projectRoot }) => join(projectRoot, '.codex/agents'),
      },
      surface: 'agent' as const,
      resourceSubdirs: new Set<string>(),
      outputFrontmatterSchema: CodexAgentOutputFrontmatter,
      nativeDocument: codexAgentDocument,
    },
  },
} satisfies TargetAdapter;

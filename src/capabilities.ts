import type { TargetName } from './types.ts';

// A target may expose more than one surface with different capabilities. Codex
// documents `$ARGUMENTS` / `$1`-`$9` on custom prompts and documents no
// templating for skills, so "does Codex support $ARGUMENTS" has no single
// answer. Keying the table on target alone would encode a falsehood
// (ndr:grjvxz's sibling finding; see .docs/model-review-2026-07-31-*).
export type ConstructSurface = 'skill' | 'prompt';

// Families are shapes, not an enumerated blocklist. A body construct that
// matches a family but carries a token nobody listed resolves to `unknown` and
// is reported — the inverse of the old regex list, which was silent about
// everything it did not name.
export type ConstructFamily =
  | 'template-variable'
  | 'positional-argument'
  | 'inline-shell'
  | 'fenced-shell'
  | 'file-reference'
  | 'mcp-tool';

export interface ConstructShape {
  family: ConstructFamily;
  // Normalized label the capability table is keyed on: `$ARGUMENTS`,
  // `${CLAUDE_*}`, `$UPPER`, `$N`, or the family name for non-variable shapes.
  token: string;
  // The literal source text, for the diagnostic message.
  literal: string;
  line: number;
}

export type Support = 'supported' | 'unsupported' | 'unknown';

interface CapabilityRow {
  supported: readonly string[];
  unsupported: readonly string[];
  source: string;
}

// `$UPPER` is deliberately absent from every row. A bare `$FOO` in prose is as
// likely to be a shell variable being discussed as a Claude named argument, so
// it resolves to `unknown` and is reported rather than gated — confirming a loss
// is the precondition for gating one (ndr:4nshwv).
// biome-ignore-start lint/suspicious/noTemplateCurlyInString: tokens are literal docs of Claude-only patterns
const CLAUDE_TOKENS = [
  '$ARGUMENTS',
  '$N',
  '${CLAUDE_*}',
  'inline-shell',
  'fenced-shell',
  'file-reference',
  'mcp-tool',
] as const;

// One row per (target, surface). Each carries a doc citation so a future reader
// can check the claim rather than trusting the table. Checked in deliberately —
// fetching capability docs at compile time would make builds non-deterministic.
const CAPABILITIES: ReadonlyMap<string, CapabilityRow> = new Map([
  [
    'claude/skill',
    {
      supported: CLAUDE_TOKENS,
      unsupported: [],
      source: 'Claude Code is the source dialect; every construct is native.',
    },
  ],
  [
    'codex/skill',
    {
      supported: [],
      unsupported: CLAUDE_TOKENS,
      source: 'https://learn.chatgpt.com/docs/build-skills.md — documents no body templating.',
    },
  ],
  [
    'codex/prompt',
    {
      supported: ['$ARGUMENTS', '$N'],
      unsupported: ['${CLAUDE_*}', 'inline-shell', 'fenced-shell', 'file-reference', 'mcp-tool'],
      source:
        'https://learn.chatgpt.com/docs/custom-prompts — supports $ARGUMENTS, $1-$9, named $UPPER; "No inline shell execution is supported."',
    },
  ],
  [
    'opencode/skill',
    {
      supported: [],
      unsupported: CLAUDE_TOKENS,
      source: 'https://opencode.ai/docs/skills.md — no templating, no shell, no tool namespace.',
    },
  ],
  [
    'claude-chat/skill',
    {
      supported: [],
      unsupported: CLAUDE_TOKENS,
      source: 'Uploaded chat skills run without Claude Code substitution or shell access.',
    },
  ],
]);

export function capabilitySource(
  target: TargetName,
  surface: ConstructSurface,
): string | undefined {
  return CAPABILITIES.get(`${target}/${surface}`)?.source;
}

export function supportFor(target: TargetName, surface: ConstructSurface, token: string): Support {
  const row = CAPABILITIES.get(`${target}/${surface}`);
  if (!row) return 'unknown';
  if (row.supported.includes(token)) return 'supported';
  if (row.unsupported.includes(token)) return 'unsupported';
  return 'unknown';
}

const PATTERNS: readonly {
  family: ConstructFamily;
  pattern: RegExp;
  token(match: string): string;
}[] = [
  {
    family: 'positional-argument',
    pattern: /(?<![A-Za-z_$])\$[1-9]\b/g,
    token: () => '$N',
  },
  {
    family: 'template-variable',
    pattern: /\$\{[A-Z_][A-Z0-9_]*\}|\$[A-Z_][A-Z0-9_]*\b/g,
    token: (match) => {
      const name = match.replace(/^\$\{?/, '').replace(/\}$/, '');
      if (name === 'ARGUMENTS') return '$ARGUMENTS';
      if (name.startsWith('CLAUDE_')) return '${CLAUDE_*}';
      return '$UPPER';
    },
  },
  {
    family: 'inline-shell',
    pattern: /(?<=^|\n)!`[^`\n]+`/g,
    token: () => 'inline-shell',
  },
  {
    family: 'fenced-shell',
    pattern: /(?<=^|\n)```!/g,
    token: () => 'fenced-shell',
  },
  // Claude's @-reference always contains a path separator. Requiring one keeps
  // ordinary @mentions and email-shaped text out of the match.
  {
    family: 'file-reference',
    pattern: /(?<=^|\s)@[\w.-]+\/[\w./-]+/g,
    token: () => 'file-reference',
  },
  // Claude tool names are namespaced `mcp__<server>__<tool>` and the server
  // segment may contain hyphens (`mcp__obsidian-mcp__read_note`).
  {
    family: 'mcp-tool',
    pattern: /\bmcp__[A-Za-z0-9_-]+/g,
    token: () => 'mcp-tool',
  },
];

// biome-ignore-end lint/suspicious/noTemplateCurlyInString: tokens are literal docs of Claude-only patterns

export function findConstructShapes(content: string): ConstructShape[] {
  const shapes: ConstructShape[] = [];
  for (const { family, pattern, token } of PATTERNS) {
    // Each entry owns a global regex; reset lastIndex so repeated scans over
    // different content cannot inherit a stale cursor.
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const literal = match[0];
      const index = match.index ?? 0;
      shapes.push({
        family,
        token: token(literal),
        literal,
        line: lineOf(content, index),
      });
    }
  }
  return shapes.toSorted(
    (left, right) => left.line - right.line || compare(left.token, right.token),
  );
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (content[position] === '\n') line += 1;
  }
  return line;
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

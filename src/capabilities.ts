import type { TargetName } from './types.ts';

// A target may expose more than one surface with different capabilities. Codex
// documents `$ARGUMENTS` / `$1`-`$9` on custom prompts and documents no
// templating for skills, so "does Codex support $ARGUMENTS" has no single
// answer. Keying the table on target alone would encode a falsehood
// (ndr:grjvxz's sibling finding; see .docs/model-review-2026-07-31-*).
//
// `hook` is a surface whose token vocabulary is lifecycle event names rather
// than body constructs. It is here for the same reason the other two are: the
// answer differs per target, cannot be observed locally, and so must carry a
// citation (ndr:g6xvyk). Before this row the fact lived in a hardcoded `Set` in
// the Codex adapter whose only citation was a code comment, and which could
// answer yes or no but never "not established" (L-009).
export type ConstructSurface = 'skill' | 'prompt' | 'hook';

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

export type Support = 'supported' | 'translated' | 'unsupported' | 'unknown';

interface CapabilityRow {
  supported: readonly string[];
  // Constructs this target's translator carries into a native form, keyed to
  // what each one becomes. A translated construct is not a loss, so it never
  // requires a declaration (ndr:4nshwv) — but it is still reported, because
  // "not detected" and "handled" look identical in a compile report otherwise.
  // This map is the single home for that fact: nothing else may encode it as an
  // inline exemption.
  translated?: Readonly<Record<string, string>>;
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

// Codex is the only target with translators today. `disable-model-invocation`
// is a frontmatter key rather than a body shape, so it is keyed by its literal
// name; the plugin-root variables are keyed by their literal spelling rather
// than the normalized `${CLAUDE_*}` token, because only these two are
// translated — `${CLAUDE_PROJECT_DIR}` and friends remain unsupported.
const CODEX_TRANSLATIONS: Readonly<Record<string, string>> = {
  'disable-model-invocation': 'agents/openai.yaml',
  '${CLAUDE_PLUGIN_ROOT}': '${PLUGIN_ROOT}',
  '${CLAUDE_PLUGIN_DATA}': '${PLUGIN_DATA}',
};

// The `codex/hook` token vocabulary: Codex lifecycle event names. Lives here
// rather than in the adapter that consumes it, because a translator reads what
// it may translate from the table (ndr:mfchxa) — a second literal list beside
// the translator is how this fact escaped the citation discipline to begin
// with. See the row's `source` for how the set was established.
const CODEX_HOOK_EVENTS = [
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'SessionStart',
  'SessionEnd',
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
      translated: CODEX_TRANSLATIONS,
      unsupported: CLAUDE_TOKENS,
      source:
        'https://learn.chatgpt.com/docs/build-skills.md — documents no body templating; agents/openai.yaml carries the invocation policy and ${PLUGIN_ROOT}/${PLUGIN_DATA} are the native hook variables. On allow_implicit_invocation the published page says only that Codex "won\'t implicitly invoke the skill", which reads as auto-trigger gating; the codex 0.146.0 binary\'s embedded skill-creator doc is the complete statement — "the skill is not injected into the model context by default, but can still be invoked explicitly via $skill". Verified 2026-08-02: a policy-gated skill is absent from the model\'s catalog and still runs from the $-picker, so the translation is faithful.',
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
    'codex/hook',
    {
      supported: CODEX_HOOK_EVENTS,
      // Confirmed absent rather than merely unlisted, which is why it is here
      // and not left to resolve as `unknown`.
      unsupported: ['Notification'],
      source:
        'codex-cli 0.147.0 binary, `HookEventsToml` field set. Verified 2026-08-09 with: `strings -a "$(readlink -f "$(which codex)")" | grep -o \'trusted_hash[A-Za-z]\\{0,140\\}\' | sort -u`. The maximal hook-context blob reads PreToolUse PermissionRequest PostToolUse PreCompact PostCompact SessionStart SessionEnd UserPromptSubmit SubagentStart SubagentStop Stop; shorter blobs are string-interning artifacts of the same set, and their union adds nothing. `Notification` occurs 189 times in the binary overall (JSON-RPC and MCP notifications) and in zero hook blobs, so its absence is a finding rather than an omission. Supersedes the manual 0.146.0 check that left no artifact in the repo.',
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
  // Translation is checked first and keyed on the literal token, so a specific
  // translated variable wins over the normalized family token that would
  // otherwise mark it unsupported.
  if (row.translated && Object.hasOwn(row.translated, token)) return 'translated';
  if (row.supported.includes(token)) return 'supported';
  if (row.unsupported.includes(token)) return 'unsupported';
  return 'unknown';
}

// What a translated construct becomes on this target, for the diagnostic that
// reports it. Undefined for every construct the target does not translate.
export function translationFor(
  target: TargetName,
  surface: ConstructSurface,
  token: string,
): string | undefined {
  return CAPABILITIES.get(`${target}/${surface}`)?.translated?.[token];
}

// Every construct this target translates, as (token, native form) pairs. A
// translator reads its rewrite rules from here rather than keeping a second
// literal list beside the table.
export function translationsFor(
  target: TargetName,
  surface: ConstructSurface,
): readonly (readonly [string, string])[] {
  return Object.entries(CAPABILITIES.get(`${target}/${surface}`)?.translated ?? {});
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

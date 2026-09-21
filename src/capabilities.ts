import type { ConstructSurface, InstallScope, TargetName } from './types.ts';

// A target may expose more than one surface with different capabilities. Codex
// documents `$ARGUMENTS` / `$1`-`$9` on custom prompts and documents no
// templating for skills, so "does Codex support $ARGUMENTS" has no single
// answer. Keying the table on target alone would encode a falsehood
// (ndr:8b6rtp's sibling finding).
//
// `hook` is a surface whose token vocabulary is lifecycle event names rather
// than body constructs. It is here for the same reason the other two are: the
// answer differs per target, cannot be observed locally, and so must carry a
// citation (ndr:g6xvyk). Before this row the fact lived in a hardcoded `Set` in
// the Codex adapter whose only citation was a code comment, and which could
// answer yes or no but never "not established" (L-009).
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
  | 'mcp-tool'
  | 'agent-reference';

export interface ConstructShape {
  family: ConstructFamily;
  // Normalized label the capability table is keyed on: `$ARGUMENTS`,
  // `${CLAUDE_*}`, `$UPPER`, `$N`, or the family name for non-variable shapes.
  token: string;
  // The literal source text, for the diagnostic message.
  literal: string;
  line: number;
}

export type SupportGate =
  | { kind: 'configuration'; option: string }
  | { kind: 'install-scope'; resolvedAt: readonly InstallScope[] };

export interface GatedSupport {
  state: 'gated';
  condition: SupportGate;
}

export type Support = 'supported' | 'translated' | 'unsupported' | 'unknown' | GatedSupport;

interface CapabilityRow {
  supported: readonly string[];
  // Constructs this target's translator carries into a native form, keyed to
  // what each one becomes. A translated construct is not a loss, so it never
  // requires a declaration (ndr:4nshwv) — but it is still reported, because
  // "not detected" and "handled" look identical in a compile report otherwise.
  // This map is the single home for that fact: nothing else may encode it as an
  // inline exemption.
  translated?: Readonly<Record<string, string>>;
  // Conditional support is data on the capability row, not a parallel
  // exception table. Each result carries the condition a diagnostic needs to
  // state or a context-aware caller needs to evaluate (ndr:k58f71).
  gated?: Readonly<Record<string, SupportGate>>;
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
  'agent-reference',
] as const;

// Codex is the only target with translators today. `disable-model-invocation`
// is a frontmatter key rather than a body shape, so it is keyed by its literal
// name. It lives on the `codex/skill` row only — see `CODEX_HOOK_ENV_TRANSLATIONS`
// below for why the plugin-root variables do not share this row (ndr:61cmc9).
const CODEX_SKILL_TRANSLATIONS: Readonly<Record<string, string>> = {
  'disable-model-invocation': 'agents/openai.yaml',
};

// `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` are documented only as
// back-compat aliases substituted into a plugin hook command's process
// environment (and an Agent Plugins MCP stdio `cwd` field) — never inside
// SKILL.md body text. They therefore live on the `codex/hook` row rather than
// `codex/skill`: putting them there would assert they are carried into a
// native form wherever a skill body mentions them, which no doc or binary
// evidence supports (ndr:61cmc9, https://developers.openai.com/codex/plugins/build,
// verified 2026-09-17). Keyed by literal spelling rather than the normalized
// `${CLAUDE_*}` token, because only these two are translated —
// `${CLAUDE_PROJECT_DIR}` and friends remain unsupported.
const CODEX_HOOK_ENV_TRANSLATIONS: Readonly<Record<string, string>> = {
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
    'claude/agent',
    {
      supported: ['agent-reference'],
      gated: {
        '${CLAUDE_*}': { kind: 'install-scope', resolvedAt: ['plugin'] },
      },
      unsupported: [],
      source:
        "https://code.claude.com/docs/en/subagents — the Markdown body is the subagent system prompt; no command-style interpolation contract is claimed here. Verified 2026-09-15. `${CLAUDE_*}` is gated on install scope: Claude Code 2.1.274's substitution function has seven plugin-scoped call sites, while the non-plugin agent loader leaves the body unchanged. Confirmed live on 2026-09-17 with a project-scope agent echoing `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` literally, then positively on 2026-09-19 with Claude Code 2.1.278 resolving `${CLAUDE_PLUGIN_ROOT}` for a plugin-scope Librarian agent. `agent-reference` is listed supported because Claude registers a package's agents by name and dispatches them from body prose; registration is a property of the package rather than the install scope.",
    },
  ],
  [
    'codex/skill',
    {
      supported: [],
      translated: CODEX_SKILL_TRANSLATIONS,
      unsupported: CLAUDE_TOKENS,
      source:
        'https://learn.chatgpt.com/docs/build-skills.md — documents no body templating, so `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` in SKILL.md body prose are inert text on this surface (see the `codex/hook` row for where those two are actually translated); agents/openai.yaml carries the invocation policy. On allow_implicit_invocation the published page says only that Codex "won\'t implicitly invoke the skill", which reads as auto-trigger gating; the codex 0.146.0 binary\'s embedded skill-creator doc is the complete statement — "the skill is not injected into the model context by default, but can still be invoked explicitly via $skill". Verified 2026-08-02: a policy-gated skill is absent from the model\'s catalog and still runs from the $-picker, so the translation is faithful. Body-templating scope re-verified 2026-09-17 against https://developers.openai.com/codex/plugins/build. `agent-reference` is unsupported on a separate basis: codex-cli 0.155.1 registers no agent role from a plugin package (docs/limitations.md L-010), so a body naming a packaged collaborator addresses nothing the runtime can resolve. The shortfall is unconditional rather than enabled by a typed gate condition, which is what places it inside the declared-loss gate (ndr:k58f71) rather than beside it.',
    },
  ],
  [
    // Without this row every construct in a Codex agent body resolved to
    // `unknown`, so a leaf render called `${CLAUDE_PLUGIN_ROOT}` merely
    // unclassified while a marketplace compile — which scans agent bodies on
    // the default `skill` surface — refused the identical construct in the
    // identical file. One artifact cannot have two verdicts; the evidence for
    // the skill surface covers this one, and the row makes that explicit
    // rather than leaving it to the surface a caller happens to pass.
    //
    // No `translated` map on purpose. `${CLAUDE_PLUGIN_ROOT}` is translated on
    // `codex/hook` alone, because the doc scopes it to hook command execution
    // (ndr:61cmc9); an agent role's instruction body is not that surface, and
    // claiming the translation here would assert an expansion nothing performs.
    'codex/agent',
    {
      supported: [],
      unsupported: CLAUDE_TOKENS,
      source:
        'codex-cli 0.155.1 agent-role TOML. Project discovery and explicit role selection were verified live on 2026-09-21: a role stored only in `.codex/agents` returned its unique `developer_instructions` marker when selected by agent type (docs/limitations.md L-011 and L-012). `developer_instructions` is a plain TOML string with no documented or observed substitution, interpolation, or invocation-time argument pass, so Claude constructs in an agent body remain literal text. `$ARGUMENTS`/`$N` are unsupported on a stronger basis here than on a skill: a role is selected at spawn rather than invoked with user arguments. `mcp-tool` is the weakest member: Codex addresses MCP tools by their own `mcp__*` names, so the loss is the server configuration rather than the naming convention. `agent-reference` remains unsupported on this shared surface because marketplace compilation also uses it and no plugin-registered role exists to address (L-010); a project leaf role being selectable does not make a packaged collaborator resolvable.',
    },
  ],
  [
    'codex/prompt',
    {
      supported: ['$ARGUMENTS', '$N'],
      unsupported: [
        '${CLAUDE_*}',
        'inline-shell',
        'fenced-shell',
        'file-reference',
        'mcp-tool',
        'agent-reference',
      ],
      source:
        'https://learn.chatgpt.com/docs/custom-prompts — supports $ARGUMENTS, $1-$9, named $UPPER; "No inline shell execution is supported."',
    },
  ],
  [
    'codex/hook',
    {
      supported: CODEX_HOOK_EVENTS,
      translated: CODEX_HOOK_ENV_TRANSLATIONS,
      // Confirmed absent rather than merely unlisted, which is why these are
      // here and not left to resolve as `unknown`. Claude has ~31 hook events
      // to Codex's 12; the rest stay off this list on purpose, because "we
      // established Codex lacks it" is a stronger claim than the evidence
      // supports for them. See docs/hook-event-parity.md for the full split.
      //
      // `supported` above lists 11, not Codex's 12: `Interrupt` is Codex-only,
      // and this list answers "what may a Claude event translate into". No
      // Claude event names that moment, so including it would make the list
      // answer a different question than `supportFor` asks of it.
      unsupported: ['Notification', 'WorktreeCreate', 'WorktreeRemove'],
      source:
        'codex-cli 0.154.0 binary, `HookEventsToml` field set. Event set re-verified 2026-09-17; first established 2026-08-09 against 0.147.0, unchanged except that 0.154.0 adds the Codex-only `Interrupt`. Probe: `strings -a "$(readlink -f "$(which codex)")" | grep -o \'trusted_hash[A-Za-z]\\{0,140\\}\' | sort -u`. The maximal hook-context blob reads PreToolUse PermissionRequest PostToolUse PreCompact PostCompact SessionStart SessionEnd UserPromptSubmit SubagentStart SubagentStop Stop Interrupt; shorter blobs are string-interning artifacts of the same set, and their union adds nothing. `Interrupt` carries its own dedicated error strings (`Interrupt hook returned non-JSON stdout`), so it is a real event rather than an adjacency artifact. `Notification` occurs 189 times in the binary overall and in zero hook blobs — the hook-adjacent hits are `HookStartedNotification` / `HookCompletedNotification`, Codex\'s internal IPC types announcing that a hook ran, not a configurable trigger — so its absence is a finding rather than an omission. `WorktreeCreate` / `WorktreeRemove` are likewise absent from every hook blob while running live as Claude hooks in ~/.claude/settings.json, which is what makes them established rather than merely unlisted. Supersedes the manual 0.146.0 check that left no artifact in the repo. `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}` translated entry added for ndr:61cmc9: https://developers.openai.com/codex/plugins/build states "Plugin hook commands receive the Codex-specific environment variables PLUGIN_ROOT and PLUGIN_DATA... along with CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA for backward compatibility," explicitly scoped to hook command execution (and separately, Agent Plugins MCP stdio `cwd`, per the codex-cli 0.154.0 binary\'s validation-error strings). Verified 2026-09-17. SECOND SOURCE, added 2026-09-17: https://learn.chatgpt.com/docs/hooks (canonical https://developers.openai.com/codex/hooks) is Codex\'s published hooks reference, and it corroborates the binary independently on both the event set and the exit-code contract — "Exit `0` with no output is treated as success and Codex continues" and "You can also use exit code `2` and write the blocking reason to `stderr`". It documents no meaning for exit 1 or any other non-zero code, and no general fail-open/fail-closed rule for a crashing or timed-out hook, so a guard script\'s posture is not specified by the runtime it targets. It further establishes two facts the binary alone could not settle: `matcher` is honored ("The `matcher` field is a regex string that filters when hooks fire") on PreToolUse, PostToolUse, PreCompact, PostCompact, SessionStart, SubagentStart, SubagentStop and PermissionRequest; and Codex deliberately speaks Claude\'s tool vocabulary in matchers — shell commands and unified exec both "Match as `Bash`", `apply_patch` matches `apply_patch`/`Edit`/`Write`, `spawn_agent` also matches `Agent`, and MCP tools match their own `mcp__*` names. This is why a Claude-authored `matcher: "Bash"` fires on Codex, confirmed live against codex-cli 0.154.0 on 2026-09-17. It is NOT total: a Claude tool name with no alias (notably `Task`, whose Codex counterpart is `Agent`) compiles cleanly and matches nothing, and hosted tools such as `WebSearch` "don\'t use the local function-tool hook path" at all. Reporting that gap needs a per-(target, surface) tool-name vocabulary the table does not yet carry, so it is recorded in docs/hook-event-parity.md rather than detected. The page also states hooks are experimental, disabled by default, unavailable on Windows, and that some tool paths can opt out: "Treat tool hooks as a useful guardrail, not a complete enforcement boundary."',
    },
  ],
  [
    'opencode/skill',
    {
      supported: [],
      unsupported: CLAUDE_TOKENS,
      source:
        "https://opencode.ai/docs/skills.md — no templating, no shell, no tool namespace. `agent-reference` is unsupported on this repository's own basis rather than a doc claim: agentforge projects no `agent` artifact to OpenCode (`src/targets/opencode.ts` declares `artifacts.skill` alone), so no collaborator a body names is ever installed alongside it.",
    },
  ],
  [
    'pi/skill',
    {
      supported: ['allowed-tools', 'disable-model-invocation'],
      unsupported: CLAUDE_TOKENS,
      source:
        'https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md — Pi implements Agent Skills, natively accepts allowed-tools and disable-model-invocation, and documents no Claude Code body templating. Verified 2026-09-14. `agent-reference` is unsupported because agentforge projects no `agent` artifact to Pi (`src/targets/pi.ts` declares `artifacts.skill` alone), so a collaborator named in a body is never installed with it.',
    },
  ],
  [
    'claude-chat/skill',
    {
      supported: [],
      unsupported: CLAUDE_TOKENS,
      source:
        'Uploaded chat skills run without Claude Code substitution or shell access. `agent-reference` is unsupported for the same reason the rest of this row is: an uploaded chat skill carries no companion agents, and agentforge projects no `agent` artifact to this target.',
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
  const condition = row.gated?.[token];
  if (condition !== undefined) return { state: 'gated', condition };
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

// A collaborator reference has no shape that distinguishes it from prose — an
// `@name` is a name, and every regex that tries to tell `@vault-reader` from
// `@everyone` guesses. So this one family is matched against data instead: the
// agents the same package declares. A name the package declares is a
// collaborator; anything else is text. That keeps the file-reference matcher's
// separator requirement untouched (it is a deliberate exclusion, not an
// oversight) and leaves the detector with no heuristic in it (ndr:c5haze).
//
// Deliberately package-local. A body naming a *sibling* package's agent is not
// detected — see the atom's Scope and Fibery Charting #23 for the deferred
// question of whether resolution should widen to the whole publication.
// The trailing guard rejects only a path separator. The name match is already
// greedy over word characters, so `/` is the single continuation that would
// make this the prefix of a file reference — and that family owns it.
// The leading guard admits a backtick, bracket or paren as well as
// whitespace: prose overwhelmingly spells a collaborator as `@name`, and
// requiring whitespace would miss the dominant spelling. Widening it costs
// nothing here precisely because the match is keyed on declared names — the
// file-reference family, which is keyed on shape, cannot afford the same.
const AGENT_REFERENCE = /(?<=^|[\s`([])@([A-Za-z0-9_-]+)(?!\/)/g;

export function findConstructShapes(
  content: string,
  declaredAgents: ReadonlySet<string> = new Set(),
): ConstructShape[] {
  const shapes: ConstructShape[] = [];
  if (declaredAgents.size > 0) {
    AGENT_REFERENCE.lastIndex = 0;
    for (const match of content.matchAll(AGENT_REFERENCE)) {
      if (!declaredAgents.has(match[1] ?? '')) continue;
      shapes.push({
        family: 'agent-reference',
        token: 'agent-reference',
        literal: match[0],
        line: lineOf(content, match.index ?? 0),
      });
    }
  }
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

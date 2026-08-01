import matter from 'gray-matter';
import {
  type ConstructFamily,
  type ConstructSurface,
  findConstructShapes,
  supportFor,
} from './capabilities.ts';
import type { ClaudeOnlyConstruct, LoadedArtifact } from './definitions.ts';
import type { TargetName } from './types.ts';

export interface DetectedConstruct {
  construct: ClaudeOnlyConstruct;
  artifactType: string;
  sourcePath: string;
  // 1-indexed line within the source file. Frontmatter constructs report the
  // file without a line — the key's position is not what identifies it.
  line?: number;
  detail: string;
}

export interface UnknownConstruct {
  family: ConstructFamily;
  token: string;
  literal: string;
  artifactType: string;
  sourcePath: string;
  line: number;
}

export interface DetectionResult {
  // Confirmed silent losses. Each must carry a declared loss (ndr:rm06pf).
  detected: DetectedConstruct[];
  // Construct-shaped but unclassified. Reported, never gated — gating a
  // construct we cannot confirm is lost would violate ndr:4nshwv.
  unknown: UnknownConstruct[];
}

// One pass replaces two. The old split — a fixed body-pattern list in render.ts
// and a frontmatter-only scan here — had disjoint coverage and disjoint
// severity, so a body feature that was a hard silent loss could not be declared
// at all.
const FAMILY_CONSTRUCTS: Readonly<Record<ConstructFamily, ClaudeOnlyConstruct>> = {
  'template-variable': 'body-template-variable',
  'positional-argument': 'body-template-variable',
  'inline-shell': 'body-shell-injection',
  'fenced-shell': 'body-shell-injection',
  'file-reference': 'body-file-reference',
  'mcp-tool': 'mcp-tool-reference',
};

export interface DetectionInput {
  artifacts: ReadonlyMap<string, readonly LoadedArtifact[]>;
  resources?: readonly LoadedArtifact[];
  // Files declared reference-or-diagnostic. Their constructs are documentation
  // *about* Claude rather than instructions to a model, so an identifier there
  // is the content, not a loss (ndr:grjvxz).
  exemptDocuments?: ReadonlySet<string>;
  target: TargetName;
  surface?: ConstructSurface;
}

export function detectClaudeOnlyConstructs(input: DetectionInput): DetectionResult {
  const {
    artifacts,
    resources = [],
    exemptDocuments = new Set(),
    target,
    surface = 'skill',
  } = input;
  const detected: DetectedConstruct[] = [];
  const unknown: UnknownConstruct[] = [];

  for (const [artifactType, loaded] of artifacts) {
    for (const artifact of loaded) {
      // An agent spells its allowlist `tools:`, a command spells the same thing
      // `allowed-tools:`. Codex enforces neither, so both are the same loss.
      if (artifactType === 'agent') {
        pushToolFilter(detected, artifact, artifactType, 'tools', 'agent-tools-filter');
      }
      if (artifactType === 'command') {
        pushToolFilter(detected, artifact, artifactType, 'allowed-tools', 'command-tools-filter');
      }
      if (!exemptDocuments.has(artifact.path)) {
        scanBody(artifact, artifactType, target, surface, detected, unknown);
      }
    }
  }

  for (const resource of resources) {
    if (exemptDocuments.has(resource.path)) continue;
    scanBody(resource, 'resource', target, surface, detected, unknown);
  }

  detected.sort(
    (left, right) =>
      compare(left.sourcePath, right.sourcePath) ||
      (left.line ?? 0) - (right.line ?? 0) ||
      compare(left.construct, right.construct),
  );
  unknown.sort(
    (left, right) => compare(left.sourcePath, right.sourcePath) || left.line - right.line,
  );
  return { detected, unknown };
}

function scanBody(
  file: LoadedArtifact,
  artifactType: string,
  target: TargetName,
  surface: ConstructSurface,
  detected: DetectedConstruct[],
  unknown: UnknownConstruct[],
): void {
  // Only prose reaches a model's context. A hook config or other structured
  // artifact carries its own translator — `${CLAUDE_PLUGIN_ROOT}` in hooks.json
  // is rewritten to `${PLUGIN_ROOT}`, a lossless translation that ndr:4nshwv
  // says must not require a declaration.
  if (artifactType !== 'resource' && !isProse(file.path)) return;

  // Artifact frontmatter is covered by the tool-filter checks above; scanning it
  // again would report the same `mcp__` name under two constructs.
  const { body, offset } = bodyOf(file, artifactType);
  const seen = new Set<string>();

  for (const shape of findConstructShapes(body)) {
    // Ordinary shell scripts use `$1` for their own arguments. Treating that as
    // a Claude positional would make every helper script a compile failure.
    if (shape.family === 'positional-argument' && isShellResource(file.path)) continue;

    const line = shape.line + offset;
    const support = supportFor(target, surface, shape.token);
    if (support === 'supported') continue;

    if (support === 'unknown') {
      unknown.push({
        family: shape.family,
        token: shape.token,
        literal: shape.literal,
        artifactType,
        sourcePath: file.path,
        line,
      });
      continue;
    }

    // One occurrence per construct per line. A line naming the same tool twice
    // is one thing to fix, not two.
    const key = `${FAMILY_CONSTRUCTS[shape.family]}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);

    detected.push({
      construct: FAMILY_CONSTRUCTS[shape.family],
      artifactType,
      sourcePath: file.path,
      line,
      detail:
        shape.family === 'mcp-tool'
          ? `references Claude MCP tool "${shape.literal}"`
          : `body uses ${shape.literal}`,
    });
  }
}

function bodyOf(file: LoadedArtifact, artifactType: string): { body: string; offset: number } {
  if (artifactType === 'resource') return { body: file.content, offset: 0 };
  try {
    const parsed = matter(file.content);
    // gray-matter strips the frontmatter block; recover the line offset so a
    // reported line still points at the right place in the real file.
    const consumed = file.content.length - parsed.content.length;
    return { body: parsed.content, offset: countNewlines(file.content.slice(0, consumed)) };
  } catch {
    return { body: file.content, offset: 0 };
  }
}

function pushToolFilter(
  detected: DetectedConstruct[],
  artifact: LoadedArtifact,
  artifactType: string,
  key: string,
  construct: ClaudeOnlyConstruct,
): void {
  const tools = frontmatterToolList(artifact.content, key);
  if (tools === undefined) return;
  detected.push({
    construct,
    artifactType,
    sourcePath: artifact.path,
    detail: `${artifactType} frontmatter declares ${key}: ${tools}`,
  });
}

function isProse(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function isShellResource(path: string): boolean {
  return path.includes('/scripts/') || /\.(sh|bash)$/i.test(path);
}

function countNewlines(value: string): number {
  let count = 0;
  for (const character of value) if (character === '\n') count += 1;
  return count;
}

function frontmatterToolList(content: string, key: string): string | undefined {
  let data: Record<string, unknown>;
  try {
    data = matter(content).data;
  } catch {
    // Malformed frontmatter fails open here and is reported later by the
    // artifact's own parser, which produces a far better message than this
    // detector could.
    return undefined;
  }
  const tools = data[key];
  if (tools === undefined || tools === null) return undefined;
  return Array.isArray(tools) ? tools.join(', ') : String(tools);
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

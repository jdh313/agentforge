import matter from 'gray-matter';
import type { ClaudeOnlyConstruct, LoadedArtifact } from './definitions.ts';

export interface DetectedConstruct {
  construct: ClaudeOnlyConstruct;
  artifactType: string;
  sourcePath: string;
  detail: string;
}

// Claude tool names are namespaced `mcp__<server>__<tool>`, and the server
// segment may contain hyphens (`mcp__obsidian-mcp__read_note`). Codex has no MCP
// tool namespace, so a body naming one instructs the model to call something
// that does not exist there.
const MCP_TOOL_REFERENCE = /\bmcp__[A-Za-z0-9_-]+/;

// These constructs are invisible to the body-pattern check in `render.ts`, which
// only scans skill bodies for literal Claude template syntax. An agent's
// `tools:` filter lives in frontmatter, and an `mcp__*` name is ordinary prose.
export function detectClaudeOnlyConstructs(
  artifacts: ReadonlyMap<string, readonly LoadedArtifact[]>,
): DetectedConstruct[] {
  const detected: DetectedConstruct[] = [];

  for (const [artifactType, loaded] of artifacts) {
    for (const artifact of loaded) {
      // An agent spells its allowlist `tools:`, a command spells the same thing
      // `allowed-tools:`. Codex enforces neither, so both are the same loss.
      if (artifactType === 'agent') {
        const tools = frontmatterToolList(artifact.content, 'tools');
        if (tools !== undefined) {
          detected.push({
            construct: 'agent-tools-filter',
            artifactType,
            sourcePath: artifact.path,
            detail: `agent frontmatter declares tools: ${tools}`,
          });
        }
      }

      if (artifactType === 'command') {
        const tools = frontmatterToolList(artifact.content, 'allowed-tools');
        if (tools !== undefined) {
          detected.push({
            construct: 'command-tools-filter',
            artifactType,
            sourcePath: artifact.path,
            detail: `command frontmatter declares allowed-tools: ${tools}`,
          });
        }
      }

      const mcpReference = MCP_TOOL_REFERENCE.exec(artifact.content);
      if (mcpReference) {
        detected.push({
          construct: 'mcp-tool-reference',
          artifactType,
          sourcePath: artifact.path,
          detail: `references Claude MCP tool "${mcpReference[0]}"`,
        });
      }
    }
  }

  return detected.toSorted(
    (left, right) =>
      compareStrings(left.sourcePath, right.sourcePath) ||
      compareStrings(left.construct, right.construct),
  );
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

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

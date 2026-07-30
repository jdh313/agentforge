import matter from 'gray-matter';
import type { ClaudeOnlyConstruct, LoadedArtifact } from './definitions.ts';

export interface DetectedConstruct {
  construct: ClaudeOnlyConstruct;
  artifactType: string;
  sourcePath: string;
  detail: string;
}

// Claude tool names are namespaced `mcp__<server>__<tool>`. Codex has no MCP
// tool namespace, so a body naming one instructs the model to call something
// that does not exist there.
const MCP_TOOL_REFERENCE = /\bmcp__[A-Za-z0-9_]+/;

// These constructs are invisible to the body-pattern check in `render.ts`, which
// only scans skill bodies for literal Claude template syntax. An agent's
// `tools:` filter lives in frontmatter, and an `mcp__*` name is ordinary prose.
export function detectClaudeOnlyConstructs(
  artifacts: ReadonlyMap<string, readonly LoadedArtifact[]>,
): DetectedConstruct[] {
  const detected: DetectedConstruct[] = [];

  for (const [artifactType, loaded] of artifacts) {
    for (const artifact of loaded) {
      if (artifactType === 'agent') {
        const tools = agentToolsFilter(artifact.content);
        if (tools !== undefined) {
          detected.push({
            construct: 'agent-tools-filter',
            artifactType,
            sourcePath: artifact.path,
            detail: `agent frontmatter declares tools: ${tools}`,
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

function agentToolsFilter(content: string): string | undefined {
  let data: Record<string, unknown>;
  try {
    data = matter(content).data;
  } catch {
    return undefined;
  }
  const tools = data.tools;
  if (tools === undefined || tools === null) return undefined;
  return Array.isArray(tools) ? tools.join(', ') : String(tools);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

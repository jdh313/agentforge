import type { z } from 'zod';
import type { CanonicalAgentBehavior } from './agent-command.ts';
import type {
  PublicationCompilation,
  TargetCompilationResult,
  TargetCompilerAdapter,
} from './compiler.ts';
import type { ArtifactType, ConstructSurface, InstallScope, TargetName, Warning } from './types.ts';

export interface InstallLocationContext {
  homeDirectory: string;
  projectRoot: string;
  pluginRoot?: string;
}

export type InstallLocation = (context: InstallLocationContext) => string;

export interface NativeAgentDocumentResult {
  content: string;
  warnings: Warning[];
}

// Whether an agent leaf projects as Markdown-plus-frontmatter or as a target's
// own registration document is a fact about the target itself, true before any
// specific artifact is projected — the case ndr:nes397 admits onto an adapter
// member. The shape stays one function interface regardless of which target
// implements it, so the member's type is not a union enumerating targets.
export interface NativeAgentDocumentContext {
  /** The canonical source file's path, for error messages that name it. */
  sourcePath: string;
}

export interface NativeAgentDocument {
  /** File extension, including the leading dot, e.g. `.toml`. */
  extension: string;
  serialize(
    behavior: CanonicalAgentBehavior,
    context: NativeAgentDocumentContext,
  ): NativeAgentDocumentResult;
}

export interface ArtifactConfig {
  installLocations: Partial<Record<InstallScope, InstallLocation>>;
  surface: ConstructSurface;
  resourceSubdirs: ReadonlySet<string>;
  // When present, standalone rendering still carries these resources, but an
  // install includes them only at the named scopes. File-layout agents use
  // this to stay one-file at user/project scope while plugin scope publishes
  // the package-root resources their bodies address.
  resourceInstallScopes?: ReadonlySet<InstallScope>;
  outputFrontmatterSchema: z.ZodType;
  bundle?: 'dir' | 'zip';
  // Present only for a target/artifact pair that registers as a native
  // document instead of the default one-file Markdown projection (ndr:2t36rb).
  nativeDocument?: NativeAgentDocument;
}

export interface MarketplaceCapability {
  compilePublication(input: PublicationCompilation): TargetCompilationResult;
}

/**
 * Every fact AgentForge knows about one consuming harness.
 *
 * Artifact projection and marketplace compilation used to have separate
 * adapter families. Keeping them on one target object makes the registry the
 * only target enumeration while allowing targets without a marketplace format.
 */
export interface TargetAdapter {
  name: TargetName;
  label: string;
  artifacts: Partial<Record<ArtifactType, ArtifactConfig>>;
  marketplace?: MarketplaceCapability;
}

interface AgentSkillsTargetOptions {
  name: TargetName;
  label: string;
  installLocations: Partial<Record<InstallScope, InstallLocation>>;
  outputFrontmatterSchema: z.ZodType;
  bundle?: 'dir' | 'zip';
}

/** Build the ordinary Agent Skills shape shared by targets that do not diverge. */
export function agentSkillsTarget(options: AgentSkillsTargetOptions): TargetAdapter {
  return {
    name: options.name,
    label: options.label,
    artifacts: {
      skill: {
        installLocations: options.installLocations,
        surface: 'skill',
        resourceSubdirs: new Set(['scripts', 'references', 'assets']),
        outputFrontmatterSchema: options.outputFrontmatterSchema,
        ...(options.bundle === undefined ? {} : { bundle: options.bundle }),
      },
    },
  };
}

/**
 * Compatibility view for callers of the pre-0.5 marketplace-adapter API.
 * The behavior remains owned by the unified target adapter.
 */
export function asCompilerAdapter(adapter: TargetAdapter): TargetCompilerAdapter {
  const capability = adapter.marketplace;
  if (!capability) {
    throw new Error(`target ${adapter.name} does not support marketplace compilation`);
  }
  return {
    target: adapter.name,
    compilePublication: (input) => capability.compilePublication(input),
  };
}

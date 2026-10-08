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
  // Codex documents CODEX_HOME as the root containing config, agents, and
  // other runtime state. It defaults to ~/.codex when unset. Keep this
  // target-owned override distinct from homeDirectory so every other target
  // retains its own documented home-relative locations.
  codexHomeDirectory?: string;
  // Pi documents PI_CODING_AGENT_DIR as the root of its per-user state, and
  // @gotgenes/pi-subagents reads user agents from `<that root>/agents`. It
  // defaults to ~/.pi/agent when unset. Target-owned, like codexHomeDirectory;
  // the Pi skill location deliberately does not consult it.
  piAgentDirectory?: string;
  projectRoot: string;
  pluginRoot?: string;
}

export type InstallLocation = (context: InstallLocationContext) => string;

export interface NativeAgentDocumentResult {
  content: string;
  warnings: Warning[];
}

// Whether an agent leaf is serialized by the shared Markdown projection or by a
// target-owned serializer (own extension and key set: Codex TOML, Pi Markdown
// for pi-subagents) is a fact about the target itself, true before any
// specific artifact is projected — the case ndr:nes397 admits onto an adapter
// member. The shape stays one function interface regardless of which target
// implements it, so the member's type is not a union enumerating targets.
export interface NativeAgentDocumentContext {
  /** The canonical source file's path, for error messages that name it. */
  sourcePath: string;
  /**
   * The raw `targets.<name>` override for this target, body removed. A native
   * document reads a key from here when the shared value is another
   * harness's vocabulary and only an explicit override names this target
   * (Codex `model`, Pi `model` and `tools`).
   */
  overrides: Readonly<Record<string, unknown>>;
  /**
   * The canonical frontmatter before `targets.<name>` is merged over it. An
   * override written with no value (YAML `null`) replaces the shared key in
   * the merged view, so a target gating on a shared restriction reads it here.
   */
  sharedFrontmatter: Readonly<Record<string, unknown>>;
}

/**
 * A target declined to project a source rather than emit a document that
 * widens what the source allows. Distinct from a thrown schema error so a
 * batch run (`render --all-targets`) can report it like an unsupported
 * (target, artifact) pair and continue.
 */
export class ProjectionRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectionRefusedError';
  }
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
  // Why a scope this artifact omits from `installLocations` is omitted, in the
  // target's own words. Absence means the target gives no reason, not that the
  // scope is supported. Shared code relays the text and never writes it, so the
  // knowledge stays with the target (ndr:nes397: a question about the target
  // itself, true before any output exists).
  unsupportedInstallScopeReasons?: Partial<Record<InstallScope, string>>;
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
  // document instead of the default shared one-file Markdown projection, through a target-owned serializer (Codex TOML, Pi Markdown for pi-subagents) (ndr:2t36rb).
  nativeDocument?: NativeAgentDocument;
  // A translation-only key (retained by no target) is normally stripped
  // silently where it is not translated, because the key belongs to a sibling
  // harness. A target that sets this reports each of them as a key it does not
  // accept instead (ndr:az33k6: Pi reports the four Codex-only agent keys).
  reportsTranslationOnlyKeys?: boolean;
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

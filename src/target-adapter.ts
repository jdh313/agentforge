import type { z } from 'zod';
import type {
  PublicationCompilation,
  TargetCompilationResult,
  TargetCompilerAdapter,
} from './compiler.ts';
import type { ArtifactType, ConstructSurface, InstallScope, TargetName } from './types.ts';

export interface InstallLocationContext {
  homeDirectory: string;
  projectRoot: string;
  pluginRoot?: string;
}

export type InstallLocation = (context: InstallLocationContext) => string;

export interface ArtifactConfig {
  installLocations: Partial<Record<InstallScope, InstallLocation>>;
  surface: ConstructSurface;
  resourceSubdirs: ReadonlySet<string>;
  outputFrontmatterSchema: z.ZodType;
  bundle?: 'dir' | 'zip';
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

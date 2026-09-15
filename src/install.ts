import { lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { CompilationDiagnostic, CompilationPlan, DesiredOutput } from './compiler.ts';
import { resolveOutputDestinations } from './compiler.ts';
import { buildArtifactOutputs, loadArtifactProjection } from './render.ts';
import { ARTIFACT_DEFS } from './schema.ts';
import { getArtifactConfig } from './targets/index.ts';
import type { ArtifactType, InstallScope, TargetName } from './types.ts';

export interface BuildInstallPlanOptions {
  sourceDir: string;
  target: TargetName;
  artifact: ArtifactType;
  scope: InstallScope;
  projectRoot: string;
  pluginRoot?: string;
  homeDirectory?: string;
}

export interface InstallPlan {
  destinationRoot: string;
  plan: CompilationPlan;
}

/** Build the single-artifact synthetic publication used by install and check-install. */
export function buildInstallPlan(options: BuildInstallPlanOptions): InstallPlan {
  const sourceDir = resolve(options.sourceDir);
  const artifactDef = ARTIFACT_DEFS[options.artifact];
  if (artifactDef.layout !== 'directory') {
    throw new Error(
      `install supports directory artifacts only; ${options.artifact} uses file layout`,
    );
  }

  const config = getArtifactConfig(options.target, options.artifact);
  if (!config) {
    throw new Error(`target ${options.target} does not support artifact ${options.artifact}`);
  }
  const location = config.installLocations[options.scope];
  if (!location) {
    throw new Error(
      `target ${options.target} does not support ${options.scope}-scope installation for artifact ${options.artifact}`,
    );
  }

  const projection = loadArtifactProjection({
    sourceDir,
    target: options.target,
    artifact: options.artifact,
  });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projection.artifactName)) {
    throw new Error(
      `artifact name ${JSON.stringify(projection.artifactName)} is not a portable skill directory name`,
    );
  }
  const destinationRoot = join(
    location({
      homeDirectory: resolve(options.homeDirectory ?? homedir()),
      projectRoot: resolve(options.projectRoot),
      ...(options.pluginRoot === undefined ? {} : { pluginRoot: resolve(options.pluginRoot) }),
    }),
    projection.artifactName,
  );
  const provenance = {
    marketplacePath: join(sourceDir, artifactDef.canonicalFilename),
    publicationId: 'install',
  };
  const outputs: DesiredOutput[] = buildArtifactOutputs(projection, options.artifact).map(
    (output) =>
      output.kind === 'generated'
        ? { ...output, target: options.target, provenance }
        : {
            ...output,
            target: options.target,
            provenance,
            sourceRoot: sourceDir,
            executable: (lstatSync(output.sourcePath).mode & 0o111) !== 0,
          },
  );
  const diagnostics: CompilationDiagnostic[] = projection.warnings.map((warning) => ({
    code: warning.kind,
    severity: 'warning',
    message: `Skill ${JSON.stringify(projection.artifactName)}: ${warning.detail}.`,
    target: options.target,
    provenance,
  }));
  const resolvedOutputs = resolveOutputDestinations(outputs, diagnostics).toSorted((left, right) =>
    compareStrings(left.destination, right.destination),
  );
  diagnostics.sort(
    (left, right) =>
      compareStrings(left.code, right.code) || compareStrings(left.message, right.message),
  );

  return {
    destinationRoot,
    plan: {
      marketplaceId: 'install',
      outputs: resolvedOutputs,
      diagnostics,
      rootOutputs: [],
      redactions: [],
    },
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

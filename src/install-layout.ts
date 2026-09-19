import { resolve } from 'node:path';
import { isContainedPath, portableRelative } from './paths.ts';
import type { InstallScope } from './types.ts';

export interface FileInstallLayout {
  destinationRoot: string;
  artifactPrefix?: string;
  resourcePrefix?: string;
}

/**
 * Resolve the one root a planned-file installation may safely publish under.
 *
 * A plugin-scoped file artifact has two native anchors: the artifact location
 * (`<plugin>/agents`) and the package resources addressed from
 * `${CLAUDE_PLUGIN_ROOT}` (`<plugin>/references`, etc.). The package root is
 * therefore the smallest common ownership boundary. Planned-file ownership
 * still limits writes to the exact outputs in the plan (ndr:hjnabw).
 */
export function resolveFileInstallLayout(
  locationRoot: string,
  scope: InstallScope,
  pluginRoot?: string,
): FileInstallLayout {
  if (scope !== 'plugin') return { destinationRoot: locationRoot };
  if (pluginRoot === undefined) {
    throw new Error('plugin-scoped file installation requires a plugin root');
  }

  const root = resolve(pluginRoot);
  const location = resolve(locationRoot);
  if (location === root) return { destinationRoot: root };
  if (!isContainedPath(root, location)) {
    throw new Error(`plugin artifact location must be inside the plugin root: ${location}`);
  }

  return {
    destinationRoot: root,
    artifactPrefix: portableRelative(root, location),
    resourcePrefix: '',
  };
}

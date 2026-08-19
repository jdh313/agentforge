import { relative, resolve, sep } from 'node:path';
import type { DesiredOutput, RootAnchoredOutput } from './compiler.ts';
import type { PublicationDefinition } from './definitions.ts';
import type { TargetName } from './types.ts';

export class RootManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RootManifestError';
  }
}

/**
 * The root copy of a publication's marketplace registry.
 *
 * Identical to the nested copy except for plugin sources, which are rewritten
 * from package-directory-relative (`./plugins/ndr`, correct against the nested
 * root) to marketplace-root-relative (`./marketplaces/claude/plugins/ndr`),
 * because an installer reading `<clone-root>/.claude-plugin/marketplace.json`
 * resolves them against the clone root.
 */
export function buildRootManifestOutput(
  publication: PublicationDefinition,
  registry: DesiredOutput,
  marketplaceRoot: string,
  outputRoot: string,
): RootAnchoredOutput {
  if (registry.kind !== 'generated') {
    throw new RootManifestError(
      `publication ${JSON.stringify(publication.id)} declares root-manifest, but its registry output at ${JSON.stringify(publication.destination)} is not a generated document`,
    );
  }

  const prefix = rootRelativePrefix(publication, marketplaceRoot, outputRoot);
  let document: unknown;
  try {
    document = JSON.parse(registry.content);
  } catch {
    throw new RootManifestError(
      `publication ${JSON.stringify(publication.id)} declares root-manifest, but its registry document is not valid JSON`,
    );
  }

  return {
    ...registry,
    anchor: 'marketplace-root',
    destination: publication.destination,
    content: `${JSON.stringify(rewritePluginSources(publication, registry.target, document, prefix), null, 2)}\n`,
  };
}

/**
 * `./<out relative to the marketplace root>/<publication id>`.
 *
 * `--out` must be inside the marketplace root: a rewritten source starting with
 * `../` escapes the clone root, which installers reject outright.
 */
function rootRelativePrefix(
  publication: PublicationDefinition,
  marketplaceRoot: string,
  outputRoot: string,
): string {
  const fromRoot = relative(resolve(marketplaceRoot), resolve(outputRoot));
  if (fromRoot.length === 0 || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw new RootManifestError(
      `publication ${JSON.stringify(publication.id)} declares root-manifest, which requires --out to be inside the marketplace directory ${marketplaceRoot}; got ${resolve(outputRoot)}`,
    );
  }
  return `./${fromRoot.split(sep).join('/')}/${publication.id}`;
}

function rewritePluginSources(
  publication: PublicationDefinition,
  target: TargetName,
  document: unknown,
  prefix: string,
): unknown {
  if (typeof document !== 'object' || document === null || !('plugins' in document)) {
    return document;
  }
  const { plugins } = document as { plugins: unknown };
  if (!Array.isArray(plugins)) return document;

  return {
    ...document,
    plugins: plugins.map((plugin) => rewritePlugin(publication, target, plugin, prefix)),
  };
}

function rewritePlugin(
  publication: PublicationDefinition,
  target: TargetName,
  plugin: unknown,
  prefix: string,
): unknown {
  if (typeof plugin !== 'object' || plugin === null || !('source' in plugin)) return plugin;
  const { source } = plugin as { source: unknown };

  if (typeof source === 'string') {
    return { ...plugin, source: rewriteSource(publication, source, prefix) };
  }
  if (typeof source !== 'object' || source === null) return plugin;

  // Codex nests the package directory under `source.path`; Claude's object form
  // nests it under `source.source`.
  const key = target === 'codex' && 'path' in source ? 'path' : 'source';
  const nested = (source as Record<string, unknown>)[key];
  if (typeof nested !== 'string') return plugin;
  return {
    ...plugin,
    source: { ...source, [key]: rewriteSource(publication, nested, prefix) },
  };
}

function rewriteSource(publication: PublicationDefinition, source: string, prefix: string): string {
  if (!source.startsWith('./')) {
    throw new RootManifestError(
      `publication ${JSON.stringify(publication.id)} declares root-manifest, but plugin source ${JSON.stringify(source)} is not a ./-relative package path`,
    );
  }
  return `${prefix}/${source.slice(2)}`;
}

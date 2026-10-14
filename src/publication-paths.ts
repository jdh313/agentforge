import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { destinationCollisionKey } from './compiler.ts';
import { isContainedPath } from './paths.ts';

/** Existing ancestors matter too when an output directory does not exist yet. */
export function physicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    const parent = dirname(path);
    if (parent === path) throw cause;
    return resolve(physicalPath(parent), basename(path));
  }
}

export function pathsOverlap(a: string, b: string): boolean {
  return a === b || isContainedPath(a, b) || isContainedPath(b, a);
}

/** Use the compiler's portable case/Unicode collision convention for roots too. */
export function publicationPathsOverlap(a: string, b: string): boolean {
  return pathsOverlap(destinationCollisionKey(a), destinationCollisionKey(b));
}

export function portablePathReason(path: string): string | undefined {
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'must be relative';
  if (/[\\*?[\]{}!+]/.test(path)) return 'must be an exact portable path, not a glob';
  if ([...path].some((c) => c.charCodeAt(0) <= 31 || c.charCodeAt(0) === 127))
    return 'must not contain control characters';
  if (path.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part)))
    return 'must be normalized, without traversal or trailing dots/spaces';
  return undefined;
}

/** Config-relative paths may not traverse links below the config's real root. */
export function repositoryPath(root: string, proposed: string): string {
  const reason = portablePathReason(proposed);
  if (reason) throw new Error(`unsafe repository path ${JSON.stringify(proposed)}: ${reason}`);
  const path = resolve(root, proposed);
  if (!isContainedPath(root, path)) throw new Error(`path escapes repository root: ${proposed}`);
  assertRealPath(root, path);
  return path;
}

export function assertRealPath(root: string, path: string): void {
  if (!isContainedPath(root, path)) throw new Error(`path escapes repository root: ${path}`);
  let current = path;
  while (current !== root) {
    const entry = lstatSync(current, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink())
      throw new Error(`refusing symbolic link repository path: ${current}`);
    if (current !== path && entry && !entry.isDirectory())
      throw new Error(`repository path parent must be a directory: ${current}`);
    current = dirname(current);
  }
}

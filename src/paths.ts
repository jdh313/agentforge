import { isAbsolute, relative, sep } from 'node:path';

/**
 * A `/`-separated relative path, whatever the host separator.
 *
 * Every relative path the compiler *emits* — a plugin source, a payload
 * destination, a report row — is read by something that only understands
 * `/`, so the platform separator never survives into a document.
 */
export function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}

/**
 * Whether `path` names something strictly inside `root`.
 *
 * Strictly: `root` itself is not contained by `root`, because every caller is
 * asking about a file or directory *under* a root it owns. The `isAbsolute`
 * arm catches the Windows case where the two live on different drives and
 * `relative` returns an absolute path rather than a `..` walk.
 *
 * Both arguments must already be resolved; this is a string test, not a
 * filesystem one.
 */
export function isContainedPath(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot.length > 0 &&
    fromRoot !== '..' &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

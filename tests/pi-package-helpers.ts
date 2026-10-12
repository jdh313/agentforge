import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PackageDefinition } from '../src/definitions.ts';

export const PI_PACKAGE_FIXTURES = join(import.meta.dir, 'fixtures', 'pi-package');
export const PACKAGE_CLI = join(import.meta.dir, '..', 'src', 'cli.ts');

export function copyPackage(root: string, name = 'extension-only'): string {
  const destination = join(root, 'source');
  cpSync(join(PI_PACKAGE_FIXTURES, name), destination, { recursive: true });
  return join(destination, 'PACKAGE.yaml');
}

export function editPackage(path: string, edit: (definition: PackageDefinition) => void): void {
  const definition = Bun.YAML.parse(readFileSync(path, 'utf8')) as PackageDefinition;
  edit(definition);
  writeFileSync(path, `${JSON.stringify(definition, null, 2)}\n`);
}

export function put(root: string, path: string, content: string | Uint8Array): void {
  const destination = join(root, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

export function tree(root: string): Record<string, { bytes: string; mode: number }> {
  const result: Record<string, { bytes: string; mode: number }> = {};
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else
        result[relative(root, path)] = {
          bytes: readFileSync(path).toString('base64'),
          mode: statSync(path).mode & 0o777,
        };
    }
  }
  visit(root);
  return result;
}

export function runPackageCli(
  operation: string,
  source: string,
  output: string,
  options: { target?: string; env?: Record<string, string>; extra?: string[] } = {},
) {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      PACKAGE_CLI,
      'package',
      operation,
      source,
      '--target',
      options.target ?? 'pi',
      '--out',
      output,
      ...(options.extra ?? []),
    ],
    env: { ...process.env, ...options.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

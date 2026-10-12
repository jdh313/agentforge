import { dirname } from 'node:path';
import { z } from 'zod';
import {
  CompilationError,
  type CompilationPackage,
  destinationCollisionKey,
  type PackageManifestHandle,
  type ProposedOutput,
  type TargetCompilationResult,
} from '../compiler.ts';
import { buildArtifactOutputs, projectArtifact } from '../render.ts';

// Pi 1.1.0 docs/packages.md: these are mapped from the host, never physical copies.
export const PI_HOST_PACKAGES = new Set([
  '@earendil-works/pi-ai',
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-tui',
  'typebox',
]);

function resourcePath(value: string): boolean {
  const path = value.startsWith('./') ? value.slice(2) : value;
  return (
    path.length > 0 &&
    !/[\\*?[\]{}!+]/.test(path) &&
    ![...path].some(
      (character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127,
    ) &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    path
      .split('/')
      .every((part) => part.length > 0 && part !== '.' && part !== '..' && !/[. ]$/.test(part))
  );
}
const ResourcePath = z
  .string()
  .refine(
    resourcePath,
    'must be an exact portable package-relative resource path (no globs or traversal)',
  );
const DependencyMap = z.record(z.string().min(1), z.string().min(1));
export const PiPackageManifest = z
  .looseObject({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    dependencies: DependencyMap.optional(),
    devDependencies: DependencyMap.optional(),
    optionalDependencies: DependencyMap.optional(),
    peerDependencies: DependencyMap.optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    pi: z.looseObject({
      extensions: z.array(ResourcePath),
      skills: z.array(ResourcePath),
      prompts: z.array(ResourcePath).max(0, 'prompt activation is unsupported'),
      themes: z.array(ResourcePath).max(0, 'theme activation is unsupported'),
    }),
  })
  .superRefine((manifest, context) => {
    for (const field of ['dependencies', 'optionalDependencies'] as const) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (PI_HOST_PACKAGES.has(name))
          context.addIssue({
            code: 'custom',
            path: [field, name],
            message:
              'host-provided Pi package must be a peerDependency with range "*", not a bundled dependency',
          });
      }
    }
    for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (PI_HOST_PACKAGES.has(name) && range !== '*')
        context.addIssue({
          code: 'custom',
          path: ['peerDependencies', name],
          message: 'host-provided Pi peerDependencies must use range "*"',
        });
    }
  });

export const PiPackageDocument: PackageManifestHandle = {
  role: 'package-manifest',
  grammar: 'json',
  label: 'Pi package manifest',
  schema: PiPackageManifest,
  identity(document) {
    const manifest = PiPackageManifest.parse(document);
    return { name: manifest.name, version: manifest.version };
  },
  validateResources(document, files) {
    const parsed = PiPackageManifest.safeParse(document);
    if (!parsed.success)
      return parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    const issues: { path: string; message: string }[] = [];
    const manifest = parsed.data;
    if (manifest.pi.extensions.length + manifest.pi.skills.length === 0)
      issues.push({ path: 'pi', message: 'package declares no loadable resources' });
    for (const entry of manifest.pi.extensions) {
      const path = entry.replace(/^\.\//, '');
      if (files.has(path) && /\.(ts|js)$/.test(path)) continue;
      if (!files.has(path) && (files.has(`${path}/index.ts`) || files.has(`${path}/index.js`)))
        continue;
      issues.push({
        path,
        message:
          'extension must resolve to an existing .ts/.js file or directory with index.ts/index.js',
      });
    }
    for (const entry of manifest.pi.skills) {
      const path = entry.replace(/^\.\//, '');
      if (!files.has(`${path}/SKILL.md`))
        issues.push({ path, message: 'skill root must contain SKILL.md' });
    }
    return issues;
  },
};

/** Package planning only: all file/mode facts are supplied by the loader. */
export function compilePiPackage(input: CompilationPackage): TargetCompilationResult {
  for (const type of input.artifacts.keys()) {
    if (type !== 'skill')
      throw new CompilationError(
        `Pi packages do not support artifact "${type}" (leaf agent support does not register package agents)`,
      );
  }
  const outputs: ProposedOutput[] = [];
  const diagnostics: NonNullable<TargetCompilationResult['diagnostics']>[number][] = [];
  const skills: string[] = [];
  for (const artifact of [...(input.artifacts.get('skill') ?? [])].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    const projection = projectArtifact({
      artifact: 'skill',
      target: 'pi',
      sourcePath: artifact.path,
      source: artifact.content,
      resourcePaths: input.files,
      authoringKeys: input.authoringKeys,
    });
    const root = `skills/${projection.artifactName}`;
    skills.push(`./${root}`);
    outputs.push(
      ...buildArtifactOutputs(projection, 'skill', root).map((output) => ({
        ...output,
        packageId: input.id,
        ...(output.kind === 'copy'
          ? {
              sourceRoot: dirname(input.path),
              executable: ((input.fileModes?.get(output.sourcePath) ?? 0) & 0o111) !== 0,
            }
          : {}),
      })),
    );
    diagnostics.push(
      ...projection.warnings.map((warning) => ({
        code: warning.kind,
        severity: 'warning' as const,
        packageId: input.id,
        message: `Skill "${projection.artifactName}": ${warning.detail}.`,
        locations: warning.locations ?? [{ path: artifact.path }],
      })),
    );
  }
  for (const payload of input.payloads) {
    const key = destinationCollisionKey(payload.destination);
    for (const host of PI_HOST_PACKAGES) {
      if (`/${key}/`.includes(`/node_modules/${host.toLowerCase()}/`)) {
        throw new CompilationError(
          `host-provided Pi package ${host} must not be vendored in output node_modules`,
        );
      }
    }
    if (key === 'package.json' || key.startsWith('package.json/'))
      throw new CompilationError(
        'package.json is reserved for the generated Pi manifest; supplied replacements are unsupported',
      );
    outputs.push({
      kind: 'copy',
      producer: 'supplied',
      packageId: input.id,
      ...payload,
      sourceRoot: dirname(input.path),
    });
  }
  const native = input.native;
  for (const key of ['name', 'version'] as const) {
    if (native[key] !== undefined && native[key] !== input.metadata[key])
      throw new CompilationError(
        `native ${key} conflicts with resolved canonical package identity`,
      );
  }
  const nativePi = native.pi;
  if (
    nativePi !== undefined &&
    (typeof nativePi !== 'object' || nativePi === null || Array.isArray(nativePi))
  )
    throw new CompilationError('native.pi must be an object');
  const pi = (nativePi ?? {}) as Record<string, unknown>;
  if (pi.skills !== undefined && (!Array.isArray(pi.skills) || pi.skills.length > 0))
    throw new CompilationError(
      'native.pi.skills must be [] or omitted; declare canonical skills through artifacts',
    );
  const manifest = PiPackageManifest.parse({
    ...input.metadata,
    ...native,
    name: input.metadata.name,
    version: input.metadata.version,
    pi: {
      ...pi,
      extensions: pi.extensions === undefined ? [] : pi.extensions,
      skills,
      prompts: pi.prompts === undefined ? [] : pi.prompts,
      themes: pi.themes === undefined ? [] : pi.themes,
    },
  });
  outputs.push({
    kind: 'generated',
    producer: 'generated',
    packageId: input.id,
    destination: 'package.json',
    content: `${JSON.stringify(manifest, null, 2)}\n`,
    nativeDocument: PiPackageDocument,
  });
  return { outputs, diagnostics };
}

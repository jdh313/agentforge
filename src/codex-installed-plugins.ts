import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  buildCodexAgentBundleInstallPlan,
  buildCodexAgentBundleUpdatePlan,
  CODEX_AGENT_BUNDLE_DIRECTORY,
  CODEX_AGENT_BUNDLE_INDEX,
  type CodexScopeAnchors,
  checkCodexAgentBundleInstallPlan,
  describeCodexScopeAnchors,
  materializeCodexAgentBundleInstallPlan,
  materializeCodexAgentBundleLifecyclePlan,
  previewCodexAgentBundleLifecyclePlan,
  resolveScopeAnchors,
  validateCodexAgentBundleInstallPlan,
} from './codex-agent-bundle.ts';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// Only the identity is read here; the per-bundle library validates the rest.
const BundleIdentity = z.looseObject({
  package: z.looseObject({ id: z.string().min(1), version: z.string().min(1).optional() }),
});

export interface CodexPluginBundle {
  key: string;
  packageId: string;
  packageVersion: string;
  bundleRoot: string;
}

/** What discovery made of one enabled plugin. Only `bundle` proceeds to a sync. */
export type CodexPluginDiscovery =
  | { kind: 'bundle'; bundle: CodexPluginBundle; notes: readonly string[] }
  | { kind: 'no-bundle'; key: string }
  | { kind: 'skipped'; key: string; reason: string }
  | { kind: 'refused'; key: string; reason: string };

export interface CodexPluginEnumeration {
  /** Per-user Codex home the plugin configuration and cache were read from. */
  codexHome: string;
  configPath: string;
  /** Followed `config.toml` anchor of the user home, when it is a symbolic link. */
  anchors: CodexScopeAnchors;
  discoveries: readonly CodexPluginDiscovery[];
  disabled: number;
}

export function userCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CODEX_HOME ?? join(homedir(), '.codex'));
}

/**
 * Enabled plugins in `$CODEX_HOME/config.toml`, each resolved to its cache
 * directory and, when it ships one, its Codex agent bundle. Reads only: the
 * plugin configuration is Codex's own and is never written here.
 */
export function enumerateInstalledCodexPlugins(codexHome: string): CodexPluginEnumeration {
  const anchors = resolveScopeAnchors(codexHome);
  const configPath = anchors.config?.target ?? join(codexHome, 'config.toml');
  let parsed: { plugins?: unknown } = {};
  if (existsSync(configPath)) {
    try {
      parsed = Bun.TOML.parse(readFileSync(configPath, 'utf8')) as { plugins?: unknown };
    } catch {
      throw new Error(`Codex configuration is not valid TOML: ${configPath}`);
    }
  }
  const table = parsed.plugins;
  const entries =
    table !== null && typeof table === 'object' && !Array.isArray(table)
      ? Object.entries(table as Record<string, unknown>)
      : [];
  const discoveries: CodexPluginDiscovery[] = [];
  let disabled = 0;
  for (const [key, value] of entries) {
    const enabled = (value as { enabled?: unknown } | null)?.enabled === true;
    if (!enabled) {
      disabled += 1;
      continue;
    }
    discoveries.push(discoverPlugin(codexHome, key));
  }
  return { codexHome, configPath, anchors, discoveries, disabled };
}

const isPathSegment = (value: string): boolean =>
  value.length > 0 && value !== '.' && value !== '..' && !/[\\/]/.test(value);

function discoverPlugin(codexHome: string, key: string): CodexPluginDiscovery {
  const at = key.lastIndexOf('@');
  const name = key.slice(0, at);
  const marketplace = key.slice(at + 1);
  if (at <= 0 || !isPathSegment(name) || !isPathSegment(marketplace)) {
    return { kind: 'refused', key, reason: 'plugin key is not <name>@<marketplace>' };
  }
  const pluginCache = join(codexHome, 'plugins/cache', marketplace, name);
  const versions = existsSync(pluginCache)
    ? readdirSync(pluginCache).filter((entry) => statSync(join(pluginCache, entry)).isDirectory())
    : [];
  if (versions.length === 0) {
    return { kind: 'skipped', key, reason: `no cached plugin content at ${pluginCache}` };
  }
  const notes: string[] = [];
  let chosen = versions[0] as string;
  if (versions.length > 1) {
    const semver = versions.filter((version) => SEMVER.test(version));
    if (semver.length === 0) {
      return {
        kind: 'refused',
        key,
        reason: `refusing to choose among version directories without a semver name: ${versions.sort().join(', ')}`,
      };
    }
    semver.sort((a, b) => Bun.semver.order(a, b));
    chosen = semver[semver.length - 1] as string;
    notes.push(
      `${key}: ${versions.length} version directories (${versions.sort().join(', ')}); using ${chosen}`,
    );
  }
  const bundleRoot = join(pluginCache, chosen, CODEX_AGENT_BUNDLE_DIRECTORY);
  const indexPath = join(bundleRoot, CODEX_AGENT_BUNDLE_INDEX);
  if (!existsSync(indexPath)) return { kind: 'no-bundle', key };
  let identity: z.infer<typeof BundleIdentity>;
  try {
    identity = BundleIdentity.parse(JSON.parse(readFileSync(indexPath, 'utf8')));
  } catch {
    return { kind: 'refused', key, reason: `bundle index is unreadable: ${indexPath}` };
  }
  return {
    kind: 'bundle',
    bundle: {
      key,
      packageId: identity.package.id,
      packageVersion: identity.package.version ?? 'unversioned',
      bundleRoot,
    },
    notes,
  };
}

export type CodexSyncAction = 'install' | 'update' | 'current';
export type CodexSyncOutcome =
  | { kind: 'done'; action: CodexSyncAction; anchors: CodexScopeAnchors }
  | { kind: 'refused'; reason: string; anchors?: CodexScopeAnchors };

export interface CodexSyncScope {
  scope: 'user' | 'project';
  projectRoot: string;
  codexHomeDirectory?: string;
}

const DONE_VERB: Record<CodexSyncAction, string> = {
  install: 'installed',
  update: 'updated',
  current: 'current',
};

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Bring one bundle's installation in line with the bundle, through the same
 * check, install, and lifecycle-update functions the single-bundle commands use.
 * A dry run stops after the plan is known to be ready.
 */
export function syncCodexAgentBundle(
  bundle: CodexPluginBundle,
  scope: CodexSyncScope,
  dryRun: boolean,
): CodexSyncOutcome {
  let anchors: CodexScopeAnchors | undefined;
  try {
    const install = buildCodexAgentBundleInstallPlan({ bundleRoot: bundle.bundleRoot, ...scope });
    anchors = install.anchors;
    const result = checkCodexAgentBundleInstallPlan(install);
    if (result.status === 'current') return { kind: 'done', action: 'current', anchors };
    const detail = oneLine(result.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
    if (result.status === 'edited' || result.status === 'unsupported') {
      return { kind: 'refused', reason: `${result.status}: ${detail}`, anchors };
    }
    if (!existsSync(join(install.destinationRoot, install.receiptPath))) {
      // No receipt: a wholly empty install is the only state install accepts.
      if (result.status !== 'missing') {
        return { kind: 'refused', reason: `${result.status}: ${detail}`, anchors };
      }
      validateCodexAgentBundleInstallPlan(install);
      if (!dryRun) materializeCodexAgentBundleInstallPlan(install);
      return { kind: 'done', action: 'install', anchors };
    }
    const update = buildCodexAgentBundleUpdatePlan({ bundleRoot: bundle.bundleRoot, ...scope });
    anchors = update.anchors;
    const preview = previewCodexAgentBundleLifecyclePlan(update);
    if (preview.status !== 'ready') {
      const issues = preview.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
      return { kind: 'refused', reason: oneLine(`${preview.status}: ${issues}`), anchors };
    }
    if (preview.actions.length === 0) {
      return {
        kind: 'refused',
        reason: `${result.status}: ${detail}; update has nothing to change`,
        anchors,
      };
    }
    if (!dryRun) materializeCodexAgentBundleLifecyclePlan(update);
    return { kind: 'done', action: 'update', anchors };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: 'refused', reason: oneLine(reason), ...(anchors ? { anchors } : {}) };
  }
}

export interface CodexSyncLine {
  text: string;
  ok: boolean;
}

export interface CodexSyncReport {
  lines: readonly CodexSyncLine[];
  anchorLines: readonly string[];
  summary: string;
  ok: boolean;
}

/**
 * Enumerate, then sync every enabled plugin's bundle. Plugins are processed in
 * config order and each plan is built just before it is applied, so a plugin
 * never plans against state an earlier plugin is about to change.
 */
export function syncInstalledCodexAgents(options: {
  enumeration: CodexPluginEnumeration;
  scope: CodexSyncScope;
  dryRun: boolean;
}): CodexSyncReport {
  const { enumeration, scope, dryRun } = options;
  const lines: CodexSyncLine[] = [];
  const anchorLines = new Set<string>();
  for (const line of describeCodexScopeAnchors(enumeration.anchors)) {
    anchorLines.add(`plugins ${line}`);
  }
  const counts = { install: 0, update: 0, current: 0, refused: 0, skipped: 0 };

  // Two plugins shipping one package id share one receipt, so neither may write.
  const owners = new Map<string, string[]>();
  for (const found of enumeration.discoveries) {
    if (found.kind !== 'bundle') continue;
    owners.set(found.bundle.packageId, [
      ...(owners.get(found.bundle.packageId) ?? []),
      found.bundle.key,
    ]);
  }

  for (const found of enumeration.discoveries) {
    if (found.kind === 'no-bundle') {
      counts.skipped += 1;
      continue;
    }
    if (found.kind === 'skipped') {
      counts.skipped += 1;
      lines.push({ text: `${found.key}: skip: ${found.reason}`, ok: true });
      continue;
    }
    if (found.kind === 'refused') {
      counts.refused += 1;
      lines.push({ text: `${found.key}: refuse: ${found.reason}`, ok: false });
      continue;
    }
    for (const note of found.notes) lines.push({ text: note, ok: true });
    const { bundle } = found;
    const prefix = `${bundle.key} ${bundle.packageId} ${bundle.packageVersion}`;
    const sharing = owners.get(bundle.packageId) ?? [];
    if (sharing.length > 1) {
      counts.refused += 1;
      lines.push({
        text: `${prefix}: refuse: package id ${bundle.packageId} is shipped by ${sharing.join(' and ')}, which would share one ownership receipt`,
        ok: false,
      });
      continue;
    }
    const outcome = syncCodexAgentBundle(bundle, scope, dryRun);
    for (const line of outcome.anchors ? describeCodexScopeAnchors(outcome.anchors) : []) {
      anchorLines.add(line);
    }
    if (outcome.kind === 'refused') {
      counts.refused += 1;
      lines.push({ text: `${prefix}: refuse: ${outcome.reason}`, ok: false });
      continue;
    }
    counts[outcome.action] += 1;
    const verb = dryRun ? outcome.action : DONE_VERB[outcome.action];
    lines.push({ text: `${prefix}: ${verb}`, ok: true });
  }

  const planned = dryRun ? 'dry-run: ' : '';
  const summary = `summary: ${planned}${counts.install} ${dryRun ? 'to install' : 'installed'}, ${counts.update} ${dryRun ? 'to update' : 'updated'}, ${counts.current} current, ${counts.refused} refused, ${counts.skipped} skipped (no bundle or no cache), ${enumeration.disabled} disabled`;
  return {
    lines,
    anchorLines: [...anchorLines],
    summary,
    ok: counts.refused === 0,
  };
}

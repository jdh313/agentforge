import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { codexMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition } from '../src/definitions.ts';
import { buildReport, renderReport } from '../src/report.ts';

// Coverage for Fibery #32: a diagnostic carries a machine-readable source
// location, not just a sentence a consumer would have to parse.
//
// `src/compatibility.ts` has always produced occurrences carrying `path:line`.
// The loss happened one layer up: `src/targets/package-payload.ts` rendered
// that pair into the `message` string and dropped it, so by the time a
// `CompilationDiagnostic` existed the location survived only as English. A
// `--report out.json` consumer got prose; the markdown report filed those
// diagnostics under `(no source file)` even though the compiler knew the file.
//
// Two invariants are asserted together because either alone is satisfiable
// without the fix being useful:
//   - the location reaches `plan.diagnostics` as data, absolute (ndr:c5snzf
//     keeps in-memory paths absolute for in-process consumers), and
//   - the report relativizes it against the marketplace root, so two
//     contributors' committed reports diff cleanly.

const FIXTURES = join(import.meta.dir, 'fixtures', 'definitions');

// Declares one loss whose construct occurs in two skills — the case that forces
// `locations` to be plural rather than a single field.
const OCCURRENCES_ROOT = join(FIXTURES, 'declared-loss-occurrences');
const OCCURRENCES_FIXTURE = join(OCCURRENCES_ROOT, 'MARKETPLACE.yaml');

// Carries a construct the capability table does not classify, which is the
// `unclassified-construct` path.
const UNLISTED_ROOT = join(FIXTURES, 'construct-scope-unlisted');
const UNLISTED_FIXTURE = join(UNLISTED_ROOT, 'MARKETPLACE.yaml');

// Carries a frontmatter construct the target translates — a location with a
// file but no line, because a frontmatter key's position is not what
// identifies it.
const TRANSLATED_ROOT = join(FIXTURES, 'translated-construct');
const TRANSLATED_FIXTURE = join(TRANSLATED_ROOT, 'MARKETPLACE.yaml');

async function compile(fixture: string) {
  const loaded = await loadMarketplaceDefinition(fixture);
  return compileMarketplace(loaded, [codexMarketplaceAdapter]);
}

describe('diagnostic source locations', () => {
  test('a declared loss carries one location per occurrence, absolute, with a 1-indexed line', async () => {
    const plan = await compile(OCCURRENCES_FIXTURE);

    const loss = plan.diagnostics.find(({ code }) => code === 'declared-loss');
    expect(loss).toBeDefined();
    expect(loss?.locations).toHaveLength(2);

    for (const location of loss?.locations ?? []) {
      // Absolute in memory: an in-process consumer opens the file.
      expect(location.path.startsWith(OCCURRENCES_ROOT)).toBe(true);
      expect(location.line).toBeGreaterThan(0);
    }

    // The same fact the message spells in prose, now available without parsing
    // it — the pairing is the point, so both halves are checked.
    for (const location of loss?.locations ?? []) {
      const relative = location.path.slice(`${OCCURRENCES_ROOT}/`.length);
      expect(loss?.message).toContain(`:${location.line}`);
      expect(relative).toContain('skills/');
    }
  });

  test('an unclassified construct carries the line the detector already found', async () => {
    const plan = await compile(UNLISTED_FIXTURE);

    const unclassified = plan.diagnostics.find(({ code }) => code === 'unclassified-construct');
    expect(unclassified).toBeDefined();
    expect(unclassified?.locations).toHaveLength(1);

    const [location] = unclassified?.locations ?? [];
    expect(location?.path.startsWith(UNLISTED_ROOT)).toBe(true);
    expect(location?.line).toBeGreaterThan(0);
  });

  test('a frontmatter construct carries its file with no line, rather than a fabricated one', async () => {
    const plan = await compile(TRANSLATED_FIXTURE);

    const translated = plan.diagnostics.find(
      ({ code, message }) =>
        code === 'translated-construct' && message.includes('disable-model-invocation'),
    );
    expect(translated).toBeDefined();
    expect(translated?.locations).toHaveLength(1);

    const [location] = translated?.locations ?? [];
    expect(location?.path.endsWith('skills/draft/SKILL.md')).toBe(true);
    // A key has no line that identifies it, so none is invented.
    expect(location?.line).toBeUndefined();
  });

  test('the JSON report relativizes locations against the marketplace root', async () => {
    const plan = await compile(OCCURRENCES_FIXTURE);
    const report = buildReport(plan);

    const diagnostics = Object.values(report.targets)
      .flatMap((target) => Object.values(target.packages))
      .flatMap((group) => group.diagnostics);
    const loss = diagnostics.find(({ code }) => code === 'declared-loss');

    expect(loss?.locations).toHaveLength(2);
    for (const location of loss?.locations ?? []) {
      expect(location.path).not.toContain(OCCURRENCES_ROOT);
      expect(location.path.startsWith('packages/')).toBe(true);
      expect(location.line).toBeGreaterThan(0);
    }
  });

  test('the markdown report files a location-only diagnostic under its source file and prints path:line', async () => {
    const plan = await compile(OCCURRENCES_FIXTURE);
    const markdown = renderReport(plan, 'md');

    const loss = plan.diagnostics.find(({ code }) => code === 'declared-loss');
    const [first] = loss?.locations ?? [];
    const relative = (first?.path ?? '').slice(`${OCCURRENCES_ROOT}/`.length);

    // Grouped under the real file rather than the `(no source file)` bucket it
    // fell into when the path lived only in the message.
    expect(markdown).toContain(`#### \`${relative}\``);
    expect(markdown).toContain(`\`${relative}:${first?.line}\``);
    // Every diagnostic in this fixture has an established location, so nothing
    // should land in the fallback bucket at all.
    expect(markdown).not.toContain('(no source file)');
  });
});

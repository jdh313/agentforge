import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { claudeMarketplaceAdapter } from 'agentforge/marketplace-adapters';
import { projectArtifact } from 'agentforge/render';
import matter from 'gray-matter';
import { compileMarketplace } from '../src/compiler.ts';
import { loadMarketplaceDefinition, parsePackageDefinition } from '../src/definitions.ts';
import { TARGET_NAMES } from '../src/types.ts';

// Three categories of frontmatter key, not two. A *known* Claude key
// (`disallowed-tools`) is retained on Claude and reported as stripped
// elsewhere. An *unrecognized* key is retained on Claude provisionally and
// reported as dropped elsewhere. An *authoring-layer* key belongs to the source
// repo and is addressed to no runtime at all — `upstream:` carries adaptation
// provenance that a repo-local workflow reads and rewrites in canonical source,
// so a copy of it in published output is inert.
//
// Stripping it was always the right outcome. The defect was that nobody decided
// it: the same silence that destroyed `disallowed-tools`, where the outcome
// genuinely was wrong. So the declaration exists to make the strip deliberate,
// and a deliberate strip is reported nowhere (ndr:4nshwv).

const SOURCE = `---
name: adapted
description: Fixture skill carrying adaptation provenance.
upstream:
  repo: example/skills
  reviewed_sha: 0123456789ab
---

A plain body.
`;

const FIXTURE = join(
  import.meta.dir,
  'fixtures',
  'definitions',
  'authoring-keys',
  'MARKETPLACE.yaml',
);

const project = (target: (typeof TARGET_NAMES)[number], authoringKeys?: ReadonlySet<string>) =>
  projectArtifact({
    artifact: 'skill',
    target,
    sourcePath: '/packages/adapted/skills/adapted/SKILL.md',
    source: SOURCE,
    ...(authoringKeys === undefined ? {} : { authoringKeys }),
  });

describe('authoring-layer frontmatter keys', () => {
  test.each([...TARGET_NAMES])('a declared key is stripped for %s with no warning', (target) => {
    const projection = project(target, new Set(['upstream']));

    expect(matter(projection.content).data).not.toHaveProperty('upstream');
    // Asserted as an absence of the diagnostic, not just of the key: a declared
    // strip that still warned would be the noise this declaration exists to
    // prevent, and would read as a loss the author already ruled out.
    expect(projection.warnings).toEqual([]);
  });

  test.each([
    ...TARGET_NAMES,
  ])('the same key with no declaration keeps unrecognized-key behavior on %s', (target) => {
    const projection = project(target);
    const retained = target === 'claude';

    expect(matter(projection.content).data.upstream === undefined).toBe(!retained);
    expect(projection.warnings).toEqual([
      {
        kind: 'unrecognized-frontmatter-key',
        target,
        detail: retained
          ? 'upstream not in the canonical schema; passed through to claude unvalidated'
          : `upstream not in the canonical schema; dropped for ${target}`,
      },
    ]);
  });

  test('a declaration does not disturb the rest of the frontmatter', () => {
    const projection = project('claude', new Set(['upstream']));

    expect(matter(projection.content).data).toEqual({
      name: 'adapted',
      description: 'Fixture skill carrying adaptation provenance.',
    });
  });

  test('PACKAGE.yaml accepts authoring-keys and rejects duplicates', () => {
    const definition = (extra: string) => `schema: agentforge.package/v1
id: adapted
defaults:
  name: adapted
  version: 1.0.0
artifacts:
  - type: skill
    pattern: skills/*/SKILL.md
${extra}targets:
  claude: {}
`;

    expect(parsePackageDefinition(definition('authoring-keys:\n  - upstream\n'))).toMatchObject({
      'authoring-keys': ['upstream'],
    });
    expect(() =>
      parsePackageDefinition(definition('authoring-keys:\n  - upstream\n  - upstream\n')),
    ).toThrow(/duplicate authoring key "upstream"/);
  });

  test('the declaration reaches compiled output through PACKAGE.yaml', async () => {
    const loaded = await loadMarketplaceDefinition(FIXTURE);
    const plan = compileMarketplace(loaded, [claudeMarketplaceAdapter]);

    const skillFor = (packageId: string) => {
      const output = plan.outputs.find(
        (candidate) =>
          candidate.kind === 'generated' &&
          candidate.destination === `packages/${packageId}/skills/adapted/SKILL.md`,
      );
      if (!output || output.kind !== 'generated') {
        throw new Error(`no generated SKILL.md for package "${packageId}"`);
      }
      return matter(output.content).data;
    };

    expect(skillFor('declared')).not.toHaveProperty('upstream');
    expect(skillFor('undeclared')).toHaveProperty('upstream');

    const mentions = (packageId: string) =>
      plan.diagnostics.filter(
        (diagnostic) =>
          diagnostic.provenance.packageId === packageId && diagnostic.message.includes('upstream'),
      );

    expect(mentions('declared')).toEqual([]);
    expect(mentions('undeclared')).toHaveLength(1);
  });
});

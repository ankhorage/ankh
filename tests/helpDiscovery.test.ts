import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { afterEach, describe, expect, it } from 'bun:test';

import { discoverHelpPackages } from '../src/features/help/discoverHelpPackages.js';

const temporaryDirectories: string[] = [];

const apmMetadata = {
  capabilities: ['apm.status', 'apm.plan'],
  category: 'apm',
  provider: './dist/cli/provider.js',
} as const satisfies AnkhPackageMetadata;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('discoverHelpPackages', () => {
  it('discovers the installed Ankhorage command scope without consulting cwd', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ankh-help-discovery-'));
    temporaryDirectories.push(root);
    const apmRoot = path.join(root, 'node_modules', '@ankhorage', 'apm');
    await mkdir(apmRoot, { recursive: true });
    await writeFile(
      path.join(apmRoot, 'package.json'),
      `${JSON.stringify(
        {
          ankh: apmMetadata,
          name: '@ankhorage/apm',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const result = await discoverHelpPackages(root);

    expect(result.diagnostics).toEqual([]);
    expect(result.packages).toEqual([
      {
        metadata: apmMetadata,
        packageJsonPath: path.join(apmRoot, 'package.json'),
        packageName: '@ankhorage/apm',
        packageRoot: apmRoot,
        source: 'installed-dependency',
      },
    ]);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'no-current-package-root'),
    ).toBe(false);
  });
});

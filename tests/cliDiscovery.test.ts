import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { afterEach, expect, it } from 'bun:test';

import { discoverCliPackages } from '../src/cli/discoverCliPackages.js';

const temporaryDirectories: string[] = [];

const installedInfraMetadata = {
  capabilities: ['infra.up'],
  category: 'infra-installed',
  provider: './dist/cli/index.js',
} as const satisfies AnkhPackageMetadata;

const workspaceInfraMetadata = {
  capabilities: ['infra.up', 'infra.status'],
  category: 'infra',
  provider: './dist/cli/index.js',
} as const satisfies AnkhPackageMetadata;

const apmMetadata = {
  capabilities: ['apm.status'],
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

it('discovers installation providers and lets the current workspace override the same package', async () => {
  const installationRoot = await createFixtureRoot('ankh-installation-');
  const workspaceRoot = await createFixtureRoot('ankh-workspace-');
  const ankhPackageRoot = path.join(
    installationRoot,
    'node_modules',
    '@ankhorage',
    'ankh',
  );

  await writePackageJson(ankhPackageRoot, { name: '@ankhorage/ankh' });
  await writePackageJson(
    path.join(installationRoot, 'node_modules', '@ankhorage', 'infra'),
    {
      name: '@ankhorage/infra',
      ankh: installedInfraMetadata,
    },
  );
  await writePackageJson(path.join(installationRoot, 'node_modules', '@ankhorage', 'apm'), {
    name: '@ankhorage/apm',
    ankh: apmMetadata,
  });

  await writePackageJson(workspaceRoot, {
    name: 'workspace',
    workspaces: ['packages/*'],
  });
  await writePackageJson(path.join(workspaceRoot, 'packages', 'infra'), {
    name: '@ankhorage/infra',
    ankh: workspaceInfraMetadata,
  });

  const result = await discoverCliPackages({ cwd: workspaceRoot }, ankhPackageRoot);

  expect(result.packages.map((discoveredPackage) => discoveredPackage.packageName)).toEqual([
    '@ankhorage/infra',
    '@ankhorage/apm',
  ]);
  expect(result.packages[0]?.metadata).toEqual(workspaceInfraMetadata);
  expect(result.packages[0]?.source).toBe('workspace');
  expect(result.packages[1]?.metadata).toEqual(apmMetadata);
  expect(result.packages[1]?.source).toBe('installed-dependency');
});

it('discovers installation providers even when cwd has no package root', async () => {
  const installationRoot = await createFixtureRoot('ankh-installation-');
  const unrelatedRoot = await createFixtureRoot('ankh-no-package-');
  const ankhPackageRoot = path.join(
    installationRoot,
    'node_modules',
    '@ankhorage',
    'ankh',
  );

  await writePackageJson(ankhPackageRoot, { name: '@ankhorage/ankh' });
  await writePackageJson(path.join(installationRoot, 'node_modules', '@ankhorage', 'apm'), {
    name: '@ankhorage/apm',
    ankh: apmMetadata,
  });

  const result = await discoverCliPackages({ cwd: unrelatedRoot }, ankhPackageRoot);

  expect(result.packages.map((discoveredPackage) => discoveredPackage.packageName)).toEqual([
    '@ankhorage/apm',
  ]);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    'no-current-package-root',
  );
});

async function createFixtureRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

async function writePackageJson(
  directory: string,
  packageJson: Record<string, unknown>,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
}

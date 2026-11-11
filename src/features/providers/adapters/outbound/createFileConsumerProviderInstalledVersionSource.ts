import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { findWorkspaceRoots } from '../../../../workspace.js';
import type { ConsumerProviderInstalledVersionSource } from '../../application/ports/outbound/consumerProviderInstalledVersionSource.js';

/*** Create the filesystem adapter that verifies an installed provider against Bun's consumer lockfile. */
export function createFileConsumerProviderInstalledVersionSource(): ConsumerProviderInstalledVersionSource {
  return {
    async resolveAsync({ cwd, packageName }) {
      const { currentPackageRoot } = await findWorkspaceRoots(cwd);
      if (currentPackageRoot === null)
        throw new Error(`Could not locate consumer package for ${packageName}.`);
      const packageJsonPath = path.join(
        currentPackageRoot,
        'node_modules',
        ...packageName.split('/'),
        'package.json',
      );
      const lockfilePath = path.join(currentPackageRoot, 'bun.lock');
      const [installed, lockfile] = await Promise.all([
        readJsonObjectAsync(packageJsonPath, `installed ${packageName}`),
        readJsonObjectAsync(lockfilePath, 'consumer Bun lockfile'),
      ]);
      const installedVersion = installed.version;
      if (typeof installedVersion !== 'string' || installedVersion.trim() === '') {
        throw new Error(`Installed ${packageName} has no concrete version.`);
      }
      const lockEntry = isRecord(lockfile.packages)
        ? Object.entries(lockfile.packages).find(([name]) => name === packageName)?.[1]
        : undefined;
      const lockIdentifier = readLockIdentifier(lockEntry);
      if (typeof lockIdentifier !== 'string' || !lockIdentifier.endsWith(`@${installedVersion}`)) {
        throw new Error(
          `Consumer Bun lockfile does not confirm installed ${packageName}@${installedVersion}.`,
        );
      }
      return installedVersion;
    },
  };
}

/*** Read one JSON object and surface an owner-specific failure rather than treating ambiguity as a version. */
async function readJsonObjectAsync(
  filePath: string,
  label: string,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Could not read ${label} at ${filePath}.`, { cause: error });
  }
  if (!isRecord(value)) throw new Error(`${label} at ${filePath} must be a JSON object.`);
  return value;
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Read the resolved package identifier from Bun's serialized package tuple. */
function readLockIdentifier(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const identifier: unknown = value.at(0);
  return typeof identifier === 'string' ? identifier : null;
}

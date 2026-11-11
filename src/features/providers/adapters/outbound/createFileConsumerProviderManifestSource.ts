import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { findWorkspaceRoots } from '../../../../workspace.js';
import type { ConsumerProviderManifestSource } from '../../application/ports/outbound/consumerProviderManifestSource.js';

/*** Create the filesystem adapter that reads the invoking consumer package manifest. */
export function createFileConsumerProviderManifestSource(): ConsumerProviderManifestSource {
  return {
    async readAsync(cwd) {
      const { currentPackageRoot } = await findWorkspaceRoots(cwd);
      if (currentPackageRoot === null) return null;
      const packageJsonPath = path.join(currentPackageRoot, 'package.json');
      let value: unknown;
      try {
        value = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
      } catch (error) {
        throw new Error(`Could not read consumer package manifest at ${packageJsonPath}.`, {
          cause: error,
        });
      }
      if (!isRecord(value)) {
        throw new Error(`Consumer package manifest at ${packageJsonPath} must be a JSON object.`);
      }
      return value;
    },
    async readInstalledVersionAsync(cwd, packageName) {
      if (!isValidNpmPackageName(packageName)) {
        throw new Error(`Invalid provider package name: ${packageName}.`);
      }
      const { currentPackageRoot, workspaceRoot } = await findWorkspaceRoots(cwd);
      for (const root of [currentPackageRoot, workspaceRoot]) {
        if (root === null) continue;
        const packageJsonPath = path.join(root, 'node_modules', ...packageName.split('/'), 'package.json');
        try {
          const value = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
          if (!isRecord(value) || value.name !== packageName || typeof value.version !== 'string') {
            throw new Error(`Installed provider metadata is invalid at ${packageJsonPath}.`);
          }
          return value.version;
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
          throw error;
        }
      }
      return null;
    },
  };
}

/*** Validate package-name segments before using them in a filesystem path. */
function isValidNpmPackageName(packageName: string): boolean {
  const segments = packageName.split('/');
  if (segments.length !== 1 && segments.length !== 2) return false;
  return segments.every((segment, index) => {
    const candidate = index === 0 && segments.length === 2 && segment.startsWith('@')
      ? segment.slice(1)
      : segment;
    return /^[a-z0-9][a-z0-9._-]*$/u.test(candidate);
  });
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

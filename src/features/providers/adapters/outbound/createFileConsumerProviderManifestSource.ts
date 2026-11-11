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
  };
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

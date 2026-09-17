import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryDiagnostic,
  AnkhMetadataDiscoveryResult,
} from '../../discovery.js';
import { readAnkhPackageMetadata } from '../../packageMetadata.js';
import { findInstalledAnkhoragePackageJsonFiles } from '../../workspace.js';

/***
 * Discover Ankh command provider packages installed alongside the running `@ankhorage/ankh`
 * package without consulting the caller's current working directory.
 */
export async function discoverHelpPackages(
  packageRoot: string = ANKH_PACKAGE_ROOT,
): Promise<AnkhMetadataDiscoveryResult> {
  const packageJsonPaths = await findInstalledAnkhoragePackageJsonFiles(
    getInstallationRoot(packageRoot),
  );
  const diagnostics: AnkhMetadataDiscoveryDiagnostic[] = [];
  const packages: AnkhDiscoveredPackage[] = [];
  const seenPackageNames = new Set<string>();

  for (const packageJsonPath of packageJsonPaths) {
    const metadataResult = await readAnkhPackageMetadata({
      packageJsonPath,
      source: 'installed-dependency',
    });
    diagnostics.push(...metadataResult.diagnostics);

    if (
      metadataResult.packageName === null ||
      metadataResult.metadata === null ||
      seenPackageNames.has(metadataResult.packageName)
    ) {
      continue;
    }

    seenPackageNames.add(metadataResult.packageName);
    packages.push({
      metadata: metadataResult.metadata,
      packageJsonPath,
      packageName: metadataResult.packageName,
      packageRoot: metadataResult.packageRoot,
      source: 'installed-dependency',
    });
  }

  return {
    diagnostics,
    packages,
  };
}

const ANKH_PACKAGE_ROOT = path.dirname(
  fileURLToPath(new URL('../../../package.json', import.meta.url)),
);

/***
 * Resolve the installation root that owns the `node_modules/@ankhorage` scope containing Ankh.
 */
function getInstallationRoot(packageRoot: string): string {
  const scopeRoot = path.dirname(packageRoot);
  const nodeModulesRoot = path.dirname(scopeRoot);

  return path.basename(scopeRoot) === '@ankhorage' && path.basename(nodeModulesRoot) === 'node_modules'
    ? path.dirname(nodeModulesRoot)
    : packageRoot;
}

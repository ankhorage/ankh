import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AnkhMetadataDiscoveryResult,
  DiscoverAnkhPackagesOptions,
} from '../discovery.js';
import { discoverAnkhPackages } from '../discovery.js';

const ANKH_PACKAGE_ROOT = path.dirname(
  fileURLToPath(new URL('../../package.json', import.meta.url)),
);

/***
 * Discover every provider package visible to one Ankh CLI invocation.
 *
 * Project/workspace packages are discovered first and therefore override installation-level
 * packages with the same package name. Keep this shared CLI runtime in `@ankhorage/ankh` for now;
 * TODO: extract it into a dedicated CLI package once the provider-facing API is stable.
 */
export async function discoverCliPackages(
  options: DiscoverAnkhPackagesOptions,
  packageRoot: string = ANKH_PACKAGE_ROOT,
): Promise<AnkhMetadataDiscoveryResult> {
  return discoverAnkhPackages({
    ...options,
    additionalPackageRoots: [
      ...(options.additionalPackageRoots ?? []),
      resolveInstallationRoot(packageRoot),
    ],
  });
}

/***
 * Resolve the installation root owning the `node_modules/@ankhorage` scope that contains Ankh.
 */
function resolveInstallationRoot(packageRoot: string): string {
  const scopeRoot = path.dirname(packageRoot);
  const nodeModulesRoot = path.dirname(scopeRoot);
  const isInstalledPackage =
    path.basename(scopeRoot) === '@ankhorage' && path.basename(nodeModulesRoot) === 'node_modules';

  return isInstalledPackage ? path.dirname(nodeModulesRoot) : packageRoot;
}

import { homedir } from 'node:os';
import path from 'node:path';

import type { AnkhProviderRuntime } from '../../../types/providers.js';
import { createBunProviderPackageStore } from '../adapters/outbound/createBunProviderPackageStore.js';
import { createFileProviderCatalogStore } from '../adapters/outbound/createFileProviderCatalogStore.js';
import { createGitHubProviderCatalogSource } from '../adapters/outbound/createGitHubProviderCatalogSource.js';
import { resolveProviderCatalogAsync } from '../application/use-cases/resolveProviderCatalogAsync.js';

/*** Compose the production provider runtime around GitHub discovery and the private Ankh cache. */
export function createProviderRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AnkhProviderRuntime {
  const configuredCacheRoot = env.ANKH_CACHE_DIR?.trim();
  const cacheRoot =
    configuredCacheRoot === undefined || configuredCacheRoot === ''
      ? path.join(homedir(), '.ankh')
      : path.resolve(configuredCacheRoot);
  const source = createGitHubProviderCatalogSource();
  const store = createFileProviderCatalogStore(path.join(cacheRoot, 'provider-catalog.json'));
  const packages = createBunProviderPackageStore({ cacheRoot: path.join(cacheRoot, 'providers') });

  return {
    resolveCatalogAsync() {
      return resolveProviderCatalogAsync({ source, store });
    },
    resolvePackageAsync(entry) {
      return packages.resolveAsync(entry);
    },
  };
}

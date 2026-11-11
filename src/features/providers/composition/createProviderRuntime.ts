import { homedir } from 'node:os';
import path from 'node:path';

import type { AnkhProviderRuntime } from '../../../types/providers.js';
import { createBunProviderPackageStore } from '../adapters/outbound/createBunProviderPackageStore.js';
import { createFileConsumerProviderInstalledVersionSource } from '../adapters/outbound/createFileConsumerProviderInstalledVersionSource.js';
import { createFileConsumerProviderManifestSource } from '../adapters/outbound/createFileConsumerProviderManifestSource.js';
import { createFileProviderCatalogStore } from '../adapters/outbound/createFileProviderCatalogStore.js';
import { createGitHubProviderCatalogSource } from '../adapters/outbound/createGitHubProviderCatalogSource.js';
import { createNpmProviderReleaseSource } from '../adapters/outbound/createNpmProviderReleaseSource.js';
import { resolveConsumerProviderEntryAsync } from '../application/use-cases/resolveConsumerProviderEntryAsync.js';
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
  const ghToken = env.GH_TOKEN?.trim();
  const githubToken = env.GITHUB_TOKEN?.trim();
  const token = ghToken !== undefined && ghToken !== '' ? ghToken : githubToken;
  const source = createGitHubProviderCatalogSource({ token });
  const store = createFileProviderCatalogStore(path.join(cacheRoot, 'provider-catalog-v2.json'));
  const packages = createBunProviderPackageStore({ cacheRoot: path.join(cacheRoot, 'providers') });
  const consumerManifestSource = createFileConsumerProviderManifestSource();
  const consumerProviderInstalledVersionSource = createFileConsumerProviderInstalledVersionSource();
  const providerReleaseSource = createNpmProviderReleaseSource();

  return {
    resolveCatalogAsync() {
      return resolveProviderCatalogAsync({ source, store });
    },
    async resolvePackageAsync(entry, cwd) {
      const selectedEntry = await resolveConsumerProviderEntryAsync({
        catalogEntry: entry,
        consumerProviderInstalledVersionSource,
        consumerManifestSource,
        cwd,
        providerReleaseSource,
      });
      return packages.resolveAsync(selectedEntry);
    },
  };
}

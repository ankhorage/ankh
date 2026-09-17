import type { AnkhPackageMetadata } from '@ankhorage/contracts/cli';

import type { AnkhDiscoveredPackage } from '../discovery.js';

export interface AnkhProviderCatalogEntry {
  readonly description: string;
  readonly metadata: AnkhPackageMetadata;
  readonly packageName: string;
  readonly repositoryUrl: string;
  readonly version: string;
}

export interface AnkhProviderCatalog {
  readonly entries: readonly AnkhProviderCatalogEntry[];
}

export interface AnkhProviderCatalogSnapshot extends AnkhProviderCatalog {
  readonly cachedAtMs: number;
}

export interface AnkhProviderRuntime {
  resolveCatalogAsync(): Promise<AnkhProviderCatalog>;
  resolvePackageAsync(entry: AnkhProviderCatalogEntry): Promise<AnkhDiscoveredPackage>;
}

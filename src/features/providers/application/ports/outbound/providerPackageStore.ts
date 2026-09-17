import type { AnkhDiscoveredPackage } from '../../../../../discovery.js';
import type { AnkhProviderCatalogEntry } from '../../../../../types/providers.js';

export interface ProviderPackageStore {
  resolveAsync(entry: AnkhProviderCatalogEntry): Promise<AnkhDiscoveredPackage>;
}

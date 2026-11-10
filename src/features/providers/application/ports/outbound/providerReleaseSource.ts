import type { AnkhProviderCatalogEntry } from '../../../../../types/providers.js';

export interface ProviderReleaseSource {
  resolveAsync(input: {
    readonly catalogEntry: AnkhProviderCatalogEntry;
    readonly version: string;
  }): Promise<AnkhProviderCatalogEntry>;
}

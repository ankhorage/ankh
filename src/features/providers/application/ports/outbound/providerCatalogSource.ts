import type { AnkhProviderCatalogEntry } from '../../../../../types/providers.js';

export interface ProviderCatalogSource {
  readAsync(): Promise<readonly AnkhProviderCatalogEntry[]>;
}

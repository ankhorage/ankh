import type { AnkhProviderCatalogSnapshot } from '../../../../../types/providers.js';

export interface ProviderCatalogStore {
  readAsync(): Promise<AnkhProviderCatalogSnapshot | null>;
  writeAsync(snapshot: AnkhProviderCatalogSnapshot): Promise<void>;
}

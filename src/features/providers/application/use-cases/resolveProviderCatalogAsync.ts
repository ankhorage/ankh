import type { AnkhProviderCatalog } from '../../../../types/providers.js';
import type { ProviderCatalogSource } from '../ports/outbound/providerCatalogSource.js';
import type { ProviderCatalogStore } from '../ports/outbound/providerCatalogStore.js';
import { PROVIDER_CATALOG_CACHE_SCHEMA_VERSION } from '../../domain/providerCachePolicy.js';

const DEFAULT_PROVIDER_CATALOG_TTL_MS = 60 * 60 * 1000;

/*** Resolve the official provider catalog from cache or GitHub with stale-cache fallback. */
export async function resolveProviderCatalogAsync(input: {
  readonly nowMs?: number;
  readonly source: ProviderCatalogSource;
  readonly store: ProviderCatalogStore;
  readonly ttlMs?: number;
}): Promise<AnkhProviderCatalog> {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_PROVIDER_CATALOG_TTL_MS;
  const cached = await input.store.readAsync();

  if (cached !== null && nowMs - cached.cachedAtMs <= ttlMs) {
    return { entries: cached.entries };
  }

  try {
    const entries = await input.source.readAsync();
    await input.store.writeAsync({
      cachedAtMs: nowMs,
      entries,
      schemaVersion: PROVIDER_CATALOG_CACHE_SCHEMA_VERSION,
    });
    return { entries };
  } catch (error) {
    if (cached !== null) {
      return { entries: cached.entries };
    }
    throw error;
  }
}

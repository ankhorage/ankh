import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AnkhCapabilityId, AnkhProviderReference } from '@ankhorage/contracts/cli';

import type {
  AnkhProviderCatalogEntry,
  AnkhProviderCatalogSnapshot,
} from '../../../../types/providers.js';
import type { ProviderCatalogStore } from '../../application/ports/outbound/providerCatalogStore.js';
import { PROVIDER_CATALOG_CACHE_SCHEMA_VERSION } from '../../domain/providerCachePolicy.js';

/*** Create a JSON-file cache for the remotely discovered provider catalog. */
export function createFileProviderCatalogStore(cacheFilePath: string): ProviderCatalogStore {
  return {
    async readAsync() {
      let rawText: string;
      try {
        rawText = await readFile(cacheFilePath, 'utf8');
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') return null;
        throw error;
      }

      const parsed: unknown = JSON.parse(rawText);
      return parseSnapshot(parsed);
    },
    async writeAsync(snapshot) {
      await mkdir(path.dirname(cacheFilePath), { recursive: true });
      await writeFile(cacheFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    },
  };
}

/*** Validate a cached provider catalog snapshot before it can drive the CLI. */
function parseSnapshot(value: unknown): AnkhProviderCatalogSnapshot | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PROVIDER_CATALOG_CACHE_SCHEMA_VERSION ||
    typeof value.cachedAtMs !== 'number' ||
    !Array.isArray(value.entries)
  ) {
    return null;
  }

  const entries = value.entries
    .map(parseEntry)
    .filter((entry): entry is AnkhProviderCatalogEntry => entry !== null);
  if (entries.length !== value.entries.length) return null;

  return {
    cachedAtMs: value.cachedAtMs,
    entries,
    schemaVersion: PROVIDER_CATALOG_CACHE_SCHEMA_VERSION,
  };
}

/*** Validate one cached catalog entry without trusting arbitrary JSON. */
function parseEntry(value: unknown): AnkhProviderCatalogEntry | null {
  if (!isRecord(value) || !isRecord(value.metadata)) return null;
  if (
    typeof value.description !== 'string' ||
    typeof value.packageName !== 'string' ||
    typeof value.repositoryUrl !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.metadata.category !== 'string' ||
    typeof value.metadata.provider !== 'string' ||
    !isProviderReference(value.metadata.provider) ||
    !Array.isArray(value.metadata.capabilities)
  ) {
    return null;
  }

  const capabilities: AnkhCapabilityId[] = [];
  for (const capability of value.metadata.capabilities) {
    if (typeof capability !== 'string' || !isCapabilityId(capability)) return null;
    capabilities.push(capability);
  }

  return {
    description: value.description,
    metadata: {
      capabilities,
      category: value.metadata.category,
      provider: value.metadata.provider,
    },
    packageName: value.packageName,
    repositoryUrl: value.repositoryUrl,
    version: value.version,
  };
}

/*** Validate package-relative provider references in cached metadata. */
function isProviderReference(value: string): value is AnkhProviderReference {
  return value.startsWith('./');
}

/*** Validate cached capability identifiers. */
function isCapabilityId(value: string): value is AnkhCapabilityId {
  const segments = value.split('.');
  return segments.length >= 2 && segments.every((segment) => segment.length > 0);
}

/*** Narrow an unknown value to a Node filesystem error. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

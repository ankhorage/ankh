import { normalizeCapability, parseCapability } from '@ankhorage/capability';
import type { AnkhPackageMetadata, AnkhProviderReference } from '@ankhorage/contracts/cli';

import type { AnkhProviderCatalogEntry } from '../../../types/providers.js';

/*** Parse one published npm package into validated Ankh provider catalog metadata. */
export function parsePublishedProviderEntry(
  value: unknown,
  repositoryUrl: string,
): AnkhProviderCatalogEntry | null {
  if (!isRecord(value)) return null;
  const packageName = readNonEmptyString(value.name);
  const version = readNonEmptyString(value.version);
  if (!packageName?.startsWith('@ankhorage/') || version === null || !isRecord(value.ankh)) {
    return null;
  }
  const metadata = parseAnkhMetadata(value.ankh, value.exports);
  if (metadata?.provider === null || metadata?.provider === undefined) return null;
  return {
    description: readNonEmptyString(value.description) ?? packageName,
    metadata: { ...metadata, provider: metadata.provider },
    packageName,
    repositoryUrl,
    version,
  };
}

/*** Parse canonical provider metadata from an npm package manifest. */
function parseAnkhMetadata(
  value: Record<string, unknown>,
  packageExports: unknown,
): AnkhPackageMetadata | null {
  const category = readNonEmptyString(value.category);
  const provider = resolveProviderReference(value.provider, packageExports);
  if (category === null || provider === null) return null;
  if (value.capabilities === undefined) return { capabilities: [], category, provider };
  if (!Array.isArray(value.capabilities)) return null;
  const capabilities = value.capabilities.map(parseCapability);
  if (capabilities.some((capability) => capability === null)) return null;
  return {
    capabilities: capabilities.filter((capability) => capability !== null).map(normalizeCapability),
    category,
    provider,
  };
}

/*** Resolve an explicit provider reference or the package CLI export. */
function resolveProviderReference(
  value: unknown,
  packageExports: unknown,
): AnkhProviderReference | null {
  if (value === null) return null;
  if (value === undefined) return resolvePackageCliExport(packageExports);
  return typeof value === 'string' && value.startsWith('./')
    ? (value as AnkhProviderReference)
    : null;
}

/*** Resolve the canonical CLI export as a package-relative provider reference. */
function resolvePackageCliExport(value: unknown): AnkhProviderReference | null {
  if (!isRecord(value)) return null;
  const cliExport = value['./cli'];
  if (typeof cliExport === 'string' && cliExport.startsWith('./')) {
    return cliExport as AnkhProviderReference;
  }
  if (!isRecord(cliExport)) return null;
  for (const candidate of [cliExport.import, cliExport.default]) {
    if (typeof candidate === 'string' && candidate.startsWith('./')) {
      return candidate as AnkhProviderReference;
    }
  }
  return null;
}

/*** Read a trimmed non-empty string. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

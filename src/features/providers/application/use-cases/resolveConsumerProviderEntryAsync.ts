import type { AnkhProviderCatalogEntry } from '../../../../types/providers.js';
import type { ConsumerProviderInstalledVersionSource } from '../ports/outbound/consumerProviderInstalledVersionSource.js';
import type { ConsumerProviderManifestSource } from '../ports/outbound/consumerProviderManifestSource.js';
import type { ProviderReleaseSource } from '../ports/outbound/providerReleaseSource.js';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

/*** Resolve a catalog provider from an explicit pin or the consumer's lockfile-backed installation. */
export async function resolveConsumerProviderEntryAsync(input: {
  readonly catalogEntry: AnkhProviderCatalogEntry;
  readonly consumerProviderInstalledVersionSource: ConsumerProviderInstalledVersionSource;
  readonly consumerManifestSource: ConsumerProviderManifestSource;
  readonly cwd: string;
  readonly providerReleaseSource: ProviderReleaseSource;
}): Promise<AnkhProviderCatalogEntry> {
  const manifest = await input.consumerManifestSource.readAsync(input.cwd);
  if (manifest === null) return input.catalogEntry;

  const selectedVersion = readSelectedVersion(manifest, input.catalogEntry.packageName);
  if (selectedVersion === null) return input.catalogEntry;
  const resolvedVersion = isExactVersion(selectedVersion)
    ? selectedVersion
    : await input.consumerProviderInstalledVersionSource.resolveAsync({
        cwd: input.cwd,
        packageName: input.catalogEntry.packageName,
      });
  if (!isExactVersion(resolvedVersion))
    throw new Error(
      `Consumer installation resolves ${input.catalogEntry.packageName} with invalid version "${resolvedVersion}".`,
    );

  const selectedEntry = await input.providerReleaseSource.resolveAsync({
    catalogEntry: input.catalogEntry,
    version: resolvedVersion,
  });
  if (selectedEntry.metadata.category !== input.catalogEntry.metadata.category) {
    throw new Error(
      `Published ${input.catalogEntry.packageName}@${resolvedVersion} does not provide the expected "${input.catalogEntry.metadata.category}" category.`,
    );
  }
  return selectedEntry;
}

/*** Read one unambiguous provider version from supported consumer dependency declarations. */
function readSelectedVersion(
  manifest: Record<string, unknown>,
  packageName: string,
): string | null {
  const versions = DEPENDENCY_FIELDS.flatMap((field) => {
    const dependencies = Object.entries(manifest).find(([name]) => name === field)?.[1];
    if (!isRecord(dependencies) || !(packageName in dependencies)) return [];
    const version = Object.entries(dependencies).find(([name]) => name === packageName)?.[1];
    if (typeof version !== 'string' || version.trim() === '') {
      throw new Error(`Consumer declares ${packageName} with an invalid version.`);
    }
    return [version.trim()];
  });
  const uniqueVersions = [...new Set(versions)];
  if (uniqueVersions.length === 0) return null;
  if (uniqueVersions.length !== 1) {
    throw new Error(`Consumer declares conflicting versions for ${packageName}.`);
  }
  return uniqueVersions[0] ?? null;
}

/*** Recognize a concrete registry version without permitting tags, ranges, paths, or workspace protocols. */
function isExactVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

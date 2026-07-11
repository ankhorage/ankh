import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryDiagnostic,
} from "./discovery.js";
import { readAnkhPackageMetadata } from "./packageMetadata.js";
import {
  loadProviderManifests,
  type AnkhLoadedProvider,
  type AnkhProviderManifestDiagnostic,
} from "./providerManifestLoader.js";

export interface AnkhCoreProviderState {
  readonly metadataDiagnostics: readonly AnkhMetadataDiscoveryDiagnostic[];
  readonly packages: readonly AnkhDiscoveredPackage[];
  readonly providerDiagnostics: readonly AnkhProviderManifestDiagnostic[];
  readonly providers: readonly AnkhLoadedProvider[];
}

export async function loadCoreProviderState(): Promise<AnkhCoreProviderState> {
  const packageJsonPath = Bun.resolveSync(
    "@ankhorage/doctor/package.json",
    import.meta.dir,
  );
  const metadataResult = await readAnkhPackageMetadata({
    packageJsonPath,
    source: "core-provider",
  });

  if (metadataResult.packageName === null || metadataResult.metadata === null) {
    return {
      metadataDiagnostics: metadataResult.diagnostics,
      packages: [],
      providerDiagnostics: [],
      providers: [],
    };
  }

  const discoveredPackage = {
    metadata: metadataResult.metadata,
    packageJsonPath,
    packageName: metadataResult.packageName,
    packageRoot: metadataResult.packageRoot,
    source: "core-provider",
  } satisfies AnkhDiscoveredPackage;
  const providerLoadResult = await loadProviderManifests([discoveredPackage]);

  return {
    metadataDiagnostics: metadataResult.diagnostics,
    packages: [discoveredPackage],
    providerDiagnostics: providerLoadResult.diagnostics,
    providers: providerLoadResult.providers,
  };
}

export function mergeCorePackages(
  corePackages: readonly AnkhDiscoveredPackage[],
  discoveredPackages: readonly AnkhDiscoveredPackage[],
): readonly AnkhDiscoveredPackage[] {
  return mergeByPackageName(
    corePackages,
    discoveredPackages,
    (discoveredPackage) => discoveredPackage.packageName,
  );
}

export function mergeCoreProviders(
  coreProviders: readonly AnkhLoadedProvider[],
  discoveredProviders: readonly AnkhLoadedProvider[],
): readonly AnkhLoadedProvider[] {
  return mergeByPackageName(
    coreProviders,
    discoveredProviders,
    (provider) => provider.discoveredPackage.packageName,
  );
}

function mergeByPackageName<T>(
  coreValues: readonly T[],
  discoveredValues: readonly T[],
  getPackageName: (value: T) => string,
): readonly T[] {
  const valuesByPackageName = new Map(
    coreValues.map((value) => [getPackageName(value), value]),
  );

  for (const value of discoveredValues) {
    valuesByPackageName.set(getPackageName(value), value);
  }

  return [...valuesByPackageName.values()];
}

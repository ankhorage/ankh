import { createRequire } from "node:module";

import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryDiagnostic,
} from "./discovery.js";
import { readAnkhPackageMetadata } from "./packageMetadata.js";
import {
  type AnkhLoadedProvider,
  type AnkhProviderManifestDiagnostic,
  loadProviderManifests,
} from "./providerManifestLoader.js";

const require = createRequire(import.meta.url);

const coreProviderPackageNames = [
  "@ankhorage/doctor",
  "@ankhorage/devtools",
] as const;

export interface AnkhCoreProviderState {
  readonly metadataDiagnostics: readonly AnkhMetadataDiscoveryDiagnostic[];
  readonly packages: readonly AnkhDiscoveredPackage[];
  readonly providerDiagnostics: readonly AnkhProviderManifestDiagnostic[];
  readonly providers: readonly AnkhLoadedProvider[];
}

export async function loadCoreProviderState(): Promise<AnkhCoreProviderState> {
  const metadataDiagnostics: AnkhMetadataDiscoveryDiagnostic[] = [];
  const packages: AnkhDiscoveredPackage[] = [];

  for (const packageName of coreProviderPackageNames) {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const metadataResult = await readAnkhPackageMetadata({
      packageJsonPath,
      source: "core-provider",
    });

    metadataDiagnostics.push(...metadataResult.diagnostics);

    if (
      metadataResult.packageName === null ||
      metadataResult.metadata === null
    ) {
      continue;
    }

    packages.push({
      metadata: metadataResult.metadata,
      packageJsonPath,
      packageName: metadataResult.packageName,
      packageRoot: metadataResult.packageRoot,
      source: "core-provider",
    });
  }

  const providerLoadResult = await loadProviderManifests(packages);

  return {
    metadataDiagnostics,
    packages,
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

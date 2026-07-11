import path from "node:path";
import { pathToFileURL } from "node:url";

import doctorProvider from "@ankhorage/doctor/cli";

import type { AnkhDiscoveredPackage } from "./discovery.js";
import type { AnkhLoadedProvider } from "./providerManifestLoader.js";

const DOCTOR_PACKAGE_NAME = "@ankhorage/doctor";
const DOCTOR_PROVIDER_PATH = "./dist/cli/index.js";

export interface AnkhCoreProviderState {
  readonly packages: readonly AnkhDiscoveredPackage[];
  readonly providers: readonly AnkhLoadedProvider[];
}

export function createCoreProviderState(): AnkhCoreProviderState {
  const packageJsonPath = Bun.resolveSync(
    "@ankhorage/doctor/package.json",
    import.meta.dir,
  );
  const providerModulePath = Bun.resolveSync(
    "@ankhorage/doctor/cli",
    import.meta.dir,
  );
  const discoveredPackage = {
    metadata: {
      category: doctorProvider.category,
      provider: DOCTOR_PROVIDER_PATH,
      capabilities: doctorProvider.capabilities,
    },
    packageJsonPath,
    packageName: DOCTOR_PACKAGE_NAME,
    packageRoot: path.dirname(packageJsonPath),
    source: "core-provider",
  } satisfies AnkhDiscoveredPackage;

  return {
    packages: [discoveredPackage],
    providers: [
      {
        discoveredPackage,
        manifest: doctorProvider,
        providerModuleDefaultExport: doctorProvider,
        providerModulePath,
        providerModuleUrl: pathToFileURL(providerModulePath).href,
      },
    ],
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

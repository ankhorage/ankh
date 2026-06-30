import type { AnkhDiscoveredPackage } from "./discovery.js";

export interface AnkhPackageRegistry {
  hasCategory(category: string): boolean;
  listPackages(): readonly AnkhDiscoveredPackage[];
}

export function createPackageRegistry(
  packages: readonly AnkhDiscoveredPackage[] = [],
): AnkhPackageRegistry {
  const packageList = [...packages];

  return {
    hasCategory(category: string) {
      return packageList.some(
        (discoveredPackage) => discoveredPackage.metadata.category === category,
      );
    },
    listPackages() {
      return packageList;
    },
  };
}

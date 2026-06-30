import type { AnkhDiscoveredPackage } from './discovery.js';

export interface AnkhPackageRegistry {
  findByCategory(category: string): AnkhDiscoveredPackage | null;
  hasCategory(category: string): boolean;
  listPackages(): readonly AnkhDiscoveredPackage[];
}

export function createPackageRegistry(
  packages: readonly AnkhDiscoveredPackage[] = [],
): AnkhPackageRegistry {
  const packageList = [...packages];

  return {
    findByCategory(category: string) {
      return (
        packageList.find((discoveredPackage) => discoveredPackage.metadata.category === category) ??
        null
      );
    },
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

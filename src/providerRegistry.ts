import type { AnkhCapabilityId } from "@ankhorage/contracts/cli";

import type { AnkhLoadedProvider } from "./providerManifestLoader.js";

export interface AnkhCommandListing {
  readonly aliases?: readonly string[];
  readonly providerId: string;
  readonly examples?: readonly string[];
  readonly packageName: string;
  readonly category: string;
  readonly path: readonly [string, ...string[]];
  readonly capability: AnkhCapabilityId;
  readonly summary: string;
}

export interface AnkhProviderRegistry {
  findByCategory(category: string): AnkhLoadedProvider | null;
  listProviders(): readonly AnkhLoadedProvider[];
  listCommands(): readonly AnkhCommandListing[];
  hasCategory(category: string): boolean;
}

export function createProviderRegistry(
  providers: readonly AnkhLoadedProvider[] = [],
): AnkhProviderRegistry {
  const providerList = [...providers];
  const commandList = providerList.flatMap<AnkhCommandListing>((provider) =>
    provider.manifest.commands.map((command) => ({
      ...(command.aliases !== undefined ? { aliases: command.aliases } : {}),
      ...(command.examples !== undefined ? { examples: command.examples } : {}),
      providerId: provider.manifest.id,
      packageName: provider.discoveredPackage.packageName,
      category: provider.manifest.category,
      path: command.path,
      capability: command.capability,
      summary: command.summary,
    })),
  );

  return {
    findByCategory(category: string) {
      return (
        providerList.find(
          (provider) => provider.manifest.category === category,
        ) ?? null
      );
    },
    listProviders() {
      return providerList;
    },
    listCommands() {
      return commandList;
    },
    hasCategory(category: string) {
      return providerList.some(
        (provider) => provider.manifest.category === category,
      );
    },
  };
}

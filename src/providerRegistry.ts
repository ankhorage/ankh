import type {
  AnkhCapabilityId,
  AnkhCommandProviderManifest,
} from "@ankhorage/contracts/cli";

export interface AnkhCommandListing {
  readonly providerId: string;
  readonly category: string;
  readonly path: readonly [string, ...string[]];
  readonly capability: AnkhCapabilityId;
  readonly summary: string;
}

export interface AnkhProviderRegistry {
  listProviders(): readonly AnkhCommandProviderManifest[];
  listCommands(): readonly AnkhCommandListing[];
  hasCategory(category: string): boolean;
}

/**
 * Create an in-memory provider registry. In #1 this stays empty by default.
 */
export function createProviderRegistry(
  providers: readonly AnkhCommandProviderManifest[] = [],
): AnkhProviderRegistry {
  const providerList = [...providers];
  const commandList = providerList.flatMap<AnkhCommandListing>((provider) =>
    provider.commands.map((command) => ({
      providerId: provider.id,
      category: provider.category,
      path: command.path,
      capability: command.capability,
      summary: command.summary,
    })),
  );

  return {
    listProviders() {
      return providerList;
    },
    listCommands() {
      return commandList;
    },
    hasCategory(category: string) {
      return providerList.some((provider) => provider.category === category);
    },
  };
}

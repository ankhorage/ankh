import type { AnkhCapabilityId } from '@ankhorage/contracts/cli';

import type { AnkhLoadedProvider } from './providerManifestLoader.js';

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

export interface AnkhResolvedProviderCommand {
  readonly argv: readonly string[];
  readonly command: AnkhCommandListing;
  readonly provider: AnkhLoadedProvider;
}

export interface AnkhProviderRegistry {
  findByCategory(category: string): AnkhLoadedProvider | null;
  listProviders(): readonly AnkhLoadedProvider[];
  listCommands(): readonly AnkhCommandListing[];
  hasCategory(category: string): boolean;
  resolveCommand(category: string, tokens: readonly string[]): AnkhResolvedProviderCommand | null;
}

export function createProviderRegistry(
  providers: readonly AnkhLoadedProvider[] = [],
): AnkhProviderRegistry {
  const providerList = [...providers];
  const commandList = providerList.flatMap<AnkhCommandListing>((provider) =>
    provider.manifest.commands.map((command) => createCommandListing(provider, command)),
  );
  const providerCommandMap = new Map(
    providerList.map((provider) => [
      provider.manifest.category,
      provider.manifest.commands.map((command) => createCommandListing(provider, command)),
    ]),
  );

  return {
    findByCategory(category: string) {
      return providerList.find((provider) => provider.manifest.category === category) ?? null;
    },
    listProviders() {
      return providerList;
    },
    listCommands() {
      return commandList;
    },
    hasCategory(category: string) {
      return providerList.some((provider) => provider.manifest.category === category);
    },
    resolveCommand(category: string, tokens: readonly string[]) {
      const provider = providerList.find((candidate) => candidate.manifest.category === category);
      if (provider === undefined) {
        return null;
      }

      const commands = providerCommandMap.get(category) ?? [];
      const [pathMatch] = commands
        .filter((command) => matchesCommandPath(command.path, tokens))
        .sort((left, right) => right.path.length - left.path.length);

      if (pathMatch !== undefined) {
        return {
          argv: tokens.slice(pathMatch.path.length),
          command: pathMatch,
          provider,
        };
      }

      const [aliasToken] = tokens;
      if (aliasToken === undefined) {
        return null;
      }

      const aliasMatch = commands.find((command) => command.aliases?.includes(aliasToken));
      if (aliasMatch === undefined) {
        return null;
      }

      return {
        argv: tokens.slice(1),
        command: aliasMatch,
        provider,
      };
    },
  };
}

function createCommandListing(
  provider: AnkhLoadedProvider,
  command: AnkhLoadedProvider['manifest']['commands'][number],
): AnkhCommandListing {
  return {
    ...(command.aliases !== undefined ? { aliases: command.aliases } : {}),
    ...(command.examples !== undefined ? { examples: command.examples } : {}),
    providerId: provider.manifest.id,
    packageName: provider.discoveredPackage.packageName,
    category: provider.manifest.category,
    path: command.path,
    capability: command.capability,
    summary: command.summary,
  };
}

function matchesCommandPath(commandPath: readonly string[], tokens: readonly string[]): boolean {
  if (commandPath.length > tokens.length) {
    return false;
  }

  return commandPath.every((segment, index) => tokens[index] === segment);
}

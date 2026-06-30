import type { AnkhCliRunResult, AnkhCommandContext } from './commandContext.js';
import { createDefaultCommandContext } from './commandContext.js';
import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryResult,
  DiscoverAnkhPackagesOptions,
} from './discovery.js';
import { discoverAnkhPackages } from './discovery.js';
import {
  renderCategoryHelp,
  renderCategoryProviderUnavailable,
  renderCommands,
  renderDiscoveryFailure,
  renderMetadataDiscoveryDiagnostics,
  renderProviderLoadFailure,
  renderProviderManifestDiagnostics,
  renderRootHelp,
  renderUnknownCategory,
  renderUnknownCommand,
} from './help.js';
import type { AnkhPackageRegistry } from './packageRegistry.js';
import { createPackageRegistry } from './packageRegistry.js';
import { parseArgv } from './parser.js';
import type {
  AnkhProviderManifestDiagnostic,
  LoadProviderManifestsResult,
} from './providerManifestLoader.js';
import { loadProviderManifests } from './providerManifestLoader.js';
import type { AnkhProviderRegistry } from './providerRegistry.js';
import { createProviderRegistry } from './providerRegistry.js';

export type DiscoverAnkhPackagesFn = (
  options: DiscoverAnkhPackagesOptions,
) => Promise<AnkhMetadataDiscoveryResult>;

export type LoadProviderManifestsFn = (
  packages: readonly AnkhDiscoveredPackage[],
) => Promise<LoadProviderManifestsResult>;

export interface RunCliOptions {
  readonly context?: AnkhCommandContext;
  readonly discoverPackages?: DiscoverAnkhPackagesFn;
  readonly loadProviders?: LoadProviderManifestsFn;
  readonly registry?: AnkhPackageRegistry;
  readonly providerRegistry?: AnkhProviderRegistry;
}

interface ResolvedCliState {
  readonly packageRegistry: AnkhPackageRegistry;
  readonly providerRegistry: AnkhProviderRegistry;
  readonly metadataDiagnostics: AnkhMetadataDiscoveryResult['diagnostics'];
  readonly providerDiagnostics: readonly AnkhProviderManifestDiagnostic[];
}

/**
 * Run the root CLI bootstrap shell without exiting the process.
 */
export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<AnkhCliRunResult> {
  const context = options.context ?? createDefaultCommandContext();
  const discoverPackages = options.discoverPackages ?? discoverAnkhPackages;
  const loadProviders = options.loadProviders ?? loadProviderManifests;
  const request = await Promise.resolve(parseArgv(argv));

  switch (request.kind) {
    case 'help':
      context.writeStdout(renderRootHelp());
      return { exitCode: 0 };
    case 'version':
      context.writeStdout(`${context.version}\n`);
      return { exitCode: 0 };
    case 'commands': {
      const resolvedState = await resolveCliState({
        context,
        discoverPackages,
        loadProviders,
        options,
      });

      if ('exitCode' in resolvedState) {
        return resolvedState;
      }

      context.writeStdout(
        renderCommands(
          resolvedState.packageRegistry.listPackages(),
          resolvedState.providerRegistry,
        ),
      );

      const metadataDiagnosticsOutput = renderMetadataDiscoveryDiagnostics(
        resolvedState.metadataDiagnostics,
      );
      if (metadataDiagnosticsOutput !== '') {
        context.writeStderr(metadataDiagnosticsOutput);
      }

      const providerDiagnosticsOutput = renderProviderManifestDiagnostics(
        resolvedState.providerDiagnostics,
      );
      if (providerDiagnosticsOutput !== '') {
        context.writeStderr(providerDiagnosticsOutput);
      }

      return { exitCode: 0 };
    }
    case 'category-help': {
      const resolvedState = await resolveCliState({
        context,
        discoverPackages,
        loadProviders,
        options,
      });

      if ('exitCode' in resolvedState) {
        return resolvedState;
      }

      const discoveredPackage = resolvedState.packageRegistry.findByCategory(request.category);
      if (discoveredPackage === null) {
        context.writeStderr(renderUnknownCategory(request.category));
        return { exitCode: 1 };
      }

      const loadedProvider = resolvedState.providerRegistry.findByCategory(request.category);
      if (loadedProvider === null) {
        const providerDiagnostics = resolvedState.providerDiagnostics.filter(
          (diagnostic) =>
            diagnostic.packageName === discoveredPackage.packageName ||
            diagnostic.category === request.category,
        );

        if (providerDiagnostics.length > 0) {
          context.writeStderr(renderProviderManifestDiagnostics(providerDiagnostics));
        } else {
          context.writeStderr(
            renderCategoryProviderUnavailable(request.category, discoveredPackage.packageName),
          );
        }

        return { exitCode: 1 };
      }

      context.writeStdout(renderCategoryHelp(request.category, resolvedState.providerRegistry));
      return { exitCode: 0 };
    }
    case 'dispatch':
      context.writeStderr(renderUnknownCommand(request.tokens));
      return { exitCode: 1 };
  }
}

async function resolveCliState(input: {
  readonly context: AnkhCommandContext;
  readonly discoverPackages: DiscoverAnkhPackagesFn;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
}): Promise<ResolvedCliState | AnkhCliRunResult> {
  if (input.options.registry !== undefined && input.options.providerRegistry !== undefined) {
    return {
      packageRegistry: input.options.registry,
      providerRegistry: input.options.providerRegistry,
      metadataDiagnostics: [],
      providerDiagnostics: [],
    };
  }

  try {
    const discoveryResult = await input.discoverPackages({ cwd: input.context.cwd });
    const packageRegistry =
      input.options.registry ?? createPackageRegistry(discoveryResult.packages);

    try {
      const providerLoadResult =
        input.options.providerRegistry !== undefined
          ? {
              diagnostics: [] as const,
              providers: input.options.providerRegistry.listProviders(),
            }
          : await input.loadProviders(discoveryResult.packages);

      const providerRegistry =
        input.options.providerRegistry ?? createProviderRegistry(providerLoadResult.providers);

      return {
        packageRegistry,
        providerRegistry,
        metadataDiagnostics: discoveryResult.diagnostics,
        providerDiagnostics: providerLoadResult.diagnostics,
      };
    } catch (error) {
      input.context.writeStderr(renderProviderLoadFailure(error));
      return { exitCode: 1 };
    }
  } catch (error) {
    input.context.writeStderr(renderDiscoveryFailure(error));
    return { exitCode: 1 };
  }
}

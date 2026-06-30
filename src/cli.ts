import type { AnkhCliRunResult, AnkhCommandContext } from './commandContext.js';
import { createDefaultCommandContext } from './commandContext.js';
import type { AnkhMetadataDiscoveryResult, DiscoverAnkhPackagesOptions } from './discovery.js';
import { discoverAnkhPackages } from './discovery.js';
import {
  renderCommands,
  renderDiscoveryFailure,
  renderMetadataDiscoveryDiagnostics,
  renderRootHelp,
  renderUnknownCommand,
} from './help.js';
import type { AnkhPackageRegistry } from './packageRegistry.js';
import { createPackageRegistry } from './packageRegistry.js';
import { parseArgv } from './parser.js';

export type DiscoverAnkhPackagesFn = (
  options: DiscoverAnkhPackagesOptions,
) => Promise<AnkhMetadataDiscoveryResult>;

export interface RunCliOptions {
  readonly context?: AnkhCommandContext;
  readonly discoverPackages?: DiscoverAnkhPackagesFn;
  readonly registry?: AnkhPackageRegistry;
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
  const request = await Promise.resolve(parseArgv(argv));

  switch (request.kind) {
    case 'help':
      context.writeStdout(renderRootHelp());
      return { exitCode: 0 };
    case 'version':
      context.writeStdout(`${context.version}\n`);
      return { exitCode: 0 };
    case 'commands': {
      if (options.registry !== undefined) {
        context.writeStdout(renderCommands(options.registry.listPackages()));
        return { exitCode: 0 };
      }

      try {
        const discoveryResult = await discoverPackages({ cwd: context.cwd });
        const registry = createPackageRegistry(discoveryResult.packages);
        context.writeStdout(renderCommands(registry.listPackages()));

        const diagnosticsOutput = renderMetadataDiscoveryDiagnostics(discoveryResult.diagnostics);
        if (diagnosticsOutput !== '') {
          context.writeStderr(diagnosticsOutput);
        }

        return { exitCode: 0 };
      } catch (error) {
        context.writeStderr(renderDiscoveryFailure(error));
        return { exitCode: 1 };
      }
    }
    case 'dispatch':
      context.writeStderr(renderUnknownCommand(request.tokens));
      return { exitCode: 1 };
  }
}

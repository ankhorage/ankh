import type { AnkhCliRunResult, AnkhCommandContext } from "./commandContext.js";
import { createDefaultCommandContext } from "./commandContext.js";
import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryResult,
  DiscoverAnkhPackagesOptions,
} from "./discovery.js";
import { discoverAnkhPackages } from "./discovery.js";
import {
  type AnkhCommandExecutionContext,
  resolveExecutableCommand,
} from "./execution.js";
import {
  renderCategoryHelp,
  renderCategoryProviderUnavailable,
  renderCommandExecutionFailure,
  renderCommands,
  renderDiscoveryFailure,
  renderExecutionDiagnostics,
  renderMetadataDiscoveryDiagnostics,
  renderProviderLoadFailure,
  renderProviderManifestDiagnostics,
  renderRootHelp,
  renderUnknownCategory,
  renderUnknownCommand,
  renderUnknownProviderCommand,
} from "./help.js";
import type { AnkhPackageRegistry } from "./packageRegistry.js";
import { createPackageRegistry } from "./packageRegistry.js";
import { parseArgv } from "./parser.js";
import {
  type AnkhPlanningContext,
  hasCommandPlanErrors,
  renderCommandPlan,
  renderCommandPlanJson,
  renderPlanningDiagnostics,
  resolvePlannableCommand,
} from "./planning.js";
import type {
  AnkhProviderManifestDiagnostic,
  LoadProviderManifestsResult,
} from "./providerManifestLoader.js";
import { loadProviderManifests } from "./providerManifestLoader.js";
import type { AnkhProviderRegistry } from "./providerRegistry.js";
import { createProviderRegistry } from "./providerRegistry.js";

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
  readonly metadataDiagnostics: AnkhMetadataDiscoveryResult["diagnostics"];
  readonly providerDiagnostics: readonly AnkhProviderManifestDiagnostic[];
}

interface ParsedPlanRequest {
  readonly commandTokens: readonly string[];
  readonly format: "human" | "json";
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
    case "help":
      context.writeStdout(renderRootHelp());
      return { exitCode: 0 };
    case "version":
      context.writeStdout(`${context.version}\n`);
      return { exitCode: 0 };
    case "commands": {
      const resolvedState = await resolveCliState({
        context,
        discoverPackages,
        loadProviders,
        options,
      });

      if ("exitCode" in resolvedState) {
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
      if (metadataDiagnosticsOutput !== "") {
        context.writeStderr(metadataDiagnosticsOutput);
      }

      const providerDiagnosticsOutput = renderProviderManifestDiagnostics(
        resolvedState.providerDiagnostics,
      );
      if (providerDiagnosticsOutput !== "") {
        context.writeStderr(providerDiagnosticsOutput);
      }

      return { exitCode: 0 };
    }
    case "category-help": {
      const resolvedState = await resolveCliState({
        context,
        discoverPackages,
        loadProviders,
        options,
      });

      if ("exitCode" in resolvedState) {
        return resolvedState;
      }

      const discoveredPackage = resolvedState.packageRegistry.findByCategory(
        request.category,
      );
      if (discoveredPackage === null) {
        context.writeStderr(renderUnknownCategory(request.category));
        return { exitCode: 1 };
      }

      const loadedProvider = resolvedState.providerRegistry.findByCategory(
        request.category,
      );
      if (loadedProvider === null) {
        const providerDiagnostics = resolvedState.providerDiagnostics.filter(
          (diagnostic) =>
            diagnostic.packageName === discoveredPackage.packageName ||
            diagnostic.category === request.category,
        );

        if (providerDiagnostics.length > 0) {
          context.writeStderr(
            renderProviderManifestDiagnostics(providerDiagnostics),
          );
        } else {
          context.writeStderr(
            renderCategoryProviderUnavailable(
              request.category,
              discoveredPackage.packageName,
            ),
          );
        }

        return { exitCode: 1 };
      }

      context.writeStdout(
        renderCategoryHelp(request.category, resolvedState.providerRegistry),
      );
      return { exitCode: 0 };
    }
    case "dispatch":
      return dispatchProviderCommand({
        context,
        discoverPackages,
        loadProviders,
        options,
        tokens: mapCompatTokens(request.tokens),
      });
    case "plan":
      return dispatchProviderPlan({
        context,
        discoverPackages,
        loadProviders,
        options,
        tokens: request.tokens,
      });
    case "run":
      context.writeStderr(renderRunDeferred(request.tokens));
      return { exitCode: 1 };
  }
}

function mapCompatTokens(
  tokens: readonly [string, ...string[]],
): readonly [string, ...string[]] {
  const [firstToken, ...restTokens] = tokens;
  const marker = ["in", "fra"].join("");

  if (!firstToken.startsWith(`${marker}:`)) {
    return tokens;
  }

  const legacyName = firstToken.slice(marker.length + 1);
  const nextName = legacyName === "regenerate" ? "generate" : legacyName;

  if (
    ![
      "validate",
      "generate",
      "status",
      "runtime-status",
      "up",
      "down",
    ].includes(nextName)
  ) {
    return tokens;
  }

  return [
    marker,
    nextName === "runtime-status" ? "status" : nextName,
    ...restTokens,
  ];
}

async function dispatchProviderPlan(input: {
  readonly context: AnkhCommandContext;
  readonly discoverPackages: DiscoverAnkhPackagesFn;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
  readonly tokens: readonly string[];
}): Promise<AnkhCliRunResult> {
  const parsedPlanRequest = parsePlanRequest(input.tokens);
  if (parsedPlanRequest === null) {
    input.context.writeStderr(renderPlanUsage());
    return { exitCode: 1 };
  }

  const resolvedState = await resolveCliState({
    context: input.context,
    discoverPackages: input.discoverPackages,
    loadProviders: input.loadProviders,
    options: input.options,
  });

  if ("exitCode" in resolvedState) {
    return resolvedState;
  }

  const [category, ...commandTokens] = parsedPlanRequest.commandTokens;
  if (category === undefined || commandTokens.length === 0) {
    input.context.writeStderr(renderPlanUsage());
    return { exitCode: 1 };
  }

  const discoveredPackage =
    resolvedState.packageRegistry.findByCategory(category);
  if (discoveredPackage === null) {
    input.context.writeStderr(renderUnknownCommand(["plan", ...input.tokens]));
    return { exitCode: 1 };
  }

  const loadedProvider =
    resolvedState.providerRegistry.findByCategory(category);
  if (loadedProvider === null) {
    const providerDiagnostics = resolvedState.providerDiagnostics.filter(
      (diagnostic) =>
        diagnostic.packageName === discoveredPackage.packageName ||
        diagnostic.category === category,
    );

    if (providerDiagnostics.length > 0) {
      input.context.writeStderr(
        renderProviderManifestDiagnostics(providerDiagnostics),
      );
    } else {
      input.context.writeStderr(
        renderCategoryProviderUnavailable(
          category,
          discoveredPackage.packageName,
        ),
      );
    }

    return { exitCode: 1 };
  }

  const planningResult = resolvePlannableCommand(
    resolvedState.providerRegistry,
    category,
    commandTokens,
  );

  if (planningResult.resolvedCommand === null) {
    if (planningResult.diagnostics.length > 0) {
      input.context.writeStderr(
        renderPlanningDiagnostics(planningResult.diagnostics),
      );
      return { exitCode: 1 };
    }

    input.context.writeStderr(
      renderUnknownProviderCommand(category, commandTokens),
    );
    return { exitCode: 1 };
  }

  const planningContext: AnkhPlanningContext = {
    ...input.context,
    packageRegistry: resolvedState.packageRegistry,
    providerRegistry: resolvedState.providerRegistry,
  };

  try {
    const plan = await planningResult.resolvedCommand.handler({
      argv: planningResult.resolvedCommand.argv,
      command: planningResult.resolvedCommand.command,
      provider: planningResult.resolvedCommand.provider,
      context: planningContext,
    });

    input.context.writeStdout(
      parsedPlanRequest.format === "json"
        ? renderCommandPlanJson(plan)
        : renderCommandPlan(plan),
    );

    return { exitCode: hasCommandPlanErrors(plan) ? 1 : 0 };
  } catch (error) {
    input.context.writeStderr(
      renderPlanningFailure(
        category,
        planningResult.resolvedCommand.command.path,
        error,
      ),
    );
    return { exitCode: 1 };
  }
}

async function dispatchProviderCommand(input: {
  readonly context: AnkhCommandContext;
  readonly discoverPackages: DiscoverAnkhPackagesFn;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
  readonly tokens: readonly [string, ...string[]];
}): Promise<AnkhCliRunResult> {
  const resolvedState = await resolveCliState({
    context: input.context,
    discoverPackages: input.discoverPackages,
    loadProviders: input.loadProviders,
    options: input.options,
  });

  if ("exitCode" in resolvedState) {
    return resolvedState;
  }

  const [category, ...commandTokens] = input.tokens;
  const discoveredPackage =
    resolvedState.packageRegistry.findByCategory(category);
  if (discoveredPackage === null) {
    input.context.writeStderr(renderUnknownCommand(input.tokens));
    return { exitCode: 1 };
  }

  const loadedProvider =
    resolvedState.providerRegistry.findByCategory(category);
  if (loadedProvider === null) {
    const providerDiagnostics = resolvedState.providerDiagnostics.filter(
      (diagnostic) =>
        diagnostic.packageName === discoveredPackage.packageName ||
        diagnostic.category === category,
    );

    if (providerDiagnostics.length > 0) {
      input.context.writeStderr(
        renderProviderManifestDiagnostics(providerDiagnostics),
      );
    } else {
      input.context.writeStderr(
        renderCategoryProviderUnavailable(
          category,
          discoveredPackage.packageName,
        ),
      );
    }

    return { exitCode: 1 };
  }

  const executionResult = resolveExecutableCommand(
    resolvedState.providerRegistry,
    category,
    commandTokens,
  );

  if (executionResult.resolvedCommand === null) {
    if (executionResult.diagnostics.length > 0) {
      input.context.writeStderr(
        renderExecutionDiagnostics(executionResult.diagnostics),
      );
      return { exitCode: 1 };
    }

    input.context.writeStderr(
      renderUnknownProviderCommand(category, commandTokens),
    );
    return { exitCode: 1 };
  }

  const executionContext: AnkhCommandExecutionContext = {
    ...input.context,
    packageRegistry: resolvedState.packageRegistry,
    providerRegistry: resolvedState.providerRegistry,
  };

  try {
    const commandResult = await executionResult.resolvedCommand.handler({
      argv: executionResult.resolvedCommand.argv,
      command: executionResult.resolvedCommand.command,
      provider: executionResult.resolvedCommand.provider,
      context: executionContext,
    });

    return {
      exitCode: commandResult?.exitCode ?? 0,
    };
  } catch (error) {
    input.context.writeStderr(
      renderCommandExecutionFailure(
        category,
        executionResult.resolvedCommand.command.path,
        error,
      ),
    );
    return { exitCode: 1 };
  }
}

async function resolveCliState(input: {
  readonly context: AnkhCommandContext;
  readonly discoverPackages: DiscoverAnkhPackagesFn;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
}): Promise<ResolvedCliState | AnkhCliRunResult> {
  if (
    input.options.registry !== undefined &&
    input.options.providerRegistry !== undefined
  ) {
    return {
      packageRegistry: input.options.registry,
      providerRegistry: input.options.providerRegistry,
      metadataDiagnostics: [],
      providerDiagnostics: [],
    };
  }

  try {
    const discoveryResult = await input.discoverPackages({
      cwd: input.context.cwd,
    });
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
        input.options.providerRegistry ??
        createProviderRegistry(providerLoadResult.providers);

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

function parsePlanRequest(tokens: readonly string[]): ParsedPlanRequest | null {
  if (tokens.length < 2) {
    return null;
  }

  const commandTokens: string[] = [];
  let format: ParsedPlanRequest["format"] = "human";

  for (const token of tokens) {
    if (token === "--json") {
      format = "json";
      continue;
    }

    commandTokens.push(token);
  }

  return commandTokens.length >= 2
    ? {
        commandTokens,
        format,
      }
    : null;
}

function renderPlanUsage(): string {
  return [
    "Usage: ankh plan <category> <command> [--json]",
    "Planning prints provider-declared command plans without executing them.",
    "",
  ].join("\n");
}

function renderRunDeferred(tokens: readonly string[]): string {
  const attempted = tokens.length === 0 ? "(missing)" : tokens.join(" ");
  return [
    `ankh run is deferred until command execution semantics are explicitly designed: ${attempted}`,
    "Use `ankh plan <category> <command>` to inspect provider plans first.",
    "",
  ].join("\n");
}

function renderPlanningFailure(
  category: string,
  commandPath: readonly string[],
  error: unknown,
): string {
  return [
    `Ankh command planning failed for "${category} ${commandPath.join(
      " ",
    )}": ${getErrorMessage(error)}`,
    "",
  ].join("\n");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

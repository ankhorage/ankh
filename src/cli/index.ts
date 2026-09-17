import type { AnkhCliRunResult, AnkhCommandContext } from '../commandContext.js';
import { createDefaultCommandContext } from '../commandContext.js';
import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryResult,
  DiscoverAnkhPackagesOptions,
} from '../discovery.js';
import { type AnkhCommandExecutionContext, resolveExecutableCommand } from '../execution.js';
import { readPackagePresentation } from '../features/help/readPackagePresentation.js';
import { createProviderRuntime } from '../features/providers/composition/createProviderRuntime.js';
import {
  renderCategoryHelp,
  renderCategoryProviderUnavailable,
  renderCommandExecutionFailure,
  renderDiscoveryFailure,
  renderExecutionDiagnostics,
  renderProviderCatalogFailure,
  renderProviderLoadFailure,
  renderProviderManifestDiagnostics,
  renderProviderPackageResolutionFailure,
  renderRootHelp,
  renderUnknownCategory,
  renderUnknownCommand,
  renderUnknownProviderCommand,
} from '../help.js';
import type { AnkhPackageRegistry } from '../packageRegistry.js';
import { createPackageRegistry } from '../packageRegistry.js';
import { parseArgv } from '../parser.js';
import {
  type AnkhPlanningContext,
  hasCommandPlanErrors,
  renderCommandPlan,
  renderCommandPlanJson,
  renderPlanningDiagnostics,
  resolvePlannableCommand,
} from '../planning.js';
import type {
  AnkhProviderManifestDiagnostic,
  LoadProviderManifestsResult,
} from '../providerManifestLoader.js';
import { loadProviderManifests } from '../providerManifestLoader.js';
import type { AnkhProviderRegistry } from '../providerRegistry.js';
import { createProviderRegistry } from '../providerRegistry.js';
import type { AnkhProviderCatalogEntry, AnkhProviderRuntime } from '../types/providers.js';

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
  readonly providerRuntime?: AnkhProviderRuntime;
  readonly registry?: AnkhPackageRegistry;
  readonly providerRegistry?: AnkhProviderRegistry;
}

interface ResolvedCliState {
  readonly packageRegistry: AnkhPackageRegistry;
  readonly providerRegistry: AnkhProviderRegistry;
  readonly providerDiagnostics: readonly AnkhProviderManifestDiagnostic[];
}

interface ResolvedCategoryCliState extends ResolvedCliState {
  readonly description: string;
  readonly discoveredPackage: AnkhDiscoveredPackage;
}

interface ParsedPlanRequest {
  readonly commandTokens: readonly string[];
  readonly format: 'human' | 'json';
}

/*** Run the root Ankh CLI against the official remote provider catalog. */
export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<AnkhCliRunResult> {
  const context = options.context ?? createDefaultCommandContext();
  const providerRuntime = options.providerRuntime ?? createProviderRuntime(context.env);
  const loadProviders = options.loadProviders ?? loadProviderManifests;
  const request = await Promise.resolve(parseArgv(argv));

  switch (request.kind) {
    case 'help':
      return renderCatalogRootHelp({ context, options, providerRuntime });
    case 'version':
      context.writeStdout(`${context.version}\n`);
      return { exitCode: 0 };
    case 'category-help':
      return renderCatalogCategoryHelp({
        category: request.category,
        context,
        loadProviders,
        options,
        providerRuntime,
      });
    case 'dispatch':
      return dispatchProviderCommand({
        context,
        loadProviders,
        options,
        providerRuntime,
        tokens: request.tokens,
      });
    case 'plan':
      return dispatchProviderPlan({
        context,
        loadProviders,
        options,
        providerRuntime,
        tokens: request.tokens,
      });
    case 'run':
      context.writeStderr(renderRunDeferred(request.tokens));
      return { exitCode: 1 };
  }
}

/*** Render cwd-independent root help from the official provider catalog. */
async function renderCatalogRootHelp(input: {
  readonly context: AnkhCommandContext;
  readonly options: RunCliOptions;
  readonly providerRuntime: AnkhProviderRuntime;
}): Promise<AnkhCliRunResult> {
  const injectedState = resolveInjectedCliState(input.options);
  if (injectedState !== null) {
    const providers = injectedState.providerRegistry
      .listProviders()
      .filter(
        (provider) =>
          injectedState.providerRegistry.findAllByCategory(provider.manifest.category).length === 1,
      );
    const commands = await Promise.all(
      providers.map(async (provider) => {
        const presentation = await readPackagePresentation(
          provider.discoveredPackage.packageJsonPath,
        );
        return {
          command: provider.manifest.category,
          repositoryUrl: presentation.repositoryUrl,
        };
      }),
    );
    input.context.writeStdout(renderRootHelp(commands));
    return { exitCode: 0 };
  }

  if (input.options.discoverPackages !== undefined) {
    const resolvedState = await resolveExplicitDiscoveredCliState({
      context: input.context,
      discoverPackages: input.options.discoverPackages,
      loadProviders: input.options.loadProviders ?? loadProviderManifests,
    });
    if ('exitCode' in resolvedState) return resolvedState;
    const providers = resolvedState.providerRegistry
      .listProviders()
      .filter(
        (provider) =>
          resolvedState.providerRegistry.findAllByCategory(provider.manifest.category).length === 1,
      );
    const commands = await Promise.all(
      providers.map(async (provider) => {
        const presentation = await readPackagePresentation(
          provider.discoveredPackage.packageJsonPath,
        );
        return {
          command: provider.manifest.category,
          repositoryUrl: presentation.repositoryUrl,
        };
      }),
    );
    input.context.writeStdout(renderRootHelp(commands));
    return { exitCode: 0 };
  }

  try {
    const catalog = await input.providerRuntime.resolveCatalogAsync();
    input.context.writeStdout(
      renderRootHelp(
        catalog.entries.map((entry) => ({
          command: entry.metadata.category,
          repositoryUrl: entry.repositoryUrl,
        })),
      ),
    );
    return { exitCode: 0 };
  } catch (error) {
    input.context.writeStderr(renderProviderCatalogFailure(error));
    return { exitCode: 1 };
  }
}

/*** Render provider help after resolving exactly one official provider package. */
async function renderCatalogCategoryHelp(input: {
  readonly category: string;
  readonly context: AnkhCommandContext;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
  readonly providerRuntime: AnkhProviderRuntime;
}): Promise<AnkhCliRunResult> {
  const resolvedState = await resolveCategoryCliState(input.category, input);
  if (resolvedState === null) {
    input.context.writeStderr(renderUnknownCategory(input.category));
    return { exitCode: 1 };
  }
  if ('exitCode' in resolvedState) return resolvedState;

  const loadedProvider = resolvedState.providerRegistry.findByCategory(input.category);
  if (loadedProvider === null) {
    writeProviderUnavailable({
      category: input.category,
      context: input.context,
      discoveredPackage: resolvedState.discoveredPackage,
      providerDiagnostics: resolvedState.providerDiagnostics,
    });
    return { exitCode: 1 };
  }

  input.context.writeStdout(
    renderCategoryHelp(input.category, resolvedState.providerRegistry, resolvedState.description),
  );
  return { exitCode: 0 };
}

/*** Plan a provider command after resolving its official package on demand. */
async function dispatchProviderPlan(input: {
  readonly context: AnkhCommandContext;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
  readonly providerRuntime: AnkhProviderRuntime;
  readonly tokens: readonly string[];
}): Promise<AnkhCliRunResult> {
  const parsedPlanRequest = parsePlanRequest(input.tokens);
  if (parsedPlanRequest === null) {
    input.context.writeStderr(renderPlanUsage());
    return { exitCode: 1 };
  }

  const [category, ...commandTokens] = parsedPlanRequest.commandTokens;
  if (category === undefined) {
    input.context.writeStderr(renderPlanUsage());
    return { exitCode: 1 };
  }

  const resolvedState = await resolveCategoryCliState(category, input);
  if (resolvedState === null) {
    input.context.writeStderr(renderUnknownCommand(['plan', ...input.tokens]));
    return { exitCode: 1 };
  }
  if ('exitCode' in resolvedState) return resolvedState;

  const loadedProvider = resolvedState.providerRegistry.findByCategory(category);
  if (loadedProvider === null) {
    writeProviderUnavailable({
      category,
      context: input.context,
      discoveredPackage: resolvedState.discoveredPackage,
      providerDiagnostics: resolvedState.providerDiagnostics,
    });
    return { exitCode: 1 };
  }

  const planningResult = resolvePlannableCommand(
    resolvedState.providerRegistry,
    category,
    commandTokens,
  );
  if (planningResult.resolvedCommand === null) {
    if (planningResult.diagnostics.length > 0) {
      input.context.writeStderr(renderPlanningDiagnostics(planningResult.diagnostics));
      return { exitCode: 1 };
    }
    input.context.writeStderr(renderUnknownProviderCommand(category, commandTokens));
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
      parsedPlanRequest.format === 'json' ? renderCommandPlanJson(plan) : renderCommandPlan(plan),
    );
    return { exitCode: hasCommandPlanErrors(plan) ? 1 : 0 };
  } catch (error) {
    input.context.writeStderr(
      renderPlanningFailure(category, planningResult.resolvedCommand.command.path, error),
    );
    return { exitCode: 1 };
  }
}

/*** Dispatch a provider command after resolving its official package on demand. */
async function dispatchProviderCommand(input: {
  readonly context: AnkhCommandContext;
  readonly loadProviders: LoadProviderManifestsFn;
  readonly options: RunCliOptions;
  readonly providerRuntime: AnkhProviderRuntime;
  readonly tokens: readonly [string, ...string[]];
}): Promise<AnkhCliRunResult> {
  const [category, ...commandTokens] = input.tokens;
  const resolvedState = await resolveCategoryCliState(category, input);
  if (resolvedState === null) {
    input.context.writeStderr(renderUnknownCommand(input.tokens));
    return { exitCode: 1 };
  }
  if ('exitCode' in resolvedState) return resolvedState;

  const loadedProvider = resolvedState.providerRegistry.findByCategory(category);
  if (loadedProvider === null) {
    writeProviderUnavailable({
      category,
      context: input.context,
      discoveredPackage: resolvedState.discoveredPackage,
      providerDiagnostics: resolvedState.providerDiagnostics,
    });
    return { exitCode: 1 };
  }

  const executionResult = resolveExecutableCommand(
    resolvedState.providerRegistry,
    category,
    commandTokens,
  );
  if (executionResult.resolvedCommand === null) {
    if (executionResult.diagnostics.length > 0) {
      input.context.writeStderr(renderExecutionDiagnostics(executionResult.diagnostics));
      return { exitCode: 1 };
    }
    input.context.writeStderr(renderUnknownProviderCommand(category, commandTokens));
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
    return { exitCode: commandResult?.exitCode ?? 0 };
  } catch (error) {
    input.context.writeStderr(
      renderCommandExecutionFailure(category, executionResult.resolvedCommand.command.path, error),
    );
    return { exitCode: 1 };
  }
}

/*** Resolve one category from injected test state or the official remote catalog and package cache. */
async function resolveCategoryCliState(
  category: string,
  input: {
    readonly context: AnkhCommandContext;
    readonly loadProviders: LoadProviderManifestsFn;
    readonly options: RunCliOptions;
    readonly providerRuntime: AnkhProviderRuntime;
  },
): Promise<ResolvedCategoryCliState | AnkhCliRunResult | null> {
  const injectedState = resolveInjectedCliState(input.options);
  if (injectedState !== null) {
    const discoveredPackage = injectedState.packageRegistry.findByCategory(category);
    if (discoveredPackage === null) return null;
    const presentation = await readPackagePresentation(discoveredPackage.packageJsonPath);
    return {
      ...injectedState,
      description: presentation.description ?? discoveredPackage.packageName,
      discoveredPackage,
    };
  }

  if (input.options.discoverPackages !== undefined) {
    const resolvedState = await resolveExplicitDiscoveredCliState({
      context: input.context,
      discoverPackages: input.options.discoverPackages,
      loadProviders: input.loadProviders,
    });
    if ('exitCode' in resolvedState) return resolvedState;
    const discoveredPackage = resolvedState.packageRegistry.findByCategory(category);
    if (discoveredPackage === null) return null;
    const presentation = await readPackagePresentation(discoveredPackage.packageJsonPath);
    return {
      ...resolvedState,
      description: presentation.description ?? discoveredPackage.packageName,
      discoveredPackage,
    };
  }

  let entry: AnkhProviderCatalogEntry | undefined;
  try {
    const catalog = await input.providerRuntime.resolveCatalogAsync();
    entry = catalog.entries.find((candidate) => candidate.metadata.category === category);
  } catch (error) {
    input.context.writeStderr(renderProviderCatalogFailure(error));
    return { exitCode: 1 };
  }
  if (entry === undefined) return null;

  let discoveredPackage: AnkhDiscoveredPackage;
  try {
    discoveredPackage = await input.providerRuntime.resolvePackageAsync(entry);
  } catch (error) {
    input.context.writeStderr(
      renderProviderPackageResolutionFailure(category, entry.packageName, error),
    );
    return { exitCode: 1 };
  }

  try {
    const providerLoadResult = await input.loadProviders([discoveredPackage]);
    return {
      description: entry.description,
      discoveredPackage,
      packageRegistry: createPackageRegistry([discoveredPackage]),
      providerDiagnostics: providerLoadResult.diagnostics,
      providerRegistry: createProviderRegistry(providerLoadResult.providers),
    };
  } catch (error) {
    input.context.writeStderr(renderProviderLoadFailure(error));
    return { exitCode: 1 };
  }
}

/*** Resolve an explicitly injected package-discovery function without enabling cwd discovery by default. */
async function resolveExplicitDiscoveredCliState(input: {
  readonly context: AnkhCommandContext;
  readonly discoverPackages: DiscoverAnkhPackagesFn;
  readonly loadProviders: LoadProviderManifestsFn;
}): Promise<ResolvedCliState | AnkhCliRunResult> {
  let discoveryResult: AnkhMetadataDiscoveryResult;
  try {
    discoveryResult = await input.discoverPackages({ cwd: input.context.cwd });
  } catch (error) {
    input.context.writeStderr(renderDiscoveryFailure(error));
    return { exitCode: 1 };
  }

  const packageRegistry = createPackageRegistry(discoveryResult.packages);
  try {
    const providerLoadResult = await input.loadProviders(discoveryResult.packages);
    return {
      packageRegistry,
      providerDiagnostics: providerLoadResult.diagnostics,
      providerRegistry: createProviderRegistry(providerLoadResult.providers),
    };
  } catch (error) {
    input.context.writeStderr(renderProviderLoadFailure(error));
    return { exitCode: 1 };
  }
}

/*** Resolve explicitly injected package/provider registries used by deterministic callers and tests. */
function resolveInjectedCliState(options: RunCliOptions): ResolvedCliState | null {
  if (options.registry === undefined || options.providerRegistry === undefined) return null;
  return {
    packageRegistry: options.registry,
    providerRegistry: options.providerRegistry,
    providerDiagnostics: [],
  };
}

/*** Render provider diagnostics when a resolved package does not yield a usable provider. */
function writeProviderUnavailable(input: {
  readonly category: string;
  readonly context: AnkhCommandContext;
  readonly discoveredPackage: AnkhDiscoveredPackage;
  readonly providerDiagnostics: readonly AnkhProviderManifestDiagnostic[];
}): void {
  const providerDiagnostics = input.providerDiagnostics.filter(
    (diagnostic) =>
      diagnostic.packageName === input.discoveredPackage.packageName ||
      diagnostic.category === input.category,
  );
  if (providerDiagnostics.length > 0) {
    input.context.writeStderr(renderProviderManifestDiagnostics(providerDiagnostics));
    return;
  }
  input.context.writeStderr(
    renderCategoryProviderUnavailable(input.category, input.discoveredPackage.packageName),
  );
}

/*** Parse plan flags while preserving the provider command path. */
function parsePlanRequest(tokens: readonly string[]): ParsedPlanRequest | null {
  if (tokens.length < 1) return null;
  const commandTokens: string[] = [];
  let format: ParsedPlanRequest['format'] = 'human';
  for (const token of tokens) {
    if (token === '--json') {
      format = 'json';
      continue;
    }
    commandTokens.push(token);
  }
  return commandTokens.length >= 1 ? { commandTokens, format } : null;
}

/*** Render plan usage guidance. */
function renderPlanUsage(): string {
  return [
    'Usage: ankh plan <category> [command] [--json]',
    'Planning prints provider-declared command plans without executing them.',
    '',
  ].join('\n');
}

/*** Render the deferred run-command guidance. */
function renderRunDeferred(tokens: readonly string[]): string {
  const attempted = tokens.length === 0 ? '(missing)' : tokens.join(' ');
  return [
    `ankh run is deferred until command execution semantics are explicitly designed: ${attempted}`,
    'Use `ankh plan <category> [command]` to inspect provider plans first.',
    '',
  ].join('\n');
}

/*** Render an unexpected planning handler failure. */
function renderPlanningFailure(
  category: string,
  commandPath: readonly string[],
  error: unknown,
): string {
  return [
    `Ankh command planning failed for "${renderCommandName(
      category,
      commandPath,
    )}": ${getErrorMessage(error)}`,
    '',
  ].join('\n');
}

/*** Render a fully qualified command name. */
function renderCommandName(category: string, path: readonly string[]): string {
  return path.length === 0 ? category : `${category} ${path.join(' ')}`;
}

/*** Convert an unknown failure to a stable CLI message. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

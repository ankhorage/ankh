import type { AnkhCommandProviderManifest } from "@ankhorage/contracts/cli";

import type { AnkhCommandContext } from "./commandContext.js";
import type { AnkhPackageRegistry } from "./packageRegistry.js";
import type { AnkhLoadedProvider } from "./providerManifestLoader.js";
import type {
  AnkhCommandListing,
  AnkhProviderRegistry,
  AnkhResolvedProviderCommand,
} from "./providerRegistry.js";

export interface AnkhCommandExecutionContext extends AnkhCommandContext {
  readonly packageRegistry: AnkhPackageRegistry;
  readonly providerRegistry: AnkhProviderRegistry;
}

export interface AnkhCommandExecutionRequest {
  readonly argv: readonly string[];
  readonly command: AnkhCommandListing;
  readonly provider: AnkhLoadedProvider;
  readonly context: AnkhCommandExecutionContext;
}

export interface AnkhCommandExecutionResult {
  readonly exitCode: number;
}

export type AnkhCommandHandler = (
  request: AnkhCommandExecutionRequest,
) =>
  | void
  | AnkhCommandExecutionResult
  | Promise<void | AnkhCommandExecutionResult>;

export interface AnkhCommandHandlerBinding {
  readonly path: readonly [string, ...string[]];
  readonly handler: AnkhCommandHandler;
}

export interface AnkhRuntimeCommandProvider extends AnkhCommandProviderManifest {
  readonly handlers?: readonly AnkhCommandHandlerBinding[];
}

export interface AnkhCommandExecutionDiagnostic {
  readonly category?: string;
  readonly code: string;
  readonly message: string;
  readonly packageJsonPath: string;
  readonly packageName: string;
  readonly providerModulePath?: string;
  readonly severity: "error";
}

interface AnkhResolvedExecutableCommand extends AnkhResolvedProviderCommand {
  readonly handler: AnkhCommandHandler;
}

export interface ResolveExecutableCommandResult {
  readonly diagnostics: readonly AnkhCommandExecutionDiagnostic[];
  readonly resolvedCommand: AnkhResolvedExecutableCommand | null;
}

export function resolveExecutableCommand(
  providerRegistry: AnkhProviderRegistry,
  category: string,
  tokens: readonly string[],
): ResolveExecutableCommandResult {
  const categoryProviders = providerRegistry.findAllByCategory(category);
  if (categoryProviders.length > 1) {
    const [provider] = categoryProviders;

    if (provider === undefined) {
      return {
        diagnostics: [],
        resolvedCommand: null,
      };
    }

    return {
      diagnostics: [
        createExecutionDiagnostic(provider, {
          code: 'provider-duplicate-category',
          message: `More than one loaded provider declares the category "${category}", so direct dispatch is ambiguous.`,
        }),
      ],
      resolvedCommand: null,
    };
  }

  const resolvedCommand = providerRegistry.resolveCommand(category, tokens);
  if (resolvedCommand === null) {
    return {
      diagnostics: [],
      resolvedCommand: null,
    };
  }

  const handlerResult = validateProviderHandlers(resolvedCommand.provider);
  if (handlerResult.handlersByPath === null) {
    return {
      diagnostics: handlerResult.diagnostics,
      resolvedCommand: null,
    };
  }

  const handler = handlerResult.handlersByPath.get(
    getCommandPathKey(resolvedCommand.command.path),
  );

  if (handler === undefined) {
    return {
      diagnostics: [
        createExecutionDiagnostic(resolvedCommand.provider, {
          code: "provider-command-handler-missing",
          message: `Provider command "${resolvedCommand.command.path.join(
            " ",
          )}" does not have a handler binding.`,
        }),
      ],
      resolvedCommand: null,
    };
  }

  return {
    diagnostics: [],
    resolvedCommand: {
      ...resolvedCommand,
      handler,
    },
  };
}

interface ValidateProviderHandlersResult {
  readonly diagnostics: readonly AnkhCommandExecutionDiagnostic[];
  readonly handlersByPath: ReadonlyMap<string, AnkhCommandHandler> | null;
}

function validateProviderHandlers(
  provider: AnkhLoadedProvider,
): ValidateProviderHandlersResult {
  if (!isRecord(provider.providerModuleDefaultExport)) {
    return {
      diagnostics: [
        createExecutionDiagnostic(provider, {
          code: "provider-missing-command-handlers",
          message:
            "Provider module default export does not expose execution handlers.",
        }),
      ],
      handlersByPath: null,
    };
  }

  const rawHandlers = provider.providerModuleDefaultExport.handlers;
  if (rawHandlers === undefined) {
    return {
      diagnostics: [
        createExecutionDiagnostic(provider, {
          code: "provider-missing-command-handlers",
          message: "Provider does not define command handlers.",
        }),
      ],
      handlersByPath: null,
    };
  }

  if (!Array.isArray(rawHandlers)) {
    return {
      diagnostics: [
        createExecutionDiagnostic(provider, {
          code: "invalid-provider-command-handlers",
          message: 'Provider "handlers" must be an array when present.',
        }),
      ],
      handlersByPath: null,
    };
  }

  const diagnostics: AnkhCommandExecutionDiagnostic[] = [];
  const handlersByPath = new Map<string, AnkhCommandHandler>();
  const manifestCommandPaths = new Set(
    provider.manifest.commands.map((command) =>
      getCommandPathKey(command.path),
    ),
  );

  for (const rawHandlerBinding of rawHandlers) {
    if (!isRecord(rawHandlerBinding)) {
      diagnostics.push(
        createExecutionDiagnostic(provider, {
          code: "invalid-provider-command-handler",
          message: "Each provider command handler binding must be an object.",
        }),
      );
      continue;
    }

    const path = getCommandPath(rawHandlerBinding.path);
    if (path === null) {
      diagnostics.push(
        createExecutionDiagnostic(provider, {
          code: "invalid-provider-command-handler-path",
          message:
            'Each provider command handler "path" must be a non-empty array of non-empty strings.',
        }),
      );
      continue;
    }

    const pathKey = getCommandPathKey(path);
    if (!manifestCommandPaths.has(pathKey)) {
      diagnostics.push(
        createExecutionDiagnostic(provider, {
          code: "provider-command-handler-unknown-path",
          message: `Provider handler path "${path.join(
            " ",
          )}" does not match any manifest command path.`,
        }),
      );
      continue;
    }

    if (handlersByPath.has(pathKey)) {
      diagnostics.push(
        createExecutionDiagnostic(provider, {
          code: "provider-duplicate-command-handler-path",
          message: `Provider declares more than one handler for command path "${path.join(" ")}".`,
        }),
      );
      continue;
    }

    if (!isCommandHandler(rawHandlerBinding.handler)) {
      diagnostics.push(
        createExecutionDiagnostic(provider, {
          code: "provider-command-handler-not-function",
          message: `Provider handler for command path "${path.join(" ")}" must be a function.`,
        }),
      );
      continue;
    }

    handlersByPath.set(pathKey, rawHandlerBinding.handler);
  }

  for (const command of provider.manifest.commands) {
    const pathKey = getCommandPathKey(command.path);
    if (!handlersByPath.has(pathKey)) {
      diagnostics.push(
        createExecutionDiagnostic(provider, {
          code: "provider-command-handler-missing",
          message: `Provider command "${command.path.join(" ")}" does not have a handler binding.`,
        }),
      );
    }
  }

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      handlersByPath: null,
    };
  }

  return {
    diagnostics: [],
    handlersByPath,
  };
}

function createExecutionDiagnostic(
  provider: AnkhLoadedProvider,
  diagnostic: {
    readonly code: string;
    readonly message: string;
  },
): AnkhCommandExecutionDiagnostic {
  return {
    category: provider.manifest.category,
    code: diagnostic.code,
    message: diagnostic.message,
    packageJsonPath: provider.discoveredPackage.packageJsonPath,
    packageName: provider.discoveredPackage.packageName,
    providerModulePath: provider.providerModulePath,
    severity: "error",
  };
}

function getCommandPath(value: unknown): readonly [string, ...string[]] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const segment of value) {
    if (typeof segment !== "string" || segment.trim().length === 0) {
      return null;
    }
    parts.push(segment);
  }

  const [head, ...rest] = parts;
  if (head === undefined) {
    return null;
  }

  return [head, ...rest];
}

function getCommandPathKey(path: readonly string[]): string {
  return path.join("\0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommandHandler(value: unknown): value is AnkhCommandHandler {
  return typeof value === "function";
}

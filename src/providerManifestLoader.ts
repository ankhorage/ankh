import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  AnkhCapabilityId,
  AnkhCommandDescriptor,
  AnkhCommandProviderManifest,
} from '@ankhorage/contracts/cli';

import type { AnkhDiscoveredPackage } from './discovery.js';

export interface AnkhProviderManifestDiagnostic {
  readonly category?: string;
  readonly code: string;
  readonly message: string;
  readonly packageJsonPath: string;
  readonly packageName: string;
  readonly providerModulePath?: string;
  readonly severity: 'warning' | 'error';
}

export interface AnkhLoadedProvider {
  readonly discoveredPackage: AnkhDiscoveredPackage;
  readonly manifest: AnkhCommandProviderManifest;
  readonly providerModulePath: string;
  readonly providerModuleUrl: string;
}

export interface LoadProviderManifestsResult {
  readonly diagnostics: readonly AnkhProviderManifestDiagnostic[];
  readonly providers: readonly AnkhLoadedProvider[];
}

export async function loadProviderManifests(
  packages: readonly AnkhDiscoveredPackage[],
): Promise<LoadProviderManifestsResult> {
  const diagnostics: AnkhProviderManifestDiagnostic[] = [];
  const providers: AnkhLoadedProvider[] = [];

  for (const discoveredPackage of packages) {
    if (discoveredPackage.metadata.provider === null) {
      continue;
    }

    const providerModulePath = path.resolve(
      discoveredPackage.packageRoot,
      discoveredPackage.metadata.provider,
    );
    const providerModuleUrl = pathToFileURL(providerModulePath).href;

    let importedModule: unknown;
    try {
      importedModule = await import(providerModuleUrl);
    } catch (error) {
      diagnostics.push(
        createDiagnostic(discoveredPackage, {
          code: 'provider-import-failed',
          message: `Could not import provider manifest module: ${getErrorMessage(error)}`,
          providerModulePath,
          severity: 'error',
        }),
      );
      continue;
    }

    if (!isRecord(importedModule) || !('default' in importedModule)) {
      diagnostics.push(
        createDiagnostic(discoveredPackage, {
          code: 'missing-provider-default-export',
          message:
            'Provider manifest module must default-export an AnkhCommandProviderManifest object.',
          providerModulePath,
          severity: 'error',
        }),
      );
      continue;
    }

    const validationResult = validateProviderManifest({
      discoveredPackage,
      providerModulePath,
      rawManifest: importedModule.default,
      providerModuleUrl,
    });

    diagnostics.push(...validationResult.diagnostics);
    if (validationResult.provider !== null) {
      providers.push(validationResult.provider);
    }
  }

  return {
    diagnostics,
    providers,
  };
}

interface ValidateProviderManifestOptions {
  readonly discoveredPackage: AnkhDiscoveredPackage;
  readonly providerModulePath: string;
  readonly providerModuleUrl: string;
  readonly rawManifest: unknown;
}

interface ValidateProviderManifestResult {
  readonly diagnostics: readonly AnkhProviderManifestDiagnostic[];
  readonly provider: AnkhLoadedProvider | null;
}

function validateProviderManifest(
  options: ValidateProviderManifestOptions,
): ValidateProviderManifestResult {
  const diagnostics: AnkhProviderManifestDiagnostic[] = [];

  if (!isRecord(options.rawManifest)) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        code: 'invalid-provider-manifest',
        message: 'Provider manifest default export must be a JSON-like object.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );

    return {
      diagnostics,
      provider: null,
    };
  }

  const rawId = options.rawManifest.id;
  const id = getNonEmptyString(rawId);
  if (id === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        code: 'invalid-provider-id',
        message: 'Provider manifest "id" must be a non-empty string.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const rawCategory = options.rawManifest.category;
  const category = getNonEmptyString(rawCategory);
  if (category === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        code: 'invalid-provider-category',
        message: 'Provider manifest "category" must be a non-empty string.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  } else if (category !== options.discoveredPackage.metadata.category) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category,
        code: 'provider-category-mismatch',
        message: `Provider manifest category "${category}" does not match package metadata category "${options.discoveredPackage.metadata.category}".`,
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const rawVersion = options.rawManifest.version;
  const version = getNonEmptyString(rawVersion);
  if (version === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category: category ?? undefined,
        code: 'invalid-provider-version',
        message: 'Provider manifest "version" must be a non-empty string.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const capabilityResult = validateCapabilities({
    discoveredPackage: options.discoveredPackage,
    providerModulePath: options.providerModulePath,
    rawCapabilities: options.rawManifest.capabilities,
    category,
  });
  diagnostics.push(...capabilityResult.diagnostics);

  const commandResult = validateCommands({
    discoveredPackage: options.discoveredPackage,
    providerModulePath: options.providerModulePath,
    rawCommands: options.rawManifest.commands,
    category,
  });
  diagnostics.push(...commandResult.diagnostics);

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      diagnostics,
      provider: null,
    };
  }

  if (id === null || category === null || version === null) {
    return {
      diagnostics,
      provider: null,
    };
  }

  return {
    diagnostics,
    provider: {
      discoveredPackage: options.discoveredPackage,
      manifest: {
        id,
        category,
        version,
        capabilities: capabilityResult.capabilities,
        commands: commandResult.commands,
      },
      providerModulePath: options.providerModulePath,
      providerModuleUrl: options.providerModuleUrl,
    },
  };
}

interface ValidateCapabilitiesOptions {
  readonly category: string | null;
  readonly discoveredPackage: AnkhDiscoveredPackage;
  readonly providerModulePath: string;
  readonly rawCapabilities: unknown;
}

interface ValidateCapabilitiesResult {
  readonly capabilities: readonly AnkhCapabilityId[];
  readonly diagnostics: readonly AnkhProviderManifestDiagnostic[];
}

function validateCapabilities(options: ValidateCapabilitiesOptions): ValidateCapabilitiesResult {
  if (!Array.isArray(options.rawCapabilities)) {
    return {
      capabilities: [],
      diagnostics: [
        createDiagnostic(options.discoveredPackage, {
          category: options.category ?? undefined,
          code: 'invalid-provider-capabilities',
          message:
            'Provider manifest "capabilities" must be an array of dot-separated string identifiers.',
          providerModulePath: options.providerModulePath,
          severity: 'error',
        }),
      ],
    };
  }

  const diagnostics: AnkhProviderManifestDiagnostic[] = [];
  const capabilities: AnkhCapabilityId[] = [];
  const metadataCapabilities = new Set(options.discoveredPackage.metadata.capabilities);

  for (const rawCapability of options.rawCapabilities) {
    if (typeof rawCapability !== 'string' || !isCapabilityId(rawCapability)) {
      diagnostics.push(
        createDiagnostic(options.discoveredPackage, {
          category: options.category ?? undefined,
          code: 'invalid-provider-capabilities',
          message:
            'Provider manifest "capabilities" must contain dot-separated string identifiers.',
          providerModulePath: options.providerModulePath,
          severity: 'error',
        }),
      );
      return {
        capabilities: [],
        diagnostics,
      };
    }

    if (!metadataCapabilities.has(rawCapability)) {
      diagnostics.push(
        createDiagnostic(options.discoveredPackage, {
          category: options.category ?? rawCapability.split('.')[0],
          code: 'provider-capability-not-declared',
          message: `Provider manifest capability "${rawCapability}" is not declared in package.json ankh.capabilities.`,
          providerModulePath: options.providerModulePath,
          severity: 'error',
        }),
      );
      continue;
    }

    capabilities.push(rawCapability);
  }

  return {
    capabilities,
    diagnostics,
  };
}

interface ValidateCommandsOptions {
  readonly category: string | null;
  readonly discoveredPackage: AnkhDiscoveredPackage;
  readonly providerModulePath: string;
  readonly rawCommands: unknown;
}

interface ValidateCommandsResult {
  readonly commands: readonly AnkhCommandDescriptor[];
  readonly diagnostics: readonly AnkhProviderManifestDiagnostic[];
}

function validateCommands(options: ValidateCommandsOptions): ValidateCommandsResult {
  if (!Array.isArray(options.rawCommands)) {
    return {
      commands: [],
      diagnostics: [
        createDiagnostic(options.discoveredPackage, {
          category: options.category ?? undefined,
          code: 'invalid-provider-commands',
          message: 'Provider manifest "commands" must be an array.',
          providerModulePath: options.providerModulePath,
          severity: 'error',
        }),
      ],
    };
  }

  const diagnostics: AnkhProviderManifestDiagnostic[] = [];
  const commands: AnkhCommandDescriptor[] = [];

  for (const rawCommand of options.rawCommands) {
    const commandResult = validateCommand({
      category: options.category,
      discoveredPackage: options.discoveredPackage,
      providerModulePath: options.providerModulePath,
      rawCommand,
    });
    diagnostics.push(...commandResult.diagnostics);

    if (commandResult.command !== null) {
      commands.push(commandResult.command);
    }
  }

  return {
    commands,
    diagnostics,
  };
}

interface ValidateCommandOptions {
  readonly category: string | null;
  readonly discoveredPackage: AnkhDiscoveredPackage;
  readonly providerModulePath: string;
  readonly rawCommand: unknown;
}

interface ValidateCommandResult {
  readonly command: AnkhCommandDescriptor | null;
  readonly diagnostics: readonly AnkhProviderManifestDiagnostic[];
}

function validateCommand(options: ValidateCommandOptions): ValidateCommandResult {
  if (!isRecord(options.rawCommand)) {
    return {
      command: null,
      diagnostics: [
        createDiagnostic(options.discoveredPackage, {
          category: options.category ?? undefined,
          code: 'invalid-provider-command',
          message: 'Each provider manifest command must be an object.',
          providerModulePath: options.providerModulePath,
          severity: 'error',
        }),
      ],
    };
  }

  const diagnostics: AnkhProviderManifestDiagnostic[] = [];

  const pathValue = getCommandPath(options.rawCommand.path);
  if (pathValue === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category: options.category ?? undefined,
        code: 'invalid-provider-command-path',
        message:
          'Each provider manifest command "path" must be a non-empty array of non-empty strings.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const capabilityValue = getCapabilityId(options.rawCommand.capability);
  if (capabilityValue === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category: options.category ?? undefined,
        code: 'invalid-provider-command-capability',
        message:
          'Each provider manifest command "capability" must be a dot-separated string identifier.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const summary = getNonEmptyString(options.rawCommand.summary);
  if (summary === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category: options.category ?? capabilityValue?.split('.')[0],
        code: 'invalid-provider-command-summary',
        message: 'Each provider manifest command "summary" must be a non-empty string.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const aliases = getOptionalStringArray(options.rawCommand.aliases);
  if (aliases === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category: options.category ?? undefined,
        code: 'invalid-provider-command-aliases',
        message:
          'Each provider manifest command "aliases" must be an array of non-empty strings when present.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  const examples = getOptionalStringArray(options.rawCommand.examples);
  if (examples === null) {
    diagnostics.push(
      createDiagnostic(options.discoveredPackage, {
        category: options.category ?? undefined,
        code: 'invalid-provider-command-examples',
        message:
          'Each provider manifest command "examples" must be an array of non-empty strings when present.',
        providerModulePath: options.providerModulePath,
        severity: 'error',
      }),
    );
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      command: null,
      diagnostics,
    };
  }

  if (
    pathValue === null ||
    capabilityValue === null ||
    summary === null ||
    aliases === null ||
    examples === null
  ) {
    return {
      command: null,
      diagnostics,
    };
  }

  return {
    command: {
      path: pathValue,
      capability: capabilityValue,
      summary,
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(examples.length > 0 ? { examples } : {}),
    },
    diagnostics,
  };
}

function getCommandPath(value: unknown): readonly [string, ...string[]] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const segment of value) {
    const parsedSegment = getNonEmptyString(segment);
    if (parsedSegment === null) {
      return null;
    }
    parts.push(parsedSegment);
  }

  const [head, ...rest] = parts;
  if (head === undefined) {
    return null;
  }

  return [head, ...rest];
}

function getCapabilityId(value: unknown): AnkhCapabilityId | null {
  return typeof value === 'string' && isCapabilityId(value) ? value : null;
}

function getOptionalStringArray(value: unknown): readonly string[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const entries: string[] = [];
  for (const item of value) {
    const entry = getNonEmptyString(item);
    if (entry === null) {
      return null;
    }
    entries.push(entry);
  }

  return entries;
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function isCapabilityId(value: string): value is AnkhCapabilityId {
  const segments = value.split('.');
  return segments.length >= 2 && segments.every((segment) => segment.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

interface CreateDiagnosticInput {
  readonly category?: string;
  readonly code: string;
  readonly message: string;
  readonly providerModulePath?: string;
  readonly severity: 'warning' | 'error';
}

function createDiagnostic(
  discoveredPackage: AnkhDiscoveredPackage,
  input: CreateDiagnosticInput,
): AnkhProviderManifestDiagnostic {
  return {
    category: input.category ?? discoveredPackage.metadata.category,
    code: input.code,
    message: input.message,
    packageJsonPath: discoveredPackage.packageJsonPath,
    packageName: discoveredPackage.packageName,
    providerModulePath: input.providerModulePath,
    severity: input.severity,
  };
}

import type { AnkhDiscoveredPackage, AnkhMetadataDiscoveryDiagnostic } from './discovery.js';
import type { AnkhCommandExecutionDiagnostic } from './execution.js';
import type { AnkhProviderManifestDiagnostic } from './providerManifestLoader.js';
import type { AnkhProviderRegistry } from './providerRegistry.js';

export function renderRootHelp(): string {
  return [
    'Ankh CLI',
    '',
    'Usage:',
    '  ankh <command>',
    '',
    'Built-ins:',
    '  help       Show this help',
    '  version    Show the CLI version',
    '  commands   List discovered Ankh packages and loaded provider commands',
    '',
    'Try:',
    '  ankh commands',
    '  ankh <category> --help',
    '  ankh --help',
    '',
  ].join('\n');
}

export function renderCommands(
  packages: readonly AnkhDiscoveredPackage[],
  providerRegistry: AnkhProviderRegistry,
): string {
  if (packages.length === 0) {
    return 'No Ankh command providers are registered yet.\n';
  }

  const lines = ['Discovered Ankh packages:', ''];

  for (const discoveredPackage of packages) {
    lines.push(`  ${discoveredPackage.packageName}`);
    lines.push(`    category: ${discoveredPackage.metadata.category}`);
    lines.push(`    provider: ${discoveredPackage.metadata.provider ?? 'none'}`);
    lines.push('    capabilities:');

    if (discoveredPackage.metadata.capabilities.length === 0) {
      lines.push('      - none');
    } else {
      for (const capability of discoveredPackage.metadata.capabilities) {
        lines.push(`      - ${capability}`);
      }
    }

    const loadedProvider = providerRegistry
      .listProviders()
      .find((provider) => provider.discoveredPackage.packageName === discoveredPackage.packageName);

    if (loadedProvider !== undefined) {
      lines.push('    commands:');

      if (loadedProvider.manifest.commands.length === 0) {
        lines.push('      - none');
      } else {
        for (const command of loadedProvider.manifest.commands) {
          lines.push(`      - ${command.path.join(' ')}`);
          lines.push(`        capability: ${command.capability}`);
          lines.push(`        summary: ${command.summary}`);

          if (command.aliases !== undefined && command.aliases.length > 0) {
            lines.push(`        aliases: ${command.aliases.join(', ')}`);
          }

          if (command.examples !== undefined && command.examples.length > 0) {
            lines.push('        examples:');
            for (const example of command.examples) {
              lines.push(`          - ${example}`);
            }
          }
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function renderCategoryHelp(
  category: string,
  providerRegistry: AnkhProviderRegistry,
): string {
  const provider = providerRegistry.findByCategory(category);
  if (provider === null) {
    return '';
  }

  const lines = [
    `Ankh category: ${provider.manifest.category}`,
    '',
    `Package: ${provider.discoveredPackage.packageName}`,
    `Provider: ${provider.discoveredPackage.metadata.provider ?? 'none'}`,
    `Version: ${provider.manifest.version}`,
    '',
    'Commands:',
  ];

  if (provider.manifest.commands.length === 0) {
    lines.push('  none', '');
    return lines.join('\n');
  }

  for (const command of provider.manifest.commands) {
    lines.push(`  ${provider.manifest.category} ${command.path.join(' ')}`);
    lines.push(`    capability: ${command.capability}`);
    lines.push(`    summary: ${command.summary}`);

    if (command.aliases !== undefined && command.aliases.length > 0) {
      lines.push(`    aliases: ${command.aliases.join(', ')}`);
    }

    if (command.examples !== undefined && command.examples.length > 0) {
      lines.push('    examples:');
      for (const example of command.examples) {
        lines.push(`      - ${example}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function renderMetadataDiscoveryDiagnostics(
  diagnostics: readonly AnkhMetadataDiscoveryDiagnostic[],
): string {
  return renderDiagnostics('Ankh metadata discovery diagnostics:', diagnostics);
}

export function renderProviderManifestDiagnostics(
  diagnostics: readonly AnkhProviderManifestDiagnostic[],
): string {
  return renderDiagnostics('Ankh provider manifest diagnostics:', diagnostics);
}

export function renderExecutionDiagnostics(
  diagnostics: readonly AnkhCommandExecutionDiagnostic[],
): string {
  return renderDiagnostics('Ankh command execution diagnostics:', diagnostics);
}

export function renderCategoryProviderUnavailable(category: string, packageName: string): string {
  return [
    `Ankh category "${category}" in ${packageName} does not have a valid provider manifest.`,
    '',
  ].join('\n');
}

export function renderDiscoveryFailure(error: unknown): string {
  return [
    `Ankh package metadata discovery failed unexpectedly: ${getErrorMessage(error)}`,
    '',
  ].join('\n');
}

export function renderProviderLoadFailure(error: unknown): string {
  return [`Ankh provider manifest loading failed unexpectedly: ${getErrorMessage(error)}`, ''].join(
    '\n',
  );
}

export function renderUnknownCategory(category: string): string {
  return [`Unknown Ankh category: ${category}`, 'Try:', '  ankh commands', ''].join('\n');
}

export function renderUnknownCommand(tokens: readonly string[]): string {
  return [
    `Unknown Ankh command: ${tokens.join(' ')}`,
    'Try:',
    '  ankh commands',
    '  ankh --help',
    '',
  ].join('\n');
}

export function renderUnknownProviderCommand(category: string, tokens: readonly string[]): string {
  const attemptedCommand = tokens.length > 0 ? tokens.join(' ') : '(missing)';

  return [
    `Unknown Ankh command for category "${category}": ${attemptedCommand}`,
    'Try:',
    `  ankh ${category} --help`,
    '',
  ].join('\n');
}

export function renderCommandExecutionFailure(
  category: string,
  commandPath: readonly string[],
  error: unknown,
): string {
  return [
    `Ankh command execution failed for "${category} ${commandPath.join(
      ' ',
    )}": ${getErrorMessage(error)}`,
    '',
  ].join('\n');
}

function renderDiagnostics(
  header: string,
  diagnostics: readonly (
    | AnkhCommandExecutionDiagnostic
    | AnkhMetadataDiscoveryDiagnostic
    | AnkhProviderManifestDiagnostic
  )[],
): string {
  if (diagnostics.length === 0) {
    return '';
  }

  const lines = [header, ''];

  for (const diagnostic of diagnostics) {
    const scopeParts = [
      'category' in diagnostic ? diagnostic.category : undefined,
      diagnostic.packageName,
      diagnostic.packageJsonPath,
      'source' in diagnostic ? diagnostic.source : undefined,
      'providerModulePath' in diagnostic ? diagnostic.providerModulePath : undefined,
    ].filter((part): part is string => part !== undefined);
    const scope = scopeParts.length === 0 ? '' : ` (${scopeParts.join(' | ')})`;

    lines.push(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${scope}`);
  }

  lines.push('');
  return lines.join('\n');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

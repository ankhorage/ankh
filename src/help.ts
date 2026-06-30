import type { AnkhDiscoveredPackage, AnkhMetadataDiscoveryDiagnostic } from './discovery.js';

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
    '  commands   List discovered Ankh package metadata',
    '',
    'Try:',
    '  ankh commands',
    '  ankh --help',
    '',
  ].join('\n');
}

export function renderCommands(packages: readonly AnkhDiscoveredPackage[]): string {
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

    lines.push('');
  }
  return lines.join('\n');
}

export function renderMetadataDiscoveryDiagnostics(
  diagnostics: readonly AnkhMetadataDiscoveryDiagnostic[],
): string {
  if (diagnostics.length === 0) {
    return '';
  }

  const lines = ['Ankh metadata discovery diagnostics:', ''];

  for (const diagnostic of diagnostics) {
    const scopeParts = [
      diagnostic.packageName,
      diagnostic.packageJsonPath,
      diagnostic.source,
    ].filter((part): part is string => part !== undefined);
    const scope = scopeParts.length === 0 ? '' : ` (${scopeParts.join(' | ')})`;

    lines.push(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${scope}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function renderDiscoveryFailure(error: unknown): string {
  return [
    `Ankh package metadata discovery failed unexpectedly: ${getErrorMessage(error)}`,
    '',
  ].join('\n');
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

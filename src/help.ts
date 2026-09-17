import type { AnkhCommandExecutionDiagnostic } from './execution.js';
import type { AnkhProviderManifestDiagnostic } from './providerManifestLoader.js';
import type { AnkhCommandListing, AnkhProviderRegistry } from './providerRegistry.js';

const ANKH_REPOSITORY_URL = 'https://github.com/ankhorage/ankh';

interface AnkhRootHelpCommand {
  readonly command: string;
  readonly packageName: string;
  readonly repositoryUrl: string | null;
}

/***
 * Render the root CLI help as the available top-level commands and their repository links.
 */
export function renderRootHelp(commands: readonly AnkhRootHelpCommand[]): string {
  const commandRows = commands
    .map((command) => ({
      command: command.command,
      description: command.repositoryUrl ?? getDefaultRepositoryUrl(command.packageName),
    }))
    .concat({
      command: 'plan',
      description: ANKH_REPOSITORY_URL,
    })
    .sort((left, right) => left.command.localeCompare(right.command));

  return [
    'Usage:',
    '',
    '  ankh <command>',
    '',
    'Commands:',
    '',
    ...renderCommandRows(commandRows),
    '',
  ].join('\n');
}

/***
 * Render package-level help with its package description and complete command list.
 */
export function renderCategoryHelp(
  category: string,
  providerRegistry: AnkhProviderRegistry,
  description: string,
): string {
  const provider = providerRegistry.findByCategory(category);
  if (provider === null) {
    return '';
  }

  const hasRootCommand = provider.manifest.commands.some((command) => command.path.length === 0);
  const hasNestedCommand = provider.manifest.commands.some((command) => command.path.length > 0);
  const usage = [
    ...(hasRootCommand ? [`  ankh ${category}`] : []),
    ...(hasNestedCommand ? [`  ankh ${category} <command>`] : []),
  ];
  const commandRows = provider.manifest.commands
    .map((command) => ({
      command: command.path.length === 0 ? category : command.path.join(' '),
      description: command.summary,
    }))
    .sort((left, right) => left.command.localeCompare(right.command));

  return [
    description,
    '',
    'Usage:',
    '',
    ...usage,
    '',
    'Commands:',
    '',
    ...(commandRows.length === 0 ? ['  none'] : renderCommandRows(commandRows)),
    '',
    `Run \`ankh ${category} <command> --help\` for command help.`,
    '',
  ].join('\n');
}

/***
 * Render help for one provider command without exposing capability metadata.
 */
export function renderCommandHelp(category: string, command: AnkhCommandListing): string {
  const fullCommand = renderFullCommandPath(category, command.path);
  const aliases =
    command.aliases?.map((alias) => `  ankh ${category} ${alias} [args...]`) ?? [];
  const examples = command.examples?.map((example) => `  ${example}`) ?? [];

  return [
    command.summary,
    '',
    'Usage:',
    '',
    `  ankh ${fullCommand} [args...]`,
    ...(aliases.length > 0 ? ['', 'Aliases:', '', ...aliases] : []),
    ...(examples.length > 0 ? ['', 'Examples:', '', ...examples] : []),
    '',
  ].join('\n');
}

/***
 * Render provider manifest diagnostics.
 */
export function renderProviderManifestDiagnostics(
  diagnostics: readonly AnkhProviderManifestDiagnostic[],
): string {
  return renderDiagnostics('Ankh provider manifest diagnostics:', diagnostics);
}

/***
 * Render command execution diagnostics.
 */
export function renderExecutionDiagnostics(
  diagnostics: readonly AnkhCommandExecutionDiagnostic[],
): string {
  return renderDiagnostics('Ankh command execution diagnostics:', diagnostics);
}

/***
 * Render an unavailable provider message.
 */
export function renderCategoryProviderUnavailable(category: string, packageName: string): string {
  return [
    `Ankh category "${category}" in ${packageName} does not have a valid provider manifest.`,
    '',
  ].join('\n');
}

/***
 * Render an unexpected package discovery failure.
 */
export function renderDiscoveryFailure(error: unknown): string {
  return [
    `Ankh package metadata discovery failed unexpectedly: ${getErrorMessage(error)}`,
    '',
  ].join('\n');
}

/***
 * Render an unexpected provider loading failure.
 */
export function renderProviderLoadFailure(error: unknown): string {
  return [`Ankh provider manifest loading failed unexpectedly: ${getErrorMessage(error)}`, ''].join(
    '\n',
  );
}

/***
 * Render an unknown category message.
 */
export function renderUnknownCategory(category: string): string {
  return [`Unknown Ankh category: ${category}`, 'Try:', '  ankh --help', ''].join('\n');
}

/***
 * Render an unknown root command message.
 */
export function renderUnknownCommand(tokens: readonly string[]): string {
  return [`Unknown Ankh command: ${tokens.join(' ')}`, 'Try:', '  ankh --help', ''].join('\n');
}

/***
 * Render an unknown provider command message.
 */
export function renderUnknownProviderCommand(category: string, tokens: readonly string[]): string {
  const attemptedCommand = tokens.length > 0 ? tokens.join(' ') : '(missing)';

  return [
    `Unknown Ankh command for category "${category}": ${attemptedCommand}`,
    'Try:',
    `  ankh ${category} --help`,
    '',
  ].join('\n');
}

/***
 * Render a provider command execution failure.
 */
export function renderCommandExecutionFailure(
  category: string,
  commandPath: readonly string[],
  error: unknown,
): string {
  return [
    `Ankh command execution failed for "${renderFullCommandPath(
      category,
      commandPath,
    )}": ${getErrorMessage(error)}`,
    '',
  ].join('\n');
}

/***
 * Render a diagnostic collection with a shared heading.
 */
function renderDiagnostics(
  header: string,
  diagnostics: readonly (AnkhCommandExecutionDiagnostic | AnkhProviderManifestDiagnostic)[],
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
      'providerModulePath' in diagnostic ? diagnostic.providerModulePath : undefined,
    ].filter((part): part is string => part !== undefined);
    const scope = scopeParts.length === 0 ? '' : ` (${scopeParts.join(' | ')})`;

    lines.push(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${scope}`);
  }

  lines.push('');
  return lines.join('\n');
}

/***
 * Render aligned CLI command rows.
 */
function renderCommandRows(
  rows: readonly { readonly command: string; readonly description: string }[],
): readonly string[] {
  if (rows.length === 0) {
    return ['  none'];
  }

  const commandWidth = Math.max(...rows.map((row) => row.command.length));
  return rows.map((row) => `  ${row.command.padEnd(commandWidth + 2)}${row.description}`);
}

/***
 * Derive the canonical GitHub repository URL for an Ankhorage package.
 */
function getDefaultRepositoryUrl(packageName: string): string {
  const repositoryName = packageName.replace(/^@ankhorage\//, '');
  return `https://github.com/ankhorage/${repositoryName}`;
}

/***
 * Render a fully qualified provider command path.
 */
function renderFullCommandPath(category: string, path: readonly string[]): string {
  return path.length === 0 ? category : `${category} ${path.join(' ')}`;
}

/***
 * Convert an unknown error to its CLI message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

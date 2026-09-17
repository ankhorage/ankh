export type ParsedCliRequest =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'category-help'; readonly category: string }
  | { readonly kind: 'plan'; readonly tokens: readonly string[] }
  | { readonly kind: 'run'; readonly tokens: readonly string[] }
  | {
      readonly kind: 'dispatch';
      readonly tokens: readonly [string, ...string[]];
    };

const HELP_TOKENS = new Set(['--help', '-h', 'help']);
const VERSION_TOKENS = new Set(['--version', '-v']);

/***
 * Return whether a token requests conventional CLI help.
 */
export function isHelpToken(value: string): boolean {
  return HELP_TOKENS.has(value);
}

/**
 * Parse only top-level Ankh bootstrap commands.
 */
export function parseArgv(argv: readonly string[]): ParsedCliRequest {
  const [firstToken, ...restTokens] = argv;

  if (firstToken === undefined) {
    return { kind: 'help' };
  }

  if (isHelpToken(firstToken)) {
    return { kind: 'help' };
  }

  if (VERSION_TOKENS.has(firstToken)) {
    return { kind: 'version' };
  }

  if (firstToken === 'plan') {
    return { kind: 'plan', tokens: restTokens };
  }

  if (firstToken === 'run') {
    return { kind: 'run', tokens: restTokens };
  }

  if (restTokens.length === 1 && isHelpToken(restTokens[0] ?? '')) {
    return {
      kind: 'category-help',
      category: firstToken,
    };
  }

  return {
    kind: 'dispatch',
    tokens: [firstToken, ...restTokens],
  };
}

export type ParsedCliRequest =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "commands" }
  | { readonly kind: "category-help"; readonly category: string }
  | {
      readonly kind: "dispatch";
      readonly tokens: readonly [string, ...string[]];
    };

const HELP_TOKENS = new Set(["--help", "-h", "help"]);
const VERSION_TOKENS = new Set(["--version", "-v"]);

/**
 * Parse only top-level Ankh bootstrap commands.
 */
export function parseArgv(argv: readonly string[]): ParsedCliRequest {
  const [firstToken, ...restTokens] = argv;

  if (firstToken === undefined) {
    return { kind: "help" };
  }

  if (HELP_TOKENS.has(firstToken)) {
    return { kind: "help" };
  }

  if (VERSION_TOKENS.has(firstToken)) {
    return { kind: "version" };
  }

  if (firstToken === "commands") {
    return { kind: "commands" };
  }

  if (restTokens.length === 1 && HELP_TOKENS.has(restTokens[0] ?? "")) {
    return {
      kind: "category-help",
      category: firstToken,
    };
  }

  return {
    kind: "dispatch",
    tokens: [firstToken, ...restTokens],
  };
}

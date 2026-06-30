import type { AnkhCommandListing } from "./providerRegistry.js";

export function renderRootHelp(): string {
  return [
    "Ankh CLI",
    "",
    "Usage:",
    "  ankh <command>",
    "",
    "Built-ins:",
    "  help       Show this help",
    "  version    Show the CLI version",
    "  commands   List registered command providers",
    "",
    "Try:",
    "  ankh commands",
    "  ankh --help",
    "",
  ].join("\n");
}

export function renderCommands(
  listings: readonly AnkhCommandListing[],
): string {
  if (listings.length === 0) {
    return "No Ankh command providers are registered yet.\n";
  }

  const lines = ["Registered Ankh commands:", ""];
  for (const listing of listings) {
    lines.push(
      `  ${listing.category} ${listing.path.join(" ")}  ${listing.summary} [${listing.capability}] (${listing.providerId})`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderUnknownCommand(tokens: readonly string[]): string {
  return [
    `Unknown Ankh command: ${tokens.join(" ")}`,
    "Try:",
    "  ankh commands",
    "  ankh --help",
    "",
  ].join("\n");
}

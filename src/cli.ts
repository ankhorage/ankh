import type { AnkhCliRunResult, AnkhCommandContext } from "./commandContext.js";
import { createDefaultCommandContext } from "./commandContext.js";
import {
  renderCommands,
  renderRootHelp,
  renderUnknownCommand,
} from "./help.js";
import { parseArgv } from "./parser.js";
import type { AnkhProviderRegistry } from "./providerRegistry.js";
import { createProviderRegistry } from "./providerRegistry.js";

export interface RunCliOptions {
  readonly context?: AnkhCommandContext;
  readonly registry?: AnkhProviderRegistry;
}

/**
 * Run the root CLI bootstrap shell without exiting the process.
 */
export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<AnkhCliRunResult> {
  const context = options.context ?? createDefaultCommandContext();
  const registry = options.registry ?? createProviderRegistry();
  const request = await Promise.resolve(parseArgv(argv));

  switch (request.kind) {
    case "help":
      context.writeStdout(renderRootHelp());
      return { exitCode: 0 };
    case "version":
      context.writeStdout(`${context.version}\n`);
      return { exitCode: 0 };
    case "commands":
      context.writeStdout(renderCommands(registry.listCommands()));
      return { exitCode: 0 };
    case "dispatch":
      context.writeStderr(renderUnknownCommand(request.tokens));
      return { exitCode: 1 };
  }
}

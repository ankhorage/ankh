import packageJson from "../package.json";

export interface AnkhCommandContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly version: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export interface AnkhCliRunResult {
  readonly exitCode: number;
}

/**
 * Create the default process-backed command context for the CLI shell.
 */
export function createDefaultCommandContext(): AnkhCommandContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    version: packageJson.version,
    writeStdout(text: string) {
      process.stdout.write(text);
    },
    writeStderr(text: string) {
      process.stderr.write(text);
    },
  };
}

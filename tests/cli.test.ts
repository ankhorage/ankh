import type {
  AnkhCommandProviderManifest,
  AnkhPackageMetadata,
} from "@ankhorage/contracts/cli";
import { describe, expect, it } from "bun:test";

import packageJson from "../package.json";
import { runCli } from "../src/cli.js";
import type { AnkhCommandContext } from "../src/commandContext.js";
import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryDiagnostic,
} from "../src/discovery.js";
import type {
  AnkhCommandExecutionRequest,
  AnkhRuntimeCommandProvider,
} from "../src/execution.js";
import type {
  AnkhLoadedProvider,
  AnkhProviderManifestDiagnostic,
} from "../src/providerManifestLoader.js";

const FORBIDDEN_CATEGORY_NAMES = [
  "studio",
  "board",
  "doctor",
  "dev",
  "runtime",
  "templates",
  "orchestrator",
];

const contractsMetadata = {
  capabilities: ["contracts.cli"],
  category: "contracts",
  provider: null,
} as const satisfies AnkhPackageMetadata;

const infraMetadata = {
  capabilities: ["infra.up", "infra.status", "infra.down"],
  category: "infra",
  provider: "./dist/ankh.provider.js",
} as const satisfies AnkhPackageMetadata;

const infraManifest = {
  id: "@ankhorage/infra",
  category: "infra",
  version: "1.0.0",
  capabilities: ["infra.up", "infra.status"],
  commands: [
    {
      path: ["up"],
      capability: "infra.up",
      summary: "Bring project infrastructure up",
      aliases: ["start"],
      examples: ["ankh infra up shop"],
    },
    {
      path: ["status"],
      capability: "infra.status",
      summary: "Show project infrastructure status",
    },
  ],
} as const satisfies AnkhCommandProviderManifest;

const noopHandler = () => undefined;

function createDiscoveredPackage(
  packageName: string,
  metadata: AnkhPackageMetadata,
): AnkhDiscoveredPackage {
  return {
    metadata,
    packageJsonPath: `/repo/${packageName}/package.json`,
    packageName,
    packageRoot: `/repo/${packageName}`,
    source: "workspace",
  };
}

function createLoadedProvider(
  discoveredPackage: AnkhDiscoveredPackage,
  manifest: AnkhCommandProviderManifest = infraManifest,
  providerModuleDefaultExport: unknown = manifest,
): AnkhLoadedProvider {
  return {
    discoveredPackage,
    manifest,
    providerModuleDefaultExport,
    providerModulePath: `${discoveredPackage.packageRoot}/dist/ankh.provider.js`,
    providerModuleUrl: `file://${discoveredPackage.packageRoot}/dist/ankh.provider.js`,
  };
}

function createRuntimeProvider(
  manifest: AnkhCommandProviderManifest,
  handlers: AnkhRuntimeCommandProvider["handlers"],
): AnkhRuntimeCommandProvider {
  return {
    ...manifest,
    handlers,
  };
}

function createMemoryContext(version = packageJson.version): {
  readonly context: AnkhCommandContext;
  readonly stdout: { value: string };
  readonly stderr: { value: string };
} {
  const stdout = { value: "" };
  const stderr = { value: "" };

  return {
    context: {
      cwd: "/repo",
      env: {},
      version,
      writeStdout(text: string) {
        stdout.value += text;
      },
      writeStderr(text: string) {
        stderr.value += text;
      },
    },
    stdout,
    stderr,
  };
}

describe("runCli", () => {
  it("prints help when called with no args", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli([], { context });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("Ankh CLI");
    expect(stdout.value).toContain("ankh commands");
    expect(stdout.value).toContain("ankh <category> --help");
    expect(stderr.value).toBe("");
  });

  it("prints help for help aliases", async () => {
    for (const argv of [["--help"], ["-h"], ["help"]] as const) {
      const { context, stdout, stderr } = createMemoryContext();

      const result = await runCli(argv, { context });

      expect(result).toEqual({ exitCode: 0 });
      expect(stdout.value).toContain("Built-ins:");
      expect(stderr.value).toBe("");
    }
  });

  it("prints the package version for version aliases", async () => {
    for (const argv of [["--version"], ["-v"]] as const) {
      const { context, stdout, stderr } = createMemoryContext("9.9.9");

      const result = await runCli(argv, { context });

      expect(result).toEqual({ exitCode: 0 });
      expect(stdout.value).toBe("9.9.9\n");
      expect(stderr.value).toBe("");
    }
  });

  it("prints the empty registry message for commands", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toBe(
      "No Ankh command providers are registered yet.\n",
    );
    expect(stderr.value).toBe("");
  });

  it("prints discovered package metadata and loaded provider command descriptors", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [
            createDiscoveredPackage("@ankhorage/contracts", contractsMetadata),
            infraPackage,
          ],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [createLoadedProvider(infraPackage)],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("Discovered Ankh packages:");
    expect(stdout.value).toContain("@ankhorage/contracts");
    expect(stdout.value).toContain("provider: none");
    expect(stdout.value).toContain("@ankhorage/infra");
    expect(stdout.value).toContain("provider: ./dist/ankh.provider.js");
    expect(stdout.value).toContain("commands:");
    expect(stdout.value).toContain("- up");
    expect(stdout.value).toContain("summary: Bring project infrastructure up");
    expect(stdout.value).toContain("aliases: start");
    expect(stdout.value).toContain("ankh infra up shop");
    expect(stderr.value).toBe("");
  });

  it("prints metadata and provider diagnostics to stderr while exiting zero for commands", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const metadataDiagnostic = {
      code: "invalid-ankh-category",
      message: 'package.json "ankh.category" must be a non-empty string.',
      packageJsonPath: "/repo/bad/package.json",
      packageName: "@ankhorage/bad",
      severity: "error",
      source: "workspace",
    } as const satisfies AnkhMetadataDiscoveryDiagnostic;
    const providerDiagnostic = {
      category: "infra",
      code: "provider-import-failed",
      message: "Could not import provider manifest module: not found",
      packageJsonPath: "/repo/@ankhorage/infra/package.json",
      packageName: "@ankhorage/infra",
      providerModulePath: "/repo/@ankhorage/infra/dist/ankh.provider.js",
      severity: "error",
    } as const satisfies AnkhProviderManifestDiagnostic;

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [metadataDiagnostic],
          packages: [
            createDiscoveredPackage("@ankhorage/contracts", contractsMetadata),
          ],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [providerDiagnostic],
          providers: [],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("@ankhorage/contracts");
    expect(stderr.value).toContain("Ankh metadata discovery diagnostics:");
    expect(stderr.value).toContain("invalid-ankh-category");
    expect(stderr.value).toContain("Ankh provider manifest diagnostics:");
    expect(stderr.value).toContain("provider-import-failed");
  });

  it("renders category help from a successfully loaded provider manifest", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );

    const result = await runCli(["infra", "--help"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [createLoadedProvider(infraPackage)],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("Ankh category: infra");
    expect(stdout.value).toContain("Package: @ankhorage/infra");
    expect(stdout.value).toContain("infra up");
    expect(stdout.value).toContain("infra status");
    expect(stderr.value).toBe("");
  });

  it("dispatches canonical provider commands with remaining argv passed through untouched", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );
    const requests: AnkhCommandExecutionRequest[] = [];
    const runtimeProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ["up"],
          handler(request) {
            requests.push(request);
            request.context.writeStdout(`handled:${request.argv.join("|")}\n`);
          },
        },
        {
          path: ["status"],
          handler: noopHandler,
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;

    const result = await runCli(["infra", "up", "--profile", "local"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              runtimeProvider,
              runtimeProvider,
            ),
          ],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.argv).toEqual(["--profile", "local"]);
    expect(requests[0]?.command.path).toEqual(["up"]);
    expect(requests[0]?.provider.manifest.id).toBe("@ankhorage/infra");
    expect(stdout.value).toContain("handled:--profile|local");
    expect(stderr.value).toBe("");
  });

  it("dispatches alias selectors and prefers the longest canonical command path", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage("@ankhorage/infra", {
      ...infraMetadata,
      capabilities: [
        "infra.up",
        "infra.status",
        "infra.port",
        "infra.port.forward",
      ],
    });
    const seen: string[] = [];
    const nestedManifest = {
      ...infraManifest,
      capabilities: [
        "infra.up",
        "infra.status",
        "infra.port",
        "infra.port.forward",
      ],
      commands: [
        ...infraManifest.commands,
        {
          path: ["port"],
          capability: "infra.port",
          summary: "Manage forwarded ports",
          aliases: ["pf"],
        },
        {
          path: ["port", "forward"],
          capability: "infra.port.forward",
          summary: "Forward a named infrastructure port",
        },
      ],
    } as const satisfies AnkhCommandProviderManifest;
    const runtimeProvider = {
      ...nestedManifest,
      handlers: [
        {
          path: ["up"],
          handler(request) {
            seen.push(
              `alias:${request.command.path.join(" ")}:${request.argv.join("|")}`,
            );
          },
        },
        {
          path: ["status"],
          handler: noopHandler,
        },
        {
          path: ["port"],
          handler(request) {
            seen.push(`port:${request.argv.join("|")}`);
          },
        },
        {
          path: ["port", "forward"],
          handler(request) {
            seen.push(`forward:${request.argv.join("|")}`);
          },
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;

    const aliasResult = await runCli(["infra", "start", "--watch"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              runtimeProvider,
              runtimeProvider,
            ),
          ],
        }),
    });
    const longestPathResult = await runCli(
      ["infra", "port", "forward", "db", "--local", "5432"],
      {
        context,
        discoverPackages: () =>
          Promise.resolve({
            diagnostics: [],
            packages: [infraPackage],
          }),
        loadProviders: () =>
          Promise.resolve({
            diagnostics: [],
            providers: [
              createLoadedProvider(
                infraPackage,
                runtimeProvider,
                runtimeProvider,
              ),
            ],
          }),
      },
    );

    expect(aliasResult).toEqual({ exitCode: 0 });
    expect(longestPathResult).toEqual({ exitCode: 0 });
    expect(seen).toEqual(["alias:up:--watch", "forward:db|--local|5432"]);
    expect(stdout.value).toBe("");
    expect(stderr.value).toBe("");
  });

  it("keeps execution diagnostics out of commands and category help output", async () => {
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );
    const partialProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ["up"],
          handler: noopHandler,
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;
    const commandRun = createMemoryContext();
    const helpRun = createMemoryContext();

    const commandResult = await runCli(["commands"], {
      context: commandRun.context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              partialProvider,
              partialProvider,
            ),
          ],
        }),
    });
    const helpResult = await runCli(["infra", "--help"], {
      context: helpRun.context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              partialProvider,
              partialProvider,
            ),
          ],
        }),
    });

    expect(commandResult).toEqual({ exitCode: 0 });
    expect(commandRun.stderr.value).toBe("");
    expect(helpResult).toEqual({ exitCode: 0 });
    expect(helpRun.stderr.value).toBe("");
  });

  it("prints execution diagnostics and exits one when a loaded provider has no handlers", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );

    const result = await runCli(["infra", "up"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [createLoadedProvider(infraPackage)],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("Ankh command execution diagnostics:");
    expect(stderr.value).toContain("provider-missing-command-handlers");
  });

  it("rejects partially handled providers for direct dispatch", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );
    let wasCalled = false;
    const partialProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ["up"],
          handler() {
            wasCalled = true;
          },
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;

    const result = await runCli(["infra", "up"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              partialProvider,
              partialProvider,
            ),
          ],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(wasCalled).toBeFalse();
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("provider-command-handler-missing");
  });

  it("prints unknown provider command guidance for known categories", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );
    const runtimeProvider = createRuntimeProvider(infraManifest, [
      {
        path: ["up"],
        handler: noopHandler,
      },
      {
        path: ["status"],
        handler: noopHandler,
      },
    ]);

    const result = await runCli(["infra", "destroy"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              runtimeProvider,
              runtimeProvider,
            ),
          ],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain(
      'Unknown Ankh command for category "infra": destroy',
    );
    expect(stderr.value).toContain("ankh infra --help");
  });

  it("returns provider handler exit codes and catches thrown provider errors", async () => {
    const infraPackage = createDiscoveredPackage(
      "@ankhorage/infra",
      infraMetadata,
    );
    const successRun = createMemoryContext();
    const failureRun = createMemoryContext();
    const exitCodeProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ["up"],
          handler() {
            return { exitCode: 7 };
          },
        },
        {
          path: ["status"],
          handler: noopHandler,
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;
    const throwingProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ["up"],
          handler() {
            throw new Error("kaboom");
          },
        },
        {
          path: ["status"],
          handler: noopHandler,
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;

    const successResult = await runCli(["infra", "up"], {
      context: successRun.context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              exitCodeProvider,
              exitCodeProvider,
            ),
          ],
        }),
    });
    const failureResult = await runCli(["infra", "up"], {
      context: failureRun.context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [infraPackage],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            createLoadedProvider(
              infraPackage,
              throwingProvider,
              throwingProvider,
            ),
          ],
        }),
    });

    expect(successResult).toEqual({ exitCode: 7 });
    expect(successRun.stderr.value).toBe("");
    expect(failureResult).toEqual({ exitCode: 1 });
    expect(failureRun.stderr.value).toContain(
      'Ankh command execution failed for "infra up": kaboom',
    );
  });

  it("prints provider diagnostics and exits one when category metadata exists but the manifest is invalid", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const providerDiagnostic = {
      category: "infra",
      code: "missing-provider-default-export",
      message:
        "Provider manifest module must default-export an AnkhCommandProviderManifest object.",
      packageJsonPath: "/repo/@ankhorage/infra/package.json",
      packageName: "@ankhorage/infra",
      providerModulePath: "/repo/@ankhorage/infra/dist/ankh.provider.js",
      severity: "error",
    } as const satisfies AnkhProviderManifestDiagnostic;

    const result = await runCli(["infra", "help"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [
            createDiscoveredPackage("@ankhorage/infra", infraMetadata),
          ],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [providerDiagnostic],
          providers: [],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("Ankh provider manifest diagnostics:");
    expect(stderr.value).toContain("missing-provider-default-export");
  });

  it("prints provider manifest diagnostics for dispatch when category metadata exists but the manifest is invalid", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const providerDiagnostic = {
      category: "infra",
      code: "provider-command-alias-collides-with-path",
      message:
        'Provider manifest alias "start" collides with canonical command path "start".',
      packageJsonPath: "/repo/@ankhorage/infra/package.json",
      packageName: "@ankhorage/infra",
      providerModulePath: "/repo/@ankhorage/infra/dist/ankh.provider.js",
      severity: "error",
    } as const satisfies AnkhProviderManifestDiagnostic;

    const result = await runCli(["infra", "up"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [
            createDiscoveredPackage("@ankhorage/infra", infraMetadata),
          ],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [providerDiagnostic],
          providers: [],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("Ankh provider manifest diagnostics:");
    expect(stderr.value).toContain("provider-command-alias-collides-with-path");
  });

  it("prints unknown category errors for missing category metadata", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(["infra", "--help"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [
            createDiscoveredPackage("@ankhorage/contracts", contractsMetadata),
          ],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("Unknown Ankh category: infra");
    expect(stderr.value).toContain("ankh commands");
  });

  it("returns non-zero when metadata discovery fails unexpectedly", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () => Promise.reject(new Error("boom")),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain(
      "Ankh package metadata discovery failed unexpectedly: boom",
    );
  });

  it("returns non-zero when provider loading fails unexpectedly", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [
            createDiscoveredPackage("@ankhorage/infra", infraMetadata),
          ],
        }),
      loadProviders: () => Promise.reject(new Error("load boom")),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain(
      "Ankh provider manifest loading failed unexpectedly: load boom",
    );
  });

  it("returns non-zero for unknown commands", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(["something", "else"], { context });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("Unknown Ankh command: something else");
    expect(stderr.value).toContain("ankh commands");
    expect(stderr.value).toContain("ankh --help");
  });

  it("does not mention hardcoded provider categories in generic bootstrap output", async () => {
    for (const argv of [[], ["unknown"]] as const) {
      const { context, stdout, stderr } = createMemoryContext();
      await runCli(argv, { context });

      const output = `${stdout.value}\n${stderr.value}`;
      for (const categoryName of FORBIDDEN_CATEGORY_NAMES) {
        expect(output).not.toContain(categoryName);
      }
    }
  });
});

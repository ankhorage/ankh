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
): AnkhLoadedProvider {
  return {
    discoveredPackage,
    manifest,
    providerModulePath: `${discoveredPackage.packageRoot}/dist/ankh.provider.js`,
    providerModuleUrl: `file://${discoveredPackage.packageRoot}/dist/ankh.provider.js`,
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
    expect(stdout.value).toContain('Ankh CLI');
    expect(stdout.value).toContain('ankh commands');
    expect(stdout.value).toContain('ankh <category> --help');
    expect(stderr.value).toBe('');
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

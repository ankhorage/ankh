import type { AnkhPackageMetadata } from "@ankhorage/contracts/cli";
import { describe, expect, it } from "bun:test";

import packageJson from "../package.json";
import { runCli } from "../src/cli.js";
import type { AnkhCommandContext } from "../src/commandContext.js";
import type {
  AnkhDiscoveredPackage,
  AnkhMetadataDiscoveryDiagnostic,
} from "../src/discovery.js";

const FORBIDDEN_CATEGORY_NAMES = [
  "infra",
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
  capabilities: ["infra.up", "infra.status"],
  category: "infra",
  provider: "./dist/ankh.provider.js",
} as const satisfies AnkhPackageMetadata;

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
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toBe(
      "No Ankh command providers are registered yet.\n",
    );
    expect(stderr.value).toBe("");
  });

  it("prints discovered package metadata for commands", async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [
            createDiscoveredPackage("@ankhorage/contracts", contractsMetadata),
            createDiscoveredPackage("@ankhorage/infra", infraMetadata),
          ],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("Discovered Ankh packages:");
    expect(stdout.value).toContain("@ankhorage/contracts");
    expect(stdout.value).toContain("category: contracts");
    expect(stdout.value).toContain("provider: none");
    expect(stdout.value).toContain("contracts.cli");
    expect(stdout.value).toContain("@ankhorage/infra");
    expect(stdout.value).toContain("provider: ./dist/ankh.provider.js");
    expect(stdout.value).toContain("infra.up");
    expect(stderr.value).toBe("");
  });

  it("prints diagnostics to stderr and exits zero for partial invalid discovery", async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const diagnostic = {
      code: "invalid-ankh-category",
      message: 'package.json "ankh.category" must be a non-empty string.',
      packageJsonPath: "/repo/bad/package.json",
      packageName: "@ankhorage/bad",
      severity: "error",
      source: "workspace",
    } as const satisfies AnkhMetadataDiscoveryDiagnostic;

    const result = await runCli(["commands"], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [diagnostic],
          packages: [
            createDiscoveredPackage("@ankhorage/contracts", contractsMetadata),
          ],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("@ankhorage/contracts");
    expect(stderr.value).toContain("Ankh metadata discovery diagnostics:");
    expect(stderr.value).toContain("invalid-ankh-category");
    expect(stderr.value).toContain("@ankhorage/bad");
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

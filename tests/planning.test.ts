import type {
  AnkhCommandProviderManifest,
  AnkhPackageMetadata,
} from "@ankhorage/contracts/cli";
import { describe, expect, it } from "bun:test";

import packageJson from "../package.json";
import { runCli } from "../src/cli.js";
import type { AnkhCommandContext } from "../src/commandContext.js";
import type { AnkhDiscoveredPackage } from "../src/discovery.js";
import type { AnkhCommandPlan } from "../src/planning.js";
import type { AnkhLoadedProvider } from "../src/providerManifestLoader.js";

const metadata = {
  capabilities: [
    "fixture.source.inspect",
    "fixture.template.seed",
    "fixture.project.sync",
  ],
  category: "fixture",
  provider: "./dist/ankh.provider.js",
} as const satisfies AnkhPackageMetadata;

const manifest = {
  id: "@ankhorage/fixture",
  category: "fixture",
  version: "1.0.0",
  capabilities: metadata.capabilities,
  commands: [
    {
      path: ["workflow"],
      capability: "fixture.source.inspect",
      summary: "Plan a fixture workflow.",
    },
  ],
} as const satisfies AnkhCommandProviderManifest;

const plan = {
  diagnostics: [],
  kind: "ankh-command-plan",
  steps: [
    {
      capability: "fixture.source.inspect",
      dependsOn: [],
      destructive: false,
      id: "inspect-source",
      label: "Inspect source fixture",
      providerId: "@ankhorage/fixture",
      status: "planned",
    },
    {
      capability: "fixture.template.seed",
      dependsOn: ["inspect-source"],
      destructive: false,
      id: "seed-template",
      label: "Create manifest-first seed",
      providerId: "@ankhorage/fixture",
      status: "planned",
    },
    {
      capability: "fixture.project.sync",
      dependsOn: ["seed-template"],
      destructive: true,
      id: "sync-project",
      label: "Synchronize project files",
      providerId: "@ankhorage/fixture",
      status: "planned",
    },
  ],
  title: "Fixture workflow",
  version: 1,
} as const satisfies AnkhCommandPlan;

const [inspectStep, seedStep, syncStep] = plan.steps;

const blockedPlan = {
  ...plan,
  diagnostics: [
    {
      code: "fixture-source-missing",
      message: "The fixture source could not be inspected.",
      severity: "error",
      stepId: "inspect-source",
    },
  ],
  steps: [
    inspectStep,
    { ...seedStep, status: "blocked" },
    { ...syncStep, status: "blocked" },
  ],
} as const satisfies AnkhCommandPlan;

function discoveredPackage(): AnkhDiscoveredPackage {
  return {
    metadata,
    packageJsonPath: "/repo/@ankhorage/fixture/package.json",
    packageName: "@ankhorage/fixture",
    packageRoot: "/repo/@ankhorage/fixture",
    source: "workspace",
  };
}

function loadedProvider(providerModuleDefaultExport: unknown): AnkhLoadedProvider {
  const discovered = discoveredPackage();
  return {
    discoveredPackage: discovered,
    manifest,
    providerModuleDefaultExport,
    providerModulePath: `${discovered.packageRoot}/dist/ankh.provider.js`,
    providerModuleUrl: `file://${discovered.packageRoot}/dist/ankh.provider.js`,
  };
}

function providerFixture(options: {
  readonly onExecute?: () => void;
  readonly plan?: AnkhCommandPlan;
} = {}) {
  return {
    ...manifest,
    handlers: [
      {
        path: ["workflow"],
        handler() {
          options.onExecute?.();
        },
      },
    ],
    planningHandlers: [
      {
        path: ["workflow"],
        handler() {
          return options.plan ?? plan;
        },
      },
    ],
  };
}

function memoryContext(): {
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
      version: packageJson.version,
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

function runOptions(provider = providerFixture()) {
  return {
    discoverPackages: () =>
      Promise.resolve({ diagnostics: [], packages: [discoveredPackage()] }),
    loadProviders: () =>
      Promise.resolve({ diagnostics: [], providers: [loadedProvider(provider)] }),
  };
}

describe("ankh plan", () => {
  it("prints a deterministic human-readable fixture plan", async () => {
    const { context, stdout, stderr } = memoryContext();
    const result = await runCli(["plan", "fixture", "workflow"], {
      context,
      ...runOptions(),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain("Plan: Fixture workflow");
    expect(stdout.value).toContain("1. Inspect source fixture");
    expect(stdout.value).toContain("dependsOn: inspect-source");
    expect(stdout.value).toContain("destructive: yes");
    expect(stderr.value).toBe("");
  });

  it("prints stable JSON with --json", async () => {
    const { context, stdout, stderr } = memoryContext();
    const result = await runCli(["plan", "fixture", "workflow", "--json"], {
      context,
      ...runOptions(),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(JSON.parse(stdout.value)).toEqual(plan);
    expect(stderr.value).toBe("");
  });

  it("returns exit code one when the plan has error diagnostics", async () => {
    const { context, stdout, stderr } = memoryContext();
    const result = await runCli(["plan", "fixture", "workflow"], {
      context,
      ...runOptions(providerFixture({ plan: blockedPlan })),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toContain("fixture-source-missing");
    expect(stdout.value).toContain("status: blocked");
    expect(stderr.value).toBe("");
  });

  it("does not execute provider command handlers while planning", async () => {
    const { context, stdout } = memoryContext();
    let executed = false;
    const result = await runCli(["plan", "fixture", "workflow"], {
      context,
      ...runOptions(
        providerFixture({
          onExecute() {
            executed = true;
          },
        }),
      ),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(executed).toBeFalse();
    expect(stdout.value).toContain("Plan: Fixture workflow");
  });

  it("keeps ankh run deferred", async () => {
    const { context, stdout, stderr } = memoryContext();
    let executed = false;
    const result = await runCli(["run", "fixture", "workflow"], {
      context,
      ...runOptions(
        providerFixture({
          onExecute() {
            executed = true;
          },
        }),
      ),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(executed).toBeFalse();
    expect(stdout.value).toBe("");
    expect(stderr.value).toContain("ankh run is deferred");
  });
});

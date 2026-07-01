import type {
  AnkhCommandProviderManifest,
  AnkhPackageMetadata,
} from "@ankhorage/contracts/cli";
import { describe, expect, it } from "bun:test";

import { createProviderRegistry } from "../src/providerRegistry.js";

const infraMetadata = {
  capabilities: ["infra.up", "infra.status"],
  category: "infra",
  provider: "./dist/ankh.provider.js",
} as const satisfies AnkhPackageMetadata;

const infraManifest = {
  id: "@ankhorage/infra",
  category: "infra",
  version: "1.0.0",
  capabilities: ["infra.up", "infra.port", "infra.port.forward"],
  commands: [
    {
      path: ["up"],
      capability: "infra.up",
      summary: "Bring project infrastructure up",
      aliases: ["start"],
      examples: ["ankh infra up shop"],
    },
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

describe("createProviderRegistry", () => {
  it("starts empty by default", () => {
    const registry = createProviderRegistry();

    expect(registry.listProviders()).toEqual([]);
    expect(registry.listCommands()).toEqual([]);
    expect(registry.findByCategory("infra")).toBeNull();
    expect(registry.hasCategory("infra")).toBeFalse();
  });

  it("lists loaded providers and command descriptors separately from package metadata", () => {
    const registry = createProviderRegistry([
      {
        discoveredPackage: {
          metadata: infraMetadata,
          packageJsonPath: "/repo/packages/infra/package.json",
          packageName: "@ankhorage/infra",
          packageRoot: "/repo/packages/infra",
          source: "workspace",
        },
        manifest: infraManifest,
        providerModuleDefaultExport: infraManifest,
        providerModulePath: "/repo/packages/infra/dist/ankh.provider.js",
        providerModuleUrl: "file:///repo/packages/infra/dist/ankh.provider.js",
      },
    ]);

    expect(registry.listProviders()).toHaveLength(1);
    expect(registry.findByCategory("infra")?.manifest.id).toBe(
      "@ankhorage/infra",
    );
    expect(registry.listCommands()).toEqual([
      {
        aliases: ["start"],
        capability: "infra.up",
        category: "infra",
        examples: ["ankh infra up shop"],
        packageName: "@ankhorage/infra",
        path: ["up"],
        providerId: "@ankhorage/infra",
        summary: "Bring project infrastructure up",
      },
      {
        aliases: ["pf"],
        capability: "infra.port",
        category: "infra",
        packageName: "@ankhorage/infra",
        path: ["port"],
        providerId: "@ankhorage/infra",
        summary: "Manage forwarded ports",
      },
      {
        capability: "infra.port.forward",
        category: "infra",
        packageName: "@ankhorage/infra",
        path: ["port", "forward"],
        providerId: "@ankhorage/infra",
        summary: "Forward a named infrastructure port",
      },
    ]);
    expect(registry.hasCategory("infra")).toBeTrue();
    expect(registry.hasCategory("contracts")).toBeFalse();
  });

  it("resolves canonical paths, aliases, and longest path matches", () => {
    const provider = {
      discoveredPackage: {
        metadata: infraMetadata,
        packageJsonPath: "/repo/packages/infra/package.json",
        packageName: "@ankhorage/infra",
        packageRoot: "/repo/packages/infra",
        source: "workspace" as const,
      },
      manifest: infraManifest,
      providerModuleDefaultExport: infraManifest,
      providerModulePath: "/repo/packages/infra/dist/ankh.provider.js",
      providerModuleUrl: "file:///repo/packages/infra/dist/ankh.provider.js",
    };
    const registry = createProviderRegistry([provider]);

    expect(registry.resolveCommand("infra", ["up", "--watch"])).toEqual({
      argv: ["--watch"],
      command: {
        aliases: ["start"],
        capability: "infra.up",
        category: "infra",
        examples: ["ankh infra up shop"],
        packageName: "@ankhorage/infra",
        path: ["up"],
        providerId: "@ankhorage/infra",
        summary: "Bring project infrastructure up",
      },
      provider,
    });
    expect(
      registry.resolveCommand("infra", ["start", "--watch"])?.argv,
    ).toEqual(["--watch"]);
    expect(
      registry.resolveCommand("infra", ["port", "forward", "db"])?.command.path,
    ).toEqual(["port", "forward"]);
    expect(registry.resolveCommand("infra", ["missing"])).toBeNull();
  });

  it("does not resolve commands when more than one loaded provider shares a category", () => {
    const duplicateProvider = {
      discoveredPackage: {
        metadata: infraMetadata,
        packageJsonPath: "/repo/packages/infra-alt/package.json",
        packageName: "@ankhorage/infra-alt",
        packageRoot: "/repo/packages/infra-alt",
        source: "workspace" as const,
      },
      manifest: {
        ...infraManifest,
        id: "@ankhorage/infra-alt",
      },
      providerModuleDefaultExport: infraManifest,
      providerModulePath: "/repo/packages/infra-alt/dist/ankh.provider.js",
      providerModuleUrl:
        "file:///repo/packages/infra-alt/dist/ankh.provider.js",
    };
    const registry = createProviderRegistry([
      {
        discoveredPackage: {
          metadata: infraMetadata,
          packageJsonPath: "/repo/packages/infra/package.json",
          packageName: "@ankhorage/infra",
          packageRoot: "/repo/packages/infra",
          source: "workspace" as const,
        },
        manifest: infraManifest,
        providerModuleDefaultExport: infraManifest,
        providerModulePath: "/repo/packages/infra/dist/ankh.provider.js",
        providerModuleUrl: "file:///repo/packages/infra/dist/ankh.provider.js",
      },
      duplicateProvider,
    ]);

    expect(registry.findAllByCategory("infra")).toHaveLength(2);
    expect(registry.resolveCommand("infra", ["up"])).toBeNull();
  });
});

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
  capabilities: ["infra.up"],
  commands: [
    {
      path: ["up"],
      capability: "infra.up",
      summary: "Bring project infrastructure up",
      aliases: ["start"],
      examples: ["ankh infra up shop"],
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
    ]);
    expect(registry.hasCategory("infra")).toBeTrue();
    expect(registry.hasCategory("contracts")).toBeFalse();
  });
});

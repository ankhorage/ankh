import type { AnkhPackageMetadata } from "@ankhorage/contracts/cli";
import { describe, expect, it } from "bun:test";

import { createPackageRegistry } from "../src/packageRegistry.js";

const contractsMetadata = {
  capabilities: ["contracts.cli"],
  category: "contracts",
  provider: null,
} as const satisfies AnkhPackageMetadata;

describe("createPackageRegistry", () => {
  it("starts empty by default", () => {
    const registry = createPackageRegistry();

    expect(registry.listPackages()).toEqual([]);
    expect(registry.findByCategory("infra")).toBeNull();
    expect(registry.hasCategory("infra")).toBeFalse();
  });

  it("lists discovered packages and categories", () => {
    const registry = createPackageRegistry([
      {
        metadata: contractsMetadata,
        packageJsonPath: "/repo/packages/contracts/package.json",
        packageName: "@ankhorage/contracts",
        packageRoot: "/repo/packages/contracts",
        source: "workspace",
      },
    ]);

    expect(registry.listPackages()).toHaveLength(1);
    expect(registry.listPackages()[0]?.packageName).toBe(
      "@ankhorage/contracts",
    );
    expect(registry.findByCategory("contracts")?.packageName).toBe(
      "@ankhorage/contracts",
    );
    expect(registry.findByCategory("infra")).toBeNull();
    expect(registry.hasCategory("contracts")).toBeTrue();
    expect(registry.hasCategory("infra")).toBeFalse();
  });
});

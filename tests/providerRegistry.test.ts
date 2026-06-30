import { describe, expect, it } from "bun:test";

import { createProviderRegistry } from "../src/providerRegistry.js";

describe("createProviderRegistry", () => {
  it("starts empty by default", () => {
    const registry = createProviderRegistry();

    expect(registry.listProviders()).toEqual([]);
    expect(registry.listCommands()).toEqual([]);
    expect(registry.hasCategory("infra")).toBeFalse();
  });
});

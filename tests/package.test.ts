import { describe, expect, it } from "bun:test";

import packageJson from "../package.json";

describe("package.json", () => {
  it("publishes the expected package metadata and exports", () => {
    expect(packageJson.name).toBe("@ankhorage/ankh");
    expect(packageJson.type).toBe("module");
    expect(packageJson.bin).toEqual({
      ankh: "./dist/bin.js",
    });
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
    expect(packageJson.exports["./package.json"]).toBe("./package.json");
  });

  it("publishes the required package scripts and no top-level ankh metadata yet", () => {
    expect(typeof packageJson.scripts.build).toBe("string");
    expect(typeof packageJson.scripts.typecheck).toBe("string");
    expect(typeof packageJson.scripts.lint).toBe("string");
    expect(typeof packageJson.scripts["lint:fix"]).toBe("string");
    expect(typeof packageJson.scripts.format).toBe("string");
    expect(typeof packageJson.scripts["format:check"]).toBe("string");
    expect(typeof packageJson.scripts.test).toBe("string");
    expect(typeof packageJson.scripts.knip).toBe("string");
    expect(typeof packageJson.scripts.docs).toBe("string");
    expect(typeof packageJson.scripts.changeset).toBe("string");
    expect(typeof packageJson.scripts["changeset:status"]).toBe("string");
    expect(typeof packageJson.scripts["version-packages"]).toBe("string");
    expect("ankh" in packageJson).toBeFalse();
  });
});

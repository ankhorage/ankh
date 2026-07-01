import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  AnkhCommandProviderManifest,
  AnkhPackageMetadata,
} from "@ankhorage/contracts/cli";
import { afterEach, describe, expect, it } from "bun:test";

import { loadProviderManifests } from "../src/providerManifestLoader.js";

const temporaryDirectories: string[] = [];

const infraMetadata = {
  capabilities: ["infra.up", "infra.status", "infra.down"],
  category: "infra",
  provider: "./dist/ankh.provider.js",
} as const satisfies AnkhPackageMetadata;

const validManifest = {
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
  ],
} as const satisfies AnkhCommandProviderManifest;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("loadProviderManifests", () => {
  it("loads valid default-exported provider manifests via file URLs", async () => {
    const packageRoot = await createPackageRoot("infra");
    await writeProviderModule(
      packageRoot,
      `export default ${JSON.stringify(validManifest, null, 2)};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.manifest).toEqual(validManifest);
    expect(result.providers[0]?.providerModulePath).toBe(
      path.join(packageRoot, "dist", "ankh.provider.js"),
    );
    expect(result.providers[0]?.providerModuleUrl.startsWith("file://")).toBe(
      true,
    );
  });

  it("reports missing provider modules as diagnostics", async () => {
    const packageRoot = await createPackageRoot("infra");

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "provider-import-failed",
    );
  });

  it("requires a default export", async () => {
    const packageRoot = await createPackageRoot("infra");
    await writeProviderModule(
      packageRoot,
      `export const manifest = ${JSON.stringify(validManifest, null, 2)};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "missing-provider-default-export",
    );
  });

  it("rejects provider paths that escape the discovered package root", async () => {
    const packageRoot = await createPackageRoot("infra-outside");

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", {
        ...infraMetadata,
        provider: "./../outside.provider.js",
      }),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "provider-path-outside-package-root",
    );
    expect(
      result.diagnostics.map((diagnostic) => diagnostic.code),
    ).not.toContain("provider-import-failed");
  });

  it("reports invalid manifest shape", async () => {
    const packageRoot = await createPackageRoot("infra");
    await writeProviderModule(
      packageRoot,
      `export default ${JSON.stringify(
        {
          ...validManifest,
          commands: "nope",
        },
        null,
        2,
      )};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalid-provider-commands",
    );
  });

  it("rejects category mismatches", async () => {
    const packageRoot = await createPackageRoot("infra");
    await writeProviderModule(
      packageRoot,
      `export default ${JSON.stringify(
        {
          ...validManifest,
          category: "doctor",
        },
        null,
        2,
      )};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "provider-category-mismatch",
    );
  });

  it("rejects manifest capabilities not declared in package metadata", async () => {
    const packageRoot = await createPackageRoot("infra");
    await writeProviderModule(
      packageRoot,
      `export default ${JSON.stringify(
        {
          ...validManifest,
          capabilities: ["infra.up", "infra.rebuild"],
        },
        null,
        2,
      )};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "provider-capability-not-declared",
    );
  });

  it("allows package metadata to advertise broader capabilities than the loaded manifest", async () => {
    const packageRoot = await createPackageRoot("infra");
    await writeProviderModule(
      packageRoot,
      `export default ${JSON.stringify(validManifest, null, 2)};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", infraMetadata),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.manifest.capabilities).toEqual([
      "infra.up",
      "infra.status",
    ]);
  });

  it("rejects command capabilities not declared in provider manifest capabilities", async () => {
    const packageRoot = await createPackageRoot("infra-command-capability");
    await writeProviderModule(
      packageRoot,
      `export default ${JSON.stringify(
        {
          ...validManifest,
          commands: [
            {
              path: ["destroy"],
              capability: "infra.destroy",
              summary: "Destroy project infrastructure",
            },
          ],
        },
        null,
        2,
      )};\n`,
    );

    const result = await loadProviderManifests([
      createDiscoveredPackage(packageRoot, "@ankhorage/infra", {
        ...infraMetadata,
        capabilities: [
          "infra.up",
          "infra.status",
          "infra.down",
          "infra.destroy",
        ],
      }),
    ]);

    expect(result.providers).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "provider-command-capability-not-declared",
    );
  });
});

async function createPackageRoot(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `ankh-provider-${name}-`));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "dist"), { recursive: true });
  return root;
}

function createDiscoveredPackage(
  packageRoot: string,
  packageName: string,
  metadata: AnkhPackageMetadata,
) {
  return {
    metadata,
    packageJsonPath: path.join(packageRoot, "package.json"),
    packageName,
    packageRoot,
    source: "workspace" as const,
  };
}

async function writeProviderModule(
  packageRoot: string,
  content: string,
): Promise<void> {
  await writeFile(path.join(packageRoot, "dist", "ankh.provider.js"), content);
}

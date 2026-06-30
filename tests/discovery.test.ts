import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AnkhPackageMetadata } from "@ankhorage/contracts/cli";
import { afterEach, describe, expect, it } from "bun:test";

import { discoverAnkhPackages } from "../src/discovery.js";

const temporaryDirectories: string[] = [];

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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("discoverAnkhPackages", () => {
  it("discovers current package metadata first", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      ankh: contractsMetadata,
      name: "@ankhorage/contracts",
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([
      {
        metadata: contractsMetadata,
        packageJsonPath: path.join(root, "package.json"),
        packageName: "@ankhorage/contracts",
        packageRoot: root,
        source: "current-package",
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("discovers workspace package metadata", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writePackageJson(path.join(root, "packages", "infra"), {
      ankh: infraMetadata,
      name: "@ankhorage/infra",
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([
      {
        metadata: infraMetadata,
        packageJsonPath: path.join(root, "packages", "infra", "package.json"),
        packageName: "@ankhorage/infra",
        packageRoot: path.join(root, "packages", "infra"),
        source: "workspace",
      },
    ]);
  });

  it("discovers installed @ankhorage packages from node_modules", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, { name: "repo" });
    await writePackageJson(
      path.join(root, "node_modules", "@ankhorage", "contracts"),
      {
        ankh: contractsMetadata,
        name: "@ankhorage/contracts",
      },
    );

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([
      {
        metadata: contractsMetadata,
        packageJsonPath: path.join(
          root,
          "node_modules",
          "@ankhorage",
          "contracts",
          "package.json",
        ),
        packageName: "@ankhorage/contracts",
        packageRoot: path.join(root, "node_modules", "@ankhorage", "contracts"),
        source: "installed-dependency",
      },
    ]);
  });

  it("ignores non-@ankhorage installed packages", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, { name: "repo" });
    await writePackageJson(path.join(root, "node_modules", "lodash"), {
      ankh: infraMetadata,
      name: "lodash",
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("ignores packages without ankh metadata", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writePackageJson(path.join(root, "packages", "plain"), {
      name: "@ankhorage/plain",
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports invalid metadata without crashing", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writePackageJson(path.join(root, "packages", "bad"), {
      ankh: {
        capabilities: ["broken.capability"],
        category: 42,
        provider: null,
      },
      name: "@ankhorage/bad",
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalid-ankh-category",
    );
  });

  it("reports malformed package json without crashing", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writeRawPackageJson(
      path.join(root, "packages", "broken"),
      '{\n  "name": "@ankhorage/broken",\n  ',
    );

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalid-package-json",
    );
  });

  it("reports malformed current package json as a discovery diagnostic", async () => {
    const root = await createFixtureRoot();
    const packageDirectory = path.join(root, "packages", "broken");
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writeRawPackageJson(
      packageDirectory,
      '{\n  "name": "@ankhorage/broken",\n  "ankh": ',
    );

    const result = await discoverAnkhPackages({
      cwd: path.join(packageDirectory, "src"),
    });

    expect(result.packages).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalid-package-json",
    );
  });

  it("reports missing package name when ankh metadata is present", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      ankh: infraMetadata,
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalid-package-name",
    );
  });

  it("prefers a workspace package over an installed duplicate", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writePackageJson(path.join(root, "packages", "infra"), {
      ankh: infraMetadata,
      name: "@ankhorage/infra",
    });
    await writePackageJson(
      path.join(root, "node_modules", "@ankhorage", "infra"),
      {
        ankh: {
          capabilities: ["infra.up"],
          category: "installed-infra",
          provider: "./dist/installed.provider.js",
        },
        name: "@ankhorage/infra",
      },
    );

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]?.source).toBe("workspace");
    expect(result.packages[0]?.metadata).toEqual(infraMetadata);
  });

  it("reports duplicate category and capability diagnostics", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
      workspaces: ["packages/*"],
    });
    await writePackageJson(path.join(root, "packages", "infra-a"), {
      ankh: {
        capabilities: ["infra.up"],
        category: "infra",
        provider: "./dist/a.provider.js",
      },
      name: "@ankhorage/infra-a",
    });
    await writePackageJson(path.join(root, "packages", "infra-b"), {
      ankh: {
        capabilities: ["infra.up"],
        category: "infra",
        provider: "./dist/b.provider.js",
      },
      name: "@ankhorage/infra-b",
    });

    const result = await discoverAnkhPackages({ cwd: root });
    const diagnosticCodes = result.diagnostics.map(
      (diagnostic) => diagnostic.code,
    );

    expect(result.packages).toHaveLength(2);
    expect(diagnosticCodes).toContain("duplicate-ankh-category");
    expect(diagnosticCodes).toContain("duplicate-ankh-capability");
  });

  it("discovers workspace packages declared through pnpm-workspace.yaml", async () => {
    const root = await createFixtureRoot();
    await writePackageJson(root, {
      name: "repo",
    });
    await writePnpmWorkspace(root, ["packages/*"]);
    await writePackageJson(path.join(root, "packages", "infra"), {
      ankh: infraMetadata,
      name: "@ankhorage/infra",
    });

    const result = await discoverAnkhPackages({ cwd: root });

    expect(result.packages).toEqual([
      {
        metadata: infraMetadata,
        packageJsonPath: path.join(root, "packages", "infra", "package.json"),
        packageName: "@ankhorage/infra",
        packageRoot: path.join(root, "packages", "infra"),
        source: "workspace",
      },
    ]);
  });
});

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ankh-discovery-"));
  temporaryDirectories.push(root);
  return root;
}

async function writePackageJson(
  directory: string,
  packageJson: Record<string, unknown>,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
}

async function writeRawPackageJson(
  directory: string,
  rawPackageJson: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), rawPackageJson, "utf8");
}

async function writePnpmWorkspace(
  directory: string,
  packages: readonly string[],
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const yaml = [
    "packages:",
    ...packages.map((workspacePattern) => `  - '${workspacePattern}'`),
  ].join("\n");
  await writeFile(
    path.join(directory, "pnpm-workspace.yaml"),
    `${yaml}\n`,
    "utf8",
  );
}

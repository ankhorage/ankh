import { symlinkSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "bun:test";

import { findInstalledAnkhoragePackageJsonFiles } from "../src/workspace.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

it("discovers installed Ankhorage packages linked through node_modules", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ankh-workspace-"));
  temporaryDirectories.push(root);

  const packageRoot = path.join(root, "packages", "devtools");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    '{"name":"@ankhorage/devtools"}\n',
    "utf8",
  );

  const scopeRoot = path.join(root, "node_modules", "@ankhorage");
  await mkdir(scopeRoot, { recursive: true });
  symlinkSync(packageRoot, path.join(scopeRoot, "devtools"), "dir");

  await expect(findInstalledAnkhoragePackageJsonFiles(root)).resolves.toEqual([
    path.join(scopeRoot, "devtools", "package.json"),
  ]);
});

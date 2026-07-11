import { expect, it } from "bun:test";

import { runCli } from "../src/cli.js";
import type { AnkhCommandContext } from "../src/commandContext.js";
import { mergeCorePackages } from "../src/coreProviders.js";
import type { AnkhDiscoveredPackage } from "../src/discovery.js";

it("renders Doctor category help without discovered providers", async () => {
  const stdout = { value: "" };
  const stderr = { value: "" };
  const context: AnkhCommandContext = {
    cwd: process.cwd(),
    env: {},
    version: "test",
    writeStdout(text) {
      stdout.value += text;
    },
    writeStderr(text) {
      stderr.value += text;
    },
  };

  const result = await runCli(["doctor", "--help"], {
    context,
    discoverPackages: () => Promise.resolve({ diagnostics: [], packages: [] }),
    loadProviders: () => Promise.resolve({ diagnostics: [], providers: [] }),
  });

  expect(result).toEqual({ exitCode: 0 });
  expect(stdout.value).toContain("Ankh category: doctor");
  expect(stdout.value).toContain("Package: @ankhorage/doctor");
  expect(stdout.value).toContain("doctor validate");
  expect(stderr.value).toBe("");
});

it("lets a discovered Doctor package replace the bundled package metadata", () => {
  const corePackage = createDoctorPackage("/global/doctor", "core-provider");
  const localPackage = createDoctorPackage("/workspace/doctor", "current-package");

  expect(mergeCorePackages([corePackage], [localPackage])).toEqual([localPackage]);
});

function createDoctorPackage(
  packageRoot: string,
  source: AnkhDiscoveredPackage["source"],
): AnkhDiscoveredPackage {
  return {
    metadata: {
      category: "doctor",
      provider: "./dist/cli/index.js",
      capabilities: ["doctor.validate"],
    },
    packageJsonPath: `${packageRoot}/package.json`,
    packageName: "@ankhorage/doctor",
    packageRoot,
    source,
  };
}

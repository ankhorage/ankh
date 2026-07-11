import path from "node:path";

import type { AnkhPackageMetadata } from "@ankhorage/contracts/cli";

import { readAnkhPackageMetadata } from "./packageMetadata.js";
import {
  findInstalledAnkhoragePackageJsonFiles,
  findWorkspacePackageJsonFiles,
  findWorkspaceRoots,
} from "./workspace.js";

export type AnkhDiscoverySource =
  | "core-provider"
  | "current-package"
  | "workspace"
  | "installed-dependency";

export interface AnkhDiscoveredPackage {
  readonly metadata: AnkhPackageMetadata;
  readonly packageJsonPath: string;
  readonly packageName: string;
  readonly packageRoot: string;
  readonly source: AnkhDiscoverySource;
}

export interface AnkhMetadataDiscoveryDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly packageJsonPath?: string;
  readonly packageName?: string;
  readonly severity: "warning" | "error";
  readonly source?: AnkhDiscoverySource;
}

export interface AnkhMetadataDiscoveryResult {
  readonly diagnostics: readonly AnkhMetadataDiscoveryDiagnostic[];
  readonly packages: readonly AnkhDiscoveredPackage[];
}

export interface DiscoverAnkhPackagesOptions {
  readonly cwd: string;
}

interface DiscoveryCandidate {
  readonly packageJsonPath: string;
  readonly source: AnkhDiscoverySource;
}

export async function discoverAnkhPackages(
  options: DiscoverAnkhPackagesOptions,
): Promise<AnkhMetadataDiscoveryResult> {
  const roots = await findWorkspaceRoots(options.cwd);
  const candidates = await collectDiscoveryCandidates(roots);
  const diagnostics: AnkhMetadataDiscoveryDiagnostic[] = [];
  const packages: AnkhDiscoveredPackage[] = [];
  const seenPackageNames = new Set<string>();

  if (roots.currentPackageRoot === null) {
    diagnostics.push({
      code: "no-current-package-root",
      message:
        "Could not find a package.json above the current working directory while discovering Ankh metadata.",
      severity: "warning",
    });
  }

  for (const candidate of candidates) {
    const readResult = await readAnkhPackageMetadata(candidate);
    diagnostics.push(...readResult.diagnostics);

    if (readResult.packageName !== null) {
      if (seenPackageNames.has(readResult.packageName)) {
        continue;
      }

      seenPackageNames.add(readResult.packageName);
    }

    if (readResult.packageName === null || readResult.metadata === null) {
      continue;
    }

    packages.push({
      metadata: readResult.metadata,
      packageJsonPath: candidate.packageJsonPath,
      packageName: readResult.packageName,
      packageRoot: readResult.packageRoot,
      source: candidate.source,
    });
  }

  diagnostics.push(...collectDuplicateMetadataDiagnostics(packages));

  return {
    diagnostics,
    packages,
  };
}

async function collectDiscoveryCandidates(roots: {
  readonly currentPackageRoot: string | null;
  readonly workspaceRoot: string | null;
}): Promise<readonly DiscoveryCandidate[]> {
  const seenPaths = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];

  if (roots.currentPackageRoot !== null) {
    addCandidate(candidates, seenPaths, {
      packageJsonPath: path.join(roots.currentPackageRoot, "package.json"),
      source: "current-package",
    });
  }

  if (roots.workspaceRoot !== null) {
    const workspacePackageJsonFiles = await findWorkspacePackageJsonFiles(
      roots.workspaceRoot,
    );

    for (const packageJsonPath of workspacePackageJsonFiles) {
      addCandidate(candidates, seenPaths, {
        packageJsonPath,
        source: "workspace",
      });
    }
  }

  const installRoot = roots.workspaceRoot ?? roots.currentPackageRoot;
  if (installRoot !== null) {
    const installedPackageJsonFiles =
      await findInstalledAnkhoragePackageJsonFiles(installRoot);

    for (const packageJsonPath of installedPackageJsonFiles) {
      addCandidate(candidates, seenPaths, {
        packageJsonPath,
        source: "installed-dependency",
      });
    }
  }

  return candidates;
}

function addCandidate(
  candidates: DiscoveryCandidate[],
  seenPaths: Set<string>,
  candidate: DiscoveryCandidate,
): void {
  const normalizedPath = path.resolve(candidate.packageJsonPath);
  if (seenPaths.has(normalizedPath)) {
    return;
  }

  seenPaths.add(normalizedPath);
  candidates.push({
    packageJsonPath: normalizedPath,
    source: candidate.source,
  });
}

function collectDuplicateMetadataDiagnostics(
  packages: readonly AnkhDiscoveredPackage[],
): readonly AnkhMetadataDiscoveryDiagnostic[] {
  const diagnostics: AnkhMetadataDiscoveryDiagnostic[] = [];
  const categories = new Map<string, AnkhDiscoveredPackage>();
  const capabilities = new Map<string, AnkhDiscoveredPackage>();

  for (const discoveredPackage of packages) {
    const existingCategoryOwner = categories.get(
      discoveredPackage.metadata.category,
    );
    if (existingCategoryOwner !== undefined) {
      diagnostics.push({
        code: "duplicate-ankh-category",
        message: `Discovered duplicate Ankh category "${discoveredPackage.metadata.category}" in ${discoveredPackage.packageName}; already claimed by ${existingCategoryOwner.packageName}.`,
        packageJsonPath: discoveredPackage.packageJsonPath,
        packageName: discoveredPackage.packageName,
        severity: "warning",
        source: discoveredPackage.source,
      });
    } else {
      categories.set(discoveredPackage.metadata.category, discoveredPackage);
    }

    for (const capability of discoveredPackage.metadata.capabilities) {
      const existingCapabilityOwner = capabilities.get(capability);
      if (existingCapabilityOwner !== undefined) {
        diagnostics.push({
          code: "duplicate-ankh-capability",
          message: `Discovered duplicate Ankh capability "${capability}" in ${discoveredPackage.packageName}; already claimed by ${existingCapabilityOwner.packageName}.`,
          packageJsonPath: discoveredPackage.packageJsonPath,
          packageName: discoveredPackage.packageName,
          severity: "warning",
          source: discoveredPackage.source,
        });
        continue;
      }

      capabilities.set(capability, discoveredPackage);
    }
  }

  return diagnostics;
}

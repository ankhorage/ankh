import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

export interface WorkspaceRoots {
  readonly currentPackageRoot: string | null;
  readonly workspaceRoot: string | null;
}

export async function findWorkspaceRoots(cwd: string): Promise<WorkspaceRoots> {
  const directories = getAncestorDirectories(cwd);

  let currentPackageRoot: string | null = null;
  let workspaceRoot: string | null = null;

  for (const directory of directories) {
    const packageJson = await readPackageJson(directory);
    if (currentPackageRoot === null && packageJson !== null) {
      currentPackageRoot = directory;
    }

    if (
      workspaceRoot === null &&
      (hasWorkspaceField(packageJson) ||
        (await fileExists(path.join(directory, 'pnpm-workspace.yaml'))))
    ) {
      workspaceRoot = directory;
    }

    if (currentPackageRoot !== null && workspaceRoot !== null) {
      break;
    }
  }

  return {
    currentPackageRoot,
    workspaceRoot,
  };
}

export async function findWorkspacePackageJsonFiles(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const workspacePatterns = await getWorkspacePatterns(workspaceRoot);
  const packageJsonPaths = new Set<string>();

  for (const workspacePattern of workspacePatterns) {
    const normalizedPattern = normalizeWorkspacePattern(workspacePattern);
    const packageJsonPattern = path.posix.join(normalizedPattern, 'package.json');
    const glob = new Bun.Glob(packageJsonPattern);

    for await (const relativePath of glob.scan({
      absolute: false,
      cwd: workspaceRoot,
    })) {
      packageJsonPaths.add(path.join(workspaceRoot, relativePath));
    }
  }

  return [...packageJsonPaths].sort();
}

export async function findInstalledAnkhoragePackageJsonFiles(
  packageRoot: string,
): Promise<readonly string[]> {
  const scopeRoot = path.join(packageRoot, 'node_modules', '@ankhorage');

  let entries: readonly string[];
  try {
    entries = (await readdir(scopeRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const packageJsonPaths: string[] = [];
  for (const entry of entries) {
    const packageJsonPath = path.join(scopeRoot, entry, 'package.json');
    if (await fileExists(packageJsonPath)) {
      packageJsonPaths.push(packageJsonPath);
    }
  }

  return packageJsonPaths;
}

async function getWorkspacePatterns(workspaceRoot: string): Promise<readonly string[]> {
  const packageJson = await readPackageJson(workspaceRoot);
  const packageJsonPatterns = getPatternsFromPackageJson(packageJson);
  if (packageJsonPatterns.length > 0) {
    return packageJsonPatterns;
  }

  const pnpmWorkspacePath = path.join(workspaceRoot, 'pnpm-workspace.yaml');
  if (!(await fileExists(pnpmWorkspacePath))) {
    return [];
  }

  const rawYaml = await readFile(pnpmWorkspacePath, 'utf8');
  const parsedYaml = parseYaml(rawYaml) as unknown;
  if (!isRecord(parsedYaml) || !Array.isArray(parsedYaml.packages)) {
    return [];
  }

  const patterns: string[] = [];
  for (const value of parsedYaml.packages) {
    if (typeof value === 'string' && value.trim() !== '') {
      patterns.push(value.trim());
    }
  }

  return patterns;
}

function getPatternsFromPackageJson(
  packageJson: Record<string, unknown> | null,
): readonly string[] {
  if (packageJson === null) {
    return [];
  }

  const rawWorkspaces = packageJson.workspaces;
  if (Array.isArray(rawWorkspaces)) {
    return rawWorkspaces
      .filter((workspacePattern): workspacePattern is string => {
        return typeof workspacePattern === 'string' && workspacePattern.trim() !== '';
      })
      .map((workspacePattern) => workspacePattern.trim());
  }

  if (isRecord(rawWorkspaces) && Array.isArray(rawWorkspaces.packages)) {
    return rawWorkspaces.packages
      .filter((workspacePattern): workspacePattern is string => {
        return typeof workspacePattern === 'string' && workspacePattern.trim() !== '';
      })
      .map((workspacePattern) => workspacePattern.trim());
  }

  return [];
}

function hasWorkspaceField(packageJson: Record<string, unknown> | null): boolean {
  return getPatternsFromPackageJson(packageJson).length > 0;
}

async function readPackageJson(directory: string): Promise<Record<string, unknown> | null> {
  const packageJsonPath = path.join(directory, 'package.json');

  try {
    const rawText = await readFile(packageJsonPath, 'utf8');
    const parsedJson = JSON.parse(rawText) as unknown;
    return isRecord(parsedJson) ? parsedJson : null;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function getAncestorDirectories(cwd: string): readonly string[] {
  const directories: string[] = [];
  let currentDirectory = path.resolve(cwd);

  for (;;) {
    directories.push(currentDirectory);
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }

  return directories;
}

function normalizeWorkspacePattern(workspacePattern: string): string {
  const posixPattern = workspacePattern.replaceAll(path.sep, path.posix.sep);
  return posixPattern.endsWith('/') ? posixPattern.slice(0, -1) : posixPattern;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

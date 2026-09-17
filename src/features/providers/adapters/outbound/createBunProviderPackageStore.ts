import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AnkhDiscoveredPackage } from '../../../../discovery.js';
import { readAnkhPackageMetadata } from '../../../../packageMetadata.js';
import type { AnkhProviderCatalogEntry } from '../../../../types/providers.js';
import type { ProviderPackageStore } from '../../application/ports/outbound/providerPackageStore.js';

interface ProcessResult {
  readonly exitCode: number;
  readonly stderr: string;
}

interface CreateBunProviderPackageStoreOptions {
  readonly bunExecutable?: string;
  readonly cacheRoot: string;
  readonly runProcessAsync?: (executable: string, args: readonly string[]) => Promise<ProcessResult>;
}

/*** Create the provider package cache backed by Bun package installation. */
export function createBunProviderPackageStore(
  options: CreateBunProviderPackageStoreOptions,
): ProviderPackageStore {
  const runProcessAsync = options.runProcessAsync ?? runProcess;
  const bunExecutable = options.bunExecutable ?? process.execPath;

  return {
    async resolveAsync(entry) {
      const cached = await readCachedProviderAsync(options.cacheRoot, entry);
      if (cached !== null) return cached;

      await ensureCacheProjectAsync(options.cacheRoot);
      const packageSpec = `${entry.packageName}@${entry.version}`;
      const result = await runProcessAsync(bunExecutable, [
        'add',
        '--cwd',
        options.cacheRoot,
        '--exact',
        '--omit=peer',
        '--silent',
        '--no-progress',
        '--no-summary',
        packageSpec,
      ]);
      if (result.exitCode !== 0) {
        throw new Error(
          `Could not cache ${packageSpec}${result.stderr === '' ? '.' : `: ${result.stderr.trim()}`}`,
        );
      }

      const installed = await readCachedProviderAsync(options.cacheRoot, entry);
      if (installed === null) {
        throw new Error(
          `${packageSpec} was installed but did not expose the expected Ankh provider metadata.`,
        );
      }
      return installed;
    },
  };
}

/*** Read and validate an exact provider version already present in the Ankh package cache. */
async function readCachedProviderAsync(
  cacheRoot: string,
  entry: AnkhProviderCatalogEntry,
): Promise<AnkhDiscoveredPackage | null> {
  const packageRoot = path.join(cacheRoot, 'node_modules', ...entry.packageName.split('/'));
  const packageJsonPath = path.join(packageRoot, 'package.json');

  let rawPackage: unknown;
  try {
    rawPackage = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!isRecord(rawPackage) || rawPackage.version !== entry.version) return null;

  const readResult = await readAnkhPackageMetadata({
    packageJsonPath,
    source: 'installed-dependency',
  });
  if (
    readResult.packageName !== entry.packageName ||
    readResult.metadata === null ||
    readResult.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ||
    !metadataMatchesCatalog(readResult.metadata, entry)
  ) {
    return null;
  }

  return {
    metadata: readResult.metadata,
    packageJsonPath,
    packageName: entry.packageName,
    packageRoot,
    source: 'installed-dependency',
  };
}

/*** Ensure the private provider-cache directory is a valid Bun package project. */
async function ensureCacheProjectAsync(cacheRoot: string): Promise<void> {
  const packageJsonPath = path.join(cacheRoot, 'package.json');
  await mkdir(cacheRoot, { recursive: true });

  try {
    await readFile(packageJsonPath, 'utf8');
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
    await writeFile(
      packageJsonPath,
      `${JSON.stringify({ name: 'ankh-provider-cache', private: true }, null, 2)}\n`,
      'utf8',
    );
  }
}

/*** Run Bun and capture installation errors without forwarding package-manager noise to the CLI. */
function runProcess(executable: string, args: readonly string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

/*** Verify cached package metadata still matches the remotely declared catalog contract. */
function metadataMatchesCatalog(
  metadata: AnkhDiscoveredPackage['metadata'],
  entry: AnkhProviderCatalogEntry,
): boolean {
  return (
    metadata.category === entry.metadata.category &&
    metadata.provider === entry.metadata.provider &&
    JSON.stringify(metadata.capabilities) === JSON.stringify(entry.metadata.capabilities)
  );
}

/*** Narrow an unknown value to a Node filesystem error. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

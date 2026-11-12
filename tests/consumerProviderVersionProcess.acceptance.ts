import { deepEqual, equal, fail, match, notEqual } from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPOSITORY_ROOT = path.dirname(import.meta.dir);
const PROVIDER = { category: 'doctor', packageName: '@ankhorage/doctor' } as const;
const DOCTOR_USAGE = /^Usage:\n\n {2}ankh doctor <command>$/mu;
const DOCTOR_COMMANDS = ['fix', 'package', 'repo', 'validate'] as const;

const root = await mkdtemp(path.join(tmpdir(), 'ankh-published-provider-'));
const cache = path.join(root, 'ankh-cache');
const bunCache = path.join(root, 'bun-cache');

try {
  const versions = await resolveCompatiblePublishedVersionsAsync();
  const first = await createConsumerAsync('first', versions.first);
  await expectSuccessAsync(first, versions.first);
  await expectCacheVersionAsync(versions.first);
  await expectNewerCatalogVersionAsync(versions.first);

  await expectSuccessAsync(first, versions.first);

  const second = await createConsumerAsync('second', versions.second);
  await expectSuccessAsync(second, versions.second);
  await expectCacheVersionAsync(versions.second);

  await expectSuccessAsync(first, versions.first);

  await expectFailureAsync('malformed', '26.0', 'unsupported version');
  await expectFailureAsync(
    'range',
    `^${versions.first}`,
    'requires an installed compatible exact version',
  );
  await expectFailureAsync('unpublished', '999.999.999', 'does not exist');
  await expectInvalidManifestFailureAsync();
  await expectInvalidProviderManifestFailureAsync(first, versions.first);
} finally {
  await rm(root, { force: true, recursive: true });
}

/*** Select two distinct published releases that retain the current provider contract. */
async function resolveCompatiblePublishedVersionsAsync(): Promise<{
  readonly first: string;
  readonly second: string;
}> {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(PROVIDER.packageName)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    throw new Error(`Could not read published provider versions (HTTP ${response.status}).`);
  }
  const document = await response.json();
  if (!isRecord(document) || !isRecord(document.versions) || !isRecord(document['dist-tags'])) {
    throw new Error(`npm returned invalid package metadata for ${PROVIDER.packageName}.`);
  }
  const { latest } = document['dist-tags'];
  if (typeof latest !== 'string' || !isExactVersion(latest)) {
    throw new Error(`npm returned no exact latest version for ${PROVIDER.packageName}.`);
  }
  const latestManifest = readProviderManifest(findRecordValue(document.versions, latest));
  const compatibleVersions = Object.entries(document.versions)
    .filter(
      ([version, manifest]) => isExactVersion(version) && manifestsMatch(manifest, latestManifest),
    )
    .map(([version]) => version)
    .sort(compareVersionsDescending);
  const [second, first] = compatibleVersions;
  if (first === undefined || second === undefined) {
    throw new Error(
      `Expected two compatible published releases of ${PROVIDER.packageName} for version-resolution acceptance.`,
    );
  }
  return { first, second };
}

/*** Create one consumer project that pins an exact published provider release. */
async function createConsumerAsync(name: string, version: string): Promise<string> {
  const cwd = path.join(root, name);
  await mkdir(cwd, { recursive: true });
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ dependencies: { [PROVIDER.packageName]: version }, name, private: true }, null, 2)}\n`,
  );
  return cwd;
}

/*** Run the current built CLI from an isolated consumer working directory. */
async function runAsync(
  cwd: string,
): Promise<{ readonly code: number; readonly stderr: string; readonly stdout: string }> {
  const child = spawn(
    process.execPath,
    [path.join(REPOSITORY_ROOT, 'dist', 'bin.js'), PROVIDER.category, '--help'],
    {
      cwd,
      env: { ...process.env, ANKH_CACHE_DIR: cache, BUN_INSTALL_CACHE_DIR: bunCache },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return await new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Ankh ${PROVIDER.category} --help timed out from ${cwd}.`));
    }, 120_000);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({
        code: code ?? 1,
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      });
    });
  });
}

/*** Prove the selected release loads its valid provider manifest through the CLI boundary. */
async function expectSuccessAsync(cwd: string, version: string): Promise<void> {
  const result = await runAsync(cwd);
  equal(result.code, 0, result.stderr);
  expectProviderHelp(result.stdout);
  await expectCacheVersionAsync(version);
}

/*** Verify each release has an isolated exact-version private provider cache project. */
async function expectCacheVersionAsync(version: string): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(
      path.join(
        cache,
        'providers',
        'packages',
        ...PROVIDER.packageName.split('/'),
        version,
        'node_modules',
        ...PROVIDER.packageName.split('/'),
        'package.json',
      ),
      'utf8',
    ),
  ) as { readonly name?: unknown; readonly version?: unknown };
  equal(packageJson.name, PROVIDER.packageName);
  equal(packageJson.version, version);
}

/*** Confirm a consumer pin is never substituted with the catalog's latest release. */
async function expectNewerCatalogVersionAsync(selectedVersion: string): Promise<void> {
  const catalog = JSON.parse(
    await readFile(path.join(cache, 'provider-catalog-v2.json'), 'utf8'),
  ) as {
    readonly entries?: readonly { readonly packageName?: unknown; readonly version?: unknown }[];
  };
  const provider = catalog.entries?.find((entry) => entry.packageName === PROVIDER.packageName);
  if (provider === undefined || typeof provider.version !== 'string') {
    fail(`${PROVIDER.packageName} is missing from the remote provider catalog.`);
  }
  notEqual(provider.version, selectedVersion);
}

/*** Verify invalid or unavailable consumer selections fail without success output or cache artifacts. */
async function expectFailureAsync(name: string, version: string, expected: string): Promise<void> {
  const cwd = await createConsumerAsync(name, version);
  const result = await runAsync(cwd);
  equal(result.code, 1);
  match(result.stderr, new RegExp(expected, 'u'));
  expectNoProviderHelp(result.stdout);
  await expectNoCachedProviderAsync(version);
}

/*** Verify malformed consumer package metadata fails before any provider is materialized. */
async function expectInvalidManifestFailureAsync(): Promise<void> {
  const cwd = path.join(root, 'invalid-manifest');
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, 'package.json'), '[]\n');
  const result = await runAsync(cwd);
  equal(result.code, 1);
  match(result.stderr, /must be a JSON object/u);
  expectNoProviderHelp(result.stdout);
}

/*** Verify an installed provider with an invalid command manifest cannot report successful help. */
async function expectInvalidProviderManifestFailureAsync(
  cwd: string,
  version: string,
): Promise<void> {
  const providerModulePath = path.join(
    cache,
    'providers',
    'packages',
    ...PROVIDER.packageName.split('/'),
    version,
    'node_modules',
    ...PROVIDER.packageName.split('/'),
    'dist',
    'cli',
    'index.js',
  );
  await writeFile(providerModulePath, 'export default {};\n');
  const result = await runAsync(cwd);
  equal(result.code, 1);
  match(result.stderr, /Ankh provider manifest diagnostics/u);
  match(result.stderr, /invalid-provider-id/u);
  expectNoProviderHelp(result.stdout);
}

/*** Ensure a rejected version does not leave a package cache at its requested identity. */
async function expectNoCachedProviderAsync(version: string): Promise<void> {
  const packageJsonPath = path.join(
    cache,
    'providers',
    'packages',
    ...PROVIDER.packageName.split('/'),
    version,
    'node_modules',
    ...PROVIDER.packageName.split('/'),
    'package.json',
  );
  await readFile(packageJsonPath, 'utf8').then(
    () =>
      fail(
        `Expected no cached ${PROVIDER.packageName}@${version} after provider resolution failure.`,
      ),
    (error: unknown) => {
      if (!(error instanceof Error) || !('code' in error)) fail('Expected an ENOENT error.');
      equal(error.code, 'ENOENT');
    },
  );
}

/*** Verify the published Doctor provider exposes its public category-help contract. */
function expectProviderHelp(stdout: string): void {
  match(stdout, DOCTOR_USAGE);
  match(stdout, /^Commands:\n$/mu);
  for (const command of DOCTOR_COMMANDS) {
    match(stdout, new RegExp(`^ {2}${command}\\b`, 'mu'));
  }
}

/*** Ensure failure paths do not present Doctor usage or commands as a successful result. */
function expectNoProviderHelp(stdout: string): void {
  if (
    DOCTOR_USAGE.test(stdout) ||
    /^Commands:\n\n {2}(?:fix|package|repo|validate)\b/mu.test(stdout)
  ) {
    fail(`Expected no successful ${PROVIDER.category} provider help after failure.`);
  }
}

/*** Read the provider manifest fields that must match for cached-version compatibility. */
function readProviderManifest(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.ankh)) {
    throw new Error(`npm returned invalid provider metadata for ${PROVIDER.packageName}.`);
  }
  return value.ankh;
}

/*** Compare JSON-compatible provider manifests without depending on registry property ordering. */
function manifestsMatch(value: unknown, expected: Record<string, unknown>): boolean {
  try {
    deepEqual(readProviderManifest(value), expected);
    return true;
  } catch {
    return false;
  }
}

/*** Read a named JSON-object value without permitting an unchecked property lookup. */
function findRecordValue(record: Record<string, unknown>, name: string): unknown {
  return Object.entries(record).find(([key]) => key === name)?.[1];
}

/*** Compare registry semver releases from newest to oldest. */
function compareVersionsDescending(left: string, right: string): number {
  const [leftMajor, leftMinor, leftPatch] = left.split('.').map(Number);
  const [rightMajor, rightMinor, rightPatch] = right.split('.').map(Number);
  for (const [rightPart, leftPart] of [
    [rightMajor, leftMajor],
    [rightMinor, leftMinor],
    [rightPatch, leftPatch],
  ]) {
    const difference = (rightPart ?? 0) - (leftPart ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/*** Recognize the stable releases suitable for this published-provider acceptance. */
function isExactVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value);
}

/*** Narrow npm registry values to JSON objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

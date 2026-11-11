import { deepEqual, equal, fail, match, notEqual } from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPOSITORY_ROOT = path.dirname(import.meta.dir);
const PACKAGE_NAME = '@ankhorage/zora';
const FIRST_VERSION = '26.0.1';
const SECOND_VERSION = '26.0.2';

const root = await mkdtemp(path.join(tmpdir(), 'ankh-published-provider-'));
const cache = path.join(root, 'ankh-cache');
const bunCache = path.join(root, 'bun-cache');

try {
  const first = await createConsumerAsync('first', FIRST_VERSION);
  await expectSuccessAsync(first, FIRST_VERSION);

  const ranged = await createInstalledConsumerAsync('range', '^26.0.0', FIRST_VERSION);
  await expectSuccessAsync(ranged, FIRST_VERSION);
  await expectCacheVersionAsync(FIRST_VERSION);
  await expectNewerCatalogVersionAsync(FIRST_VERSION);

  await expectSuccessAsync(first, FIRST_VERSION);

  const second = await createConsumerAsync('second', SECOND_VERSION);
  await expectSuccessAsync(second, SECOND_VERSION);
  await expectCacheVersionAsync(SECOND_VERSION);

  await expectSuccessAsync(first, FIRST_VERSION);

  await expectFailureAsync('malformed', '26.0', 'Could not read installed');
  await expectFailureAsync('unpublished', '99.99.99', 'does not exist');
  await expectInvalidManifestFailureAsync();
} finally {
  await rm(root, { force: true, recursive: true });
}

/*** Create one real consumer project that explicitly pins a published ZORA release. */
async function createConsumerAsync(name: string, version: string): Promise<string> {
  const cwd = path.join(root, name);
  await mkdir(cwd, { recursive: true });
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ dependencies: { [PACKAGE_NAME]: version }, name, private: true }, null, 2)}\n`,
  );
  await writeFile(
    path.join(cwd, 'zora.web.json'),
    `${JSON.stringify({ components: ['button'], schemaVersion: 1 })}\n`,
  );
  return cwd;
}

/*** Create a ranged consumer with a concrete package installation confirmed by its Bun lockfile. */
async function createInstalledConsumerAsync(
  name: string,
  dependencyRange: string,
  installedVersion: string,
): Promise<string> {
  const cwd = await createConsumerAsync(name, dependencyRange);
  const packageRoot = path.join(cwd, 'node_modules', ...PACKAGE_NAME.split('/'));
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify({ name: PACKAGE_NAME, version: installedVersion })}\n`,
  );
  await writeFile(
    path.join(cwd, 'bun.lock'),
    `${JSON.stringify({ packages: { [PACKAGE_NAME]: [`${PACKAGE_NAME}@${installedVersion}`] } })}\n`,
  );
  return cwd;
}

/*** Run the current built CLI from its consumer process working directory. */
async function runAsync(
  cwd: string,
): Promise<{ readonly code: number; readonly stderr: string; readonly stdout: string }> {
  const child = spawn(
    process.execPath,
    [path.join(REPOSITORY_ROOT, 'dist', 'bin.js'), 'zora', 'sync', '--web'],
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
      reject(new Error(`Ankh zora sync --web timed out from ${cwd}.`));
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

/*** Prove the exact selected release generated valid output without catalog substitution. */
async function expectSuccessAsync(cwd: string, version: string): Promise<void> {
  const result = await runAsync(cwd);
  equal(result.code, 0, result.stderr);
  match(result.stdout, /Synchronized 1 ZORA web component/u);
  const output = JSON.parse(
    await readFile(path.join(cwd, '.ankh', 'zora', 'web', 'materialization.json'), 'utf8'),
  ) as { readonly components?: unknown; readonly files?: unknown; readonly ownerVersion?: unknown };
  equal(output.ownerVersion, version);
  deepEqual(output.components, ['button']);
  if (!Array.isArray(output.files) || !output.files.includes('components/button/index.js'))
    fail('Missing generated button artifact.');
}

/*** Verify each release lives in its own exact-version private provider cache project. */
async function expectCacheVersionAsync(version: string): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(
      path.join(
        cache,
        'providers',
        'packages',
        '@ankhorage',
        'zora',
        version,
        'node_modules',
        '@ankhorage',
        'zora',
        'package.json',
      ),
      'utf8',
    ),
  ) as { readonly name?: unknown; readonly version?: unknown };
  equal(packageJson.name, PACKAGE_NAME);
  equal(packageJson.version, version);
}

/*** Confirm the remotely advertised catalog version was not substituted for the consumer pin. */
async function expectNewerCatalogVersionAsync(selectedVersion: string): Promise<void> {
  const catalog = JSON.parse(
    await readFile(path.join(cache, 'provider-catalog-v2.json'), 'utf8'),
  ) as {
    readonly entries?: readonly { readonly packageName?: unknown; readonly version?: unknown }[];
  };
  const zora = catalog.entries?.find((entry) => entry.packageName === PACKAGE_NAME);
  if (zora === undefined) fail('ZORA is missing from the remote provider catalog.');
  notEqual(zora.version, selectedVersion);
}

/*** Verify unsupported or unavailable pins fail without materializing the catalog release. */
async function expectFailureAsync(name: string, version: string, expected: string): Promise<void> {
  const cwd = await createConsumerAsync(name, version);
  const result = await runAsync(cwd);
  equal(result.code, 1);
  match(result.stderr, new RegExp(expected, 'u'));
  await expectNoMaterializationAsync(cwd);
}

/*** Verify malformed consumer metadata fails through the same process boundary. */
async function expectInvalidManifestFailureAsync(): Promise<void> {
  const cwd = path.join(root, 'invalid-manifest');
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, 'package.json'), '[]\n');
  await writeFile(
    path.join(cwd, 'zora.web.json'),
    `${JSON.stringify({ components: ['button'], schemaVersion: 1 })}\n`,
  );
  const result = await runAsync(cwd);
  equal(result.code, 1);
  match(result.stderr, /must be a JSON object/u);
  await expectNoMaterializationAsync(cwd);
}

/*** Ensure a rejected consumer never leaves false-success materialization evidence. */
async function expectNoMaterializationAsync(cwd: string): Promise<void> {
  await readFile(path.join(cwd, '.ankh', 'zora', 'web', 'materialization.json'), 'utf8').then(
    () => fail('Expected no materialization after provider resolution failure.'),
    (error: unknown) => {
      if (!(error instanceof Error) || !('code' in error)) fail('Expected an ENOENT error.');
      equal(error.code, 'ENOENT');
    },
  );
}

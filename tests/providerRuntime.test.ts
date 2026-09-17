import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AnkhCommandProviderManifest } from '@ankhorage/contracts/cli';
import { afterEach, describe, expect, test } from 'bun:test';

import { runCli } from '../src/cli/index.js';
import type { AnkhCommandContext } from '../src/commandContext.js';
import type { AnkhDiscoveredPackage } from '../src/discovery.js';
import { createBunProviderPackageStore } from '../src/features/providers/adapters/outbound/createBunProviderPackageStore.js';
import { createGitHubProviderCatalogSource } from '../src/features/providers/adapters/outbound/createGitHubProviderCatalogSource.js';
import { resolveProviderCatalogAsync } from '../src/features/providers/application/use-cases/resolveProviderCatalogAsync.js';
import type {
  AnkhProviderCatalogEntry,
  AnkhProviderCatalogSnapshot,
  AnkhProviderRuntime,
} from '../src/types/providers.js';

const temporaryDirectories: string[] = [];

const infraEntry = {
  description: 'Infrastructure provider',
  metadata: {
    capabilities: ['infra.up'],
    category: 'infra',
    provider: './dist/cli/index.js',
  },
  packageName: '@ankhorage/infra',
  repositoryUrl: 'https://github.com/ankhorage/infra',
  version: '7.1.2',
} as const satisfies AnkhProviderCatalogEntry;

const infraManifest = {
  id: '@ankhorage/infra',
  category: 'infra',
  version: '7.1.2',
  capabilities: ['infra.up'],
  commands: [
    {
      path: ['up'],
      capability: 'infra.up',
      summary: 'Bring infrastructure up',
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

describe('official provider runtime', () => {
  test('reuses a fresh catalog cache without touching the remote source', async () => {
    const snapshot: AnkhProviderCatalogSnapshot = {
      cachedAtMs: 10_000,
      entries: [infraEntry],
    };
    let sourceReads = 0;

    const catalog = await resolveProviderCatalogAsync({
      nowMs: 10_500,
      source: {
        readAsync() {
          sourceReads += 1;
          return Promise.resolve([]);
        },
      },
      store: {
        readAsync: () => Promise.resolve(snapshot),
        writeAsync: () => Promise.resolve(),
      },
      ttlMs: 1_000,
    });

    expect(catalog).toEqual({ entries: [infraEntry] });
    expect(sourceReads).toBe(0);
  });

  test('falls back to a stale catalog when GitHub is temporarily unavailable', async () => {
    const snapshot: AnkhProviderCatalogSnapshot = {
      cachedAtMs: 1_000,
      entries: [infraEntry],
    };

    const catalog = await resolveProviderCatalogAsync({
      nowMs: 10_000,
      source: {
        readAsync() {
          return Promise.reject(new Error('offline'));
        },
      },
      store: {
        readAsync: () => Promise.resolve(snapshot),
        writeAsync: () => Promise.resolve(),
      },
      ttlMs: 1_000,
    });

    expect(catalog).toEqual({ entries: [infraEntry] });
  });

  test('discovers provider metadata dynamically from GitHub repository package manifests', async () => {
    const requestedUrls: string[] = [];
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        requestedUrls.push(url);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(
            jsonResponse([
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/infra',
                name: 'infra',
              },
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/runtime',
                name: 'runtime',
              },
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/utility',
                name: 'utility',
              },
            ]),
          );
        }
        if (url.includes('/infra/main/package.json')) {
          return Promise.resolve(
            jsonResponse({
              ankh: infraEntry.metadata,
              description: infraEntry.description,
              name: infraEntry.packageName,
              version: infraEntry.version,
            }),
          );
        }
        if (url.includes('/runtime/main/package.json')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: [],
                category: 'runtime',
                provider: null,
              },
              description: 'Platform-neutral runtime',
              name: '@ankhorage/runtime',
              version: '2.3.1',
            }),
          );
        }
        return Promise.resolve(jsonResponse({ name: '@ankhorage/utility', version: '1.2.0' }));
      },
    });

    expect(await source.readAsync()).toEqual([infraEntry]);
    expect(requestedUrls.some((url) => url.includes('/infra/main/package.json'))).toBeTrue();
    expect(requestedUrls.some((url) => url.includes('/runtime/main/package.json'))).toBeTrue();
    expect(requestedUrls.some((url) => url.includes('/utility/main/package.json'))).toBeTrue();
  });

  test('infers a CLI provider from ./cli when provider metadata is null', async () => {
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(
            jsonResponse([
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/inferred',
                name: 'inferred',
              },
            ]),
          );
        }
        return Promise.resolve(
          jsonResponse({
            ankh: {
              capabilities: ['inferred.run'],
              category: 'inferred',
              provider: null,
            },
            exports: {
              './cli': './dist/cli/index.js',
            },
            name: '@ankhorage/inferred',
            version: '1.0.0',
          }),
        );
      },
    });

    expect(await source.readAsync()).toEqual([
      {
        description: '@ankhorage/inferred',
        metadata: {
          capabilities: ['inferred.run'],
          category: 'inferred',
          provider: './dist/cli/index.js',
        },
        packageName: '@ankhorage/inferred',
        repositoryUrl: 'https://github.com/ankhorage/inferred',
        version: '1.0.0',
      },
    ]);
  });

  test('rejects malformed non-null provider declarations', async () => {
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(
            jsonResponse([
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/broken',
                name: 'broken',
              },
            ]),
          );
        }
        return Promise.resolve(
          jsonResponse({
            ankh: {
              capabilities: ['broken.run'],
              category: 'broken',
              provider: 'dist/cli/index.js',
            },
            name: '@ankhorage/broken',
            version: '1.0.0',
          }),
        );
      },
    });

    expect(source.readAsync()).rejects.toThrow(
      '@ankhorage/broken package.json.ankh.provider must be null or a package-relative path.',
    );
  });

  test('renders cwd-independent root help without installing provider packages', async () => {
    let packageResolutions = 0;
    const providerRuntime: AnkhProviderRuntime = {
      resolveCatalogAsync: () => Promise.resolve({ entries: [infraEntry] }),
      resolvePackageAsync() {
        packageResolutions += 1;
        return Promise.reject(new Error('root help must not install providers'));
      },
    };
    const first = memoryContext('/one/project');
    const second = memoryContext('/completely/different/project');

    expect((await runCli(['--help'], { context: first.context, providerRuntime })).exitCode).toBe(
      0,
    );
    expect((await runCli(['-h'], { context: second.context, providerRuntime })).exitCode).toBe(0);
    expect(first.stdout.value).toBe(second.stdout.value);
    expect(first.stdout.value).toContain('infra');
    expect(first.stdout.value).toContain(infraEntry.repositoryUrl);
    expect(first.stdout.value.endsWith('\n\n')).toBeTrue();
    expect(packageResolutions).toBe(0);
  });

  test('resolves only the selected provider package and leaves a blank line after category help', async () => {
    const discoveredPackage = providerPackage('/cache/providers');
    const providerRuntime: AnkhProviderRuntime = {
      resolveCatalogAsync: () => Promise.resolve({ entries: [infraEntry] }),
      resolvePackageAsync: () => Promise.resolve(discoveredPackage),
    };
    const run = memoryContext('/irrelevant');

    const result = await runCli(['infra', '--help'], {
      context: run.context,
      providerRuntime,
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [],
          providers: [
            {
              discoveredPackage,
              manifest: infraManifest,
              providerModuleDefaultExport: infraManifest,
              providerModulePath: '/cache/providers/dist/cli/index.js',
              providerModuleUrl: 'file:///cache/providers/dist/cli/index.js',
            },
          ],
        }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(run.stdout.value).toContain('ankh infra <command>');
    expect(run.stdout.value.endsWith('\n\n')).toBeTrue();
    expect(run.stderr.value).toBe('');
  });

  test('installs a missing exact provider version into the private Bun cache once', async () => {
    const cacheRoot = await createTemporaryDirectory();
    let installs = 0;
    const store = createBunProviderPackageStore({
      bunExecutable: '/fake/bun',
      cacheRoot,
      async runProcessAsync(executable, args) {
        installs += 1;
        expect(executable).toBe('/fake/bun');
        expect(args).toContain('--omit=peer');
        expect(args).toContain(`${infraEntry.packageName}@${infraEntry.version}`);
        await writeCachedProviderPackage(cacheRoot);
        return { exitCode: 0, stderr: '' };
      },
    });

    const first = await store.resolveAsync(infraEntry);
    const second = await store.resolveAsync(infraEntry);

    expect(first.packageName).toBe(infraEntry.packageName);
    expect(second.packageRoot).toBe(first.packageRoot);
    expect(installs).toBe(1);
  });
});

/*** Convert one Fetch request target to its URL without object default stringification. */
function readRequestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/*** Create a JSON HTTP response for catalog adapter tests. */
function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

/*** Create a minimal cached provider package matching the remote catalog entry. */
async function writeCachedProviderPackage(cacheRoot: string): Promise<void> {
  const packageRoot = path.join(cacheRoot, 'node_modules', '@ankhorage', 'infra');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify(
      {
        ankh: infraEntry.metadata,
        name: infraEntry.packageName,
        version: infraEntry.version,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

/*** Create a temporary provider cache directory owned by one test. */
async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ankh-provider-runtime-'));
  temporaryDirectories.push(directory);
  return directory;
}

/*** Create the resolved package shape consumed by the existing provider-manifest loader. */
function providerPackage(packageRoot: string): AnkhDiscoveredPackage {
  return {
    metadata: infraEntry.metadata,
    packageJsonPath: path.join(packageRoot, 'package.json'),
    packageName: infraEntry.packageName,
    packageRoot,
    source: 'installed-dependency',
  };
}

/*** Create an isolated command context for cwd-independence assertions. */
function memoryContext(cwd: string): {
  readonly context: AnkhCommandContext;
  readonly stdout: { value: string };
  readonly stderr: { value: string };
} {
  const stdout = { value: '' };
  const stderr = { value: '' };
  return {
    context: {
      cwd,
      env: { ANKH_CACHE_DIR: '/tmp/ignored-ankh-cache' },
      version: '9.9.9',
      writeStdout(text) {
        stdout.value += text;
      },
      writeStderr(text) {
        stderr.value += text;
      },
    },
    stdout,
    stderr,
  };
}

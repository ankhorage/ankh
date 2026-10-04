import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCapabilities } from './capabilityFixture.js';

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
import { createCapabilities } from './capabilityFixture.js';

const temporaryDirectories: string[] = [];

const infraEntry = {
  description: 'Infrastructure provider',
  metadata: {
    capabilities: createCapabilities(['fixture.up']),
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
  capabilities: createCapabilities(['fixture.up']),
  commands: [
    {
      path: ['up'],
      capability: 'fixture.up',
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

  test('discovers candidate packages from GitHub and provider metadata from npm', async () => {
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
          return Promise.resolve(jsonResponse({ name: infraEntry.packageName, version: '99.0.0' }));
        }
        if (url.includes('/runtime/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/runtime', version: '99.0.0' }));
        }
        if (url.includes('/utility/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/utility', version: '99.0.0' }));
        }
        if (url.includes('%40ankhorage%2Finfra/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: infraEntry.metadata,
              description: infraEntry.description,
              name: infraEntry.packageName,
              version: infraEntry.version,
            }),
          );
        }
        if (url.includes('%40ankhorage%2Fruntime/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: createCapabilities([]),
                category: 'runtime',
                provider: null,
              },
              description: 'Platform-neutral runtime',
              name: '@ankhorage/runtime',
              version: '2.3.1',
            }),
          );
        }
        if (url.includes('%40ankhorage%2Futility/latest')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/utility', version: '1.2.0' }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect(await source.readAsync()).toEqual([infraEntry]);
    expect(requestedUrls.some((url) => url.includes('/infra/main/package.json'))).toBeTrue();
    expect(requestedUrls.some((url) => url.includes('%40ankhorage%2Finfra/latest'))).toBeTrue();
  });

  test('allows multiple provider packages to advertise the same canonical capability', async () => {
    const sharedCapabilities = createCapabilities(['fixture.shared']);
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
                html_url: 'https://github.com/ankhorage/fixture-a',
                name: 'fixture-a',
              },
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/fixture-b',
                name: 'fixture-b',
              },
            ]),
          );
        }
        if (url.includes('/fixture-a/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/fixture-a' }));
        }
        if (url.includes('/fixture-b/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/fixture-b' }));
        }
        if (url.includes('%40ankhorage%2Ffixture-a/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: sharedCapabilities,
                category: 'fixture-a',
                provider: './dist/cli/index.js',
              },
              description: 'Fixture provider A',
              name: '@ankhorage/fixture-a',
              version: '1.0.0',
            }),
          );
        }
        if (url.includes('%40ankhorage%2Ffixture-b/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: sharedCapabilities,
                category: 'fixture-b',
                provider: './dist/cli/index.js',
              },
              description: 'Fixture provider B',
              name: '@ankhorage/fixture-b',
              version: '1.0.0',
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect((await source.readAsync()).map((entry) => entry.packageName)).toEqual([
      '@ankhorage/fixture-a',
      '@ankhorage/fixture-b',
    ]);
  });

  test('excludes a remote package with legacy capability strings while retaining valid providers', async () => {
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(
            jsonResponse([githubRepository('legacy'), githubRepository('valid')]),
          );
        }
        if (url.includes('/legacy/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/legacy' }));
        }
        if (url.includes('/valid/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/valid' }));
        }
        if (url.includes('%40ankhorage%2Flegacy/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: ['fixture.legacy'],
                category: 'legacy',
                provider: './dist/cli/index.js',
              },
              name: '@ankhorage/legacy',
              version: '1.0.0',
            }),
          );
        }
        if (url.includes('%40ankhorage%2Fvalid/latest')) {
          return Promise.resolve(jsonResponse(remoteProviderPackage('valid')));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect((await source.readAsync()).map((entry) => entry.packageName)).toEqual([
      '@ankhorage/valid',
    ]);
  });

  test('excludes malformed canonical remote capability descriptors', async () => {
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(jsonResponse([githubRepository('malformed')]));
        }
        if (url.includes('/malformed/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/malformed' }));
        }
        if (url.includes('%40ankhorage%2Fmalformed/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: [{ id: 'fixture.malformed' }],
                category: 'malformed',
                provider: './dist/cli/index.js',
              },
              name: '@ankhorage/malformed',
              version: '1.0.0',
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect(await source.readAsync()).toEqual([]);
  });

  test('keeps npm registry failures loud during remote aggregation', () => {
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(jsonResponse([githubRepository('unavailable')]));
        }
        if (url.includes('/unavailable/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/unavailable' }));
        }
        return Promise.resolve(new Response(null, { status: 503 }));
      },
    });

    expect(source.readAsync()).rejects.toThrow(
      'Could not read latest published metadata for @ankhorage/unavailable from npm (HTTP 503).',
    );
  });

  test('rejects duplicate categories between valid remote providers', () => {
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(
            jsonResponse([githubRepository('first'), githubRepository('second')]),
          );
        }
        if (url.includes('/first/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/first' }));
        }
        if (url.includes('/second/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/second' }));
        }
        if (url.includes('%40ankhorage%2Ffirst/latest')) {
          return Promise.resolve(jsonResponse(remoteProviderPackage('first', 'shared')));
        }
        if (url.includes('%40ankhorage%2Fsecond/latest')) {
          return Promise.resolve(jsonResponse(remoteProviderPackage('second', 'shared')));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect(source.readAsync()).rejects.toThrow('Duplicate Ankh category "shared"');
  });

  test('rejects conflicting remote descriptors for the same capability id', () => {
    const [canonical] = createCapabilities(['fixture.shared']);
    if (canonical === undefined) throw new Error('Expected fixture capability.');

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
                html_url: 'https://github.com/ankhorage/fixture-a',
                name: 'fixture-a',
              },
              {
                archived: false,
                default_branch: 'main',
                fork: false,
                html_url: 'https://github.com/ankhorage/fixture-b',
                name: 'fixture-b',
              },
            ]),
          );
        }
        if (url.includes('/fixture-a/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/fixture-a' }));
        }
        if (url.includes('/fixture-b/main/package.json')) {
          return Promise.resolve(jsonResponse({ name: '@ankhorage/fixture-b' }));
        }
        if (url.includes('%40ankhorage%2Ffixture-a/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: [canonical],
                category: 'fixture-a',
                provider: './dist/cli/index.js',
              },
              name: '@ankhorage/fixture-a',
              version: '1.0.0',
            }),
          );
        }
        if (url.includes('%40ankhorage%2Ffixture-b/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: [{ ...canonical, access: ['read'] }],
                category: 'fixture-b',
                provider: './dist/cli/index.js',
              },
              name: '@ankhorage/fixture-b',
              version: '1.0.0',
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect(source.readAsync()).rejects.toThrow('Conflicting Ankh capability "fixture.shared"');
  });

  test('keeps unreleased repository versions out of the provider catalog', async () => {
    const publishedEntry = {
      description: 'ZORA provider',
      metadata: {
        capabilities: createCapabilities(['fixture.sync']),
        category: 'zora',
        provider: './dist/cli/index.js',
      },
      packageName: '@ankhorage/zora',
      repositoryUrl: 'https://github.com/ankhorage/zora',
      version: '23.1.0',
    } as const satisfies AnkhProviderCatalogEntry;
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
                html_url: publishedEntry.repositoryUrl,
                name: 'zora',
              },
            ]),
          );
        }
        if (url.includes('/zora/main/package.json')) {
          return Promise.resolve(
            jsonResponse({
              ankh: {
                capabilities: createCapabilities(['fixture.sync', 'fixture.create']),
                category: 'zora',
                provider: './dist/cli/index.js',
              },
              name: publishedEntry.packageName,
              version: '23.2.0',
            }),
          );
        }
        if (url.includes('%40ankhorage%2Fzora/latest')) {
          return Promise.resolve(
            jsonResponse({
              ankh: publishedEntry.metadata,
              description: publishedEntry.description,
              name: publishedEntry.packageName,
              version: publishedEntry.version,
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect(await source.readAsync()).toEqual([publishedEntry]);
  });

  test('keeps provider null authoritative even when the package exports ./cli', async () => {
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
              capabilities: createCapabilities(['fixture.run']),
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

    expect(await source.readAsync()).toEqual([]);
  });

  test('excludes malformed non-null remote provider declarations', async () => {
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
              capabilities: createCapabilities(['fixture.run']),
              category: 'broken',
              provider: 'dist/cli/index.js',
            },
            name: '@ankhorage/broken',
            version: '1.0.0',
          }),
        );
      },
    });

    expect(await source.readAsync()).toEqual([]);
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

  test('accepts cached provider metadata with equivalent schema property order', async () => {
    const cacheRoot = await createTemporaryDirectory();
    const [capability] = createCapabilities(['fixture.up']);
    if (capability === undefined) throw new Error('Expected fixture capability.');
    const entry = {
      ...infraEntry,
      metadata: {
        ...infraEntry.metadata,
        capabilities: [
          {
            ...capability,
            input: {
              schema: {
                additionalProperties: false,
                properties: {
                  first: { type: 'string' },
                  second: { type: 'string' },
                },
                type: 'object',
              },
            },
          },
        ],
      },
    } as const satisfies AnkhProviderCatalogEntry;
    await writeCachedProviderPackage(cacheRoot, entry, {
      ...entry.metadata,
      capabilities: [
        {
          ...entry.metadata.capabilities[0],
          input: {
            schema: {
              additionalProperties: false,
              properties: {
                second: { type: 'string' },
                first: { type: 'string' },
              },
              type: 'object',
            },
          },
        },
      ],
    });
    let installs = 0;
    const store = createBunProviderPackageStore({
      bunExecutable: '/fake/bun',
      cacheRoot,
      runProcessAsync() {
        installs += 1;
        return Promise.resolve({ exitCode: 0, stderr: '' });
      },
    });

    expect((await store.resolveAsync(entry)).packageName).toBe(entry.packageName);
    expect(installs).toBe(0);
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

/*** Create a GitHub repository-list fixture for remote catalog tests. */
function githubRepository(name: string): Record<string, unknown> {
  return {
    archived: false,
    default_branch: 'main',
    fork: false,
    html_url: `https://github.com/ankhorage/${name}`,
    name,
  };
}

/*** Create a canonical published provider manifest fixture. */
function remoteProviderPackage(name: string, category = name): Record<string, unknown> {
  return {
    ankh: {
      capabilities: createCapabilities([`fixture.${name}`]),
      category,
      provider: './dist/cli/index.js',
    },
    name: `@ankhorage/${name}`,
    version: '1.0.0',
  };
}

/*** Create a minimal cached provider package matching the remote catalog entry. */
async function writeCachedProviderPackage(
  cacheRoot: string,
  entry: AnkhProviderCatalogEntry = infraEntry,
  metadata: AnkhProviderCatalogEntry['metadata'] = entry.metadata,
): Promise<void> {
  const packageRoot = path.join(cacheRoot, 'node_modules', ...entry.packageName.split('/'));
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify(
      {
        ankh: metadata,
        name: entry.packageName,
        version: entry.version,
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

import { describe, expect, test } from 'bun:test';

import { createNpmProviderReleaseSource } from '../src/features/providers/adapters/outbound/createNpmProviderReleaseSource.js';
import { resolveConsumerProviderEntryAsync } from '../src/features/providers/application/use-cases/resolveConsumerProviderEntryAsync.js';
import type { AnkhProviderCatalogEntry } from '../src/types/providers.js';
import { createCapabilities } from './capabilityFixture.js';

const latestEntry = {
  description: 'Fixture provider',
  metadata: {
    capabilities: createCapabilities(['fixture.sync']),
    category: 'fixture',
    provider: './dist/cli/index.js',
  },
  packageName: '@ankhorage/fixture',
  repositoryUrl: 'https://github.com/ankhorage/fixture',
  version: '2.0.0',
} as const satisfies AnkhProviderCatalogEntry;

describe('consumer provider version selection', () => {
  test('selects the exact consumer version instead of the catalog latest release', async () => {
    const resolved = await resolve({ dependencies: { '@ankhorage/fixture': '1.0.0' } });

    expect(resolved.version).toBe('1.0.0');
  });

  test('retains the catalog latest release when the consumer makes no provider selection', async () => {
    const resolved = await resolve({ dependencies: {} });

    expect(resolved).toEqual(latestEntry);
  });

  test('fails closed for a missing selected release', async () => {
    await expectFailure(
      resolve({ dependencies: { '@ankhorage/fixture': '1.0.0' } }, () =>
        Promise.reject(new Error('Published provider @ankhorage/fixture@1.0.0 does not exist.')),
      ),
      'does not exist',
    );
  });

  test.each(['^1.0.0', 'latest', 'workspace:*', 'file:../fixture'])(
    'fails closed for unsupported explicit version %s',
    async (version) => {
      await expectFailure(
        resolve({ dependencies: { '@ankhorage/fixture': version } }),
        'must use an exact published version',
      );
    },
  );

  test('fails closed for conflicting dependency declarations', async () => {
    await expectFailure(
      resolve({
        dependencies: { '@ankhorage/fixture': '1.0.0' },
        devDependencies: { '@ankhorage/fixture': '2.0.0' },
      }),
      'conflicting versions',
    );
  });

  test('validates exact published provider identity and metadata through npm', async () => {
    const source = createNpmProviderReleaseSource({
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ankh: latestEntry.metadata,
              description: latestEntry.description,
              name: latestEntry.packageName,
              version: '1.0.0',
            }),
            { status: 200 },
          ),
        ),
    });

    const entry = await source.resolveAsync({ catalogEntry: latestEntry, version: '1.0.0' });
    expect(entry).toMatchObject({ packageName: latestEntry.packageName, version: '1.0.0' });
  });
});

/*** Resolve one fixture consumer manifest through an injected deterministic release source. */
function resolve(
  manifest: Record<string, unknown>,
  resolveRelease: () => Promise<AnkhProviderCatalogEntry> = () =>
    Promise.resolve({ ...latestEntry, version: '1.0.0' }),
): Promise<AnkhProviderCatalogEntry> {
  return resolveConsumerProviderEntryAsync({
    catalogEntry: latestEntry,
    consumerManifestSource: { readAsync: () => Promise.resolve(manifest) },
    cwd: '/consumer',
    providerReleaseSource: { resolveAsync: resolveRelease },
  });
}

/*** Assert that an asynchronous provider resolution rejects with the expected message. */
async function expectFailure(result: Promise<unknown>, message: string): Promise<void> {
  await result.then(
    () => {
      throw new Error('Expected provider resolution to fail.');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(message);
    },
  );
}

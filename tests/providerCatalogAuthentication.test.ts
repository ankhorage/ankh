import { describe, expect, test } from 'bun:test';

import { createGitHubProviderCatalogSource } from '../src/features/providers/adapters/outbound/createGitHubProviderCatalogSource.js';

describe('GitHub provider catalog authentication', () => {
  test('sends a bearer token to the GitHub repository listing when configured', async () => {
    const observed: { authorization?: string | null } = {};
    const source = createGitHubProviderCatalogSource({
      token: 'ci-token',
      fetchImpl(_input, init) {
        observed.authorization = new Headers(init?.headers).get('Authorization');
        return Promise.resolve(new Response('[]', { status: 200 }));
      },
    });

    await source.readAsync();

    expect(observed.authorization).toBe('Bearer ci-token');
  });

  test('keeps public repository discovery unauthenticated without a token', async () => {
    const observed: { authorization?: string | null } = {};
    const source = createGitHubProviderCatalogSource({
      fetchImpl(_input, init) {
        observed.authorization = new Headers(init?.headers).get('Authorization');
        return Promise.resolve(new Response('[]', { status: 200 }));
      },
    });

    await source.readAsync();

    expect(observed.authorization).toBeNull();
  });
});

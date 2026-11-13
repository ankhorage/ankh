import { describe, expect, test } from 'bun:test';

import { createGitHubProviderCatalogSource } from '../src/features/providers/adapters/outbound/createGitHubProviderCatalogSource.js';
import { resolveProviderCatalogAsync } from '../src/features/providers/application/use-cases/resolveProviderCatalogAsync.js';
import { createCapabilities } from './capabilityFixture.js';

describe('provider catalog remote request resilience', () => {
  test('does not write a cold cache when complete catalog discovery fails', async () => {
    let writes = 0;
    const resolution = resolveProviderCatalogAsync({
      source: {
        readAsync() {
          return Promise.reject(new Error('catalog source failed'));
        },
      },
      store: {
        readAsync: () => Promise.resolve(null),
        writeAsync() {
          writes += 1;
          return Promise.resolve();
        },
      },
    });

    await resolution.then(
      () => {
        throw new Error('Expected catalog resolution to fail.');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(writes).toBe(0);
      },
    );
  });

  test('bounds concurrent repository discovery while retaining a deterministic catalog', async () => {
    let activeRequests = 0;
    let peakRequests = 0;
    const source = createGitHubProviderCatalogSource({
      fetchImpl: async (input) => {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return jsonResponse(
            Array.from({ length: 12 }, (_, index) => githubRepository(`provider-${index}`)),
          );
        }
        if (url.includes('raw.githubusercontent.com')) {
          activeRequests += 1;
          peakRequests = Math.max(peakRequests, activeRequests);
          await Promise.resolve();
          activeRequests -= 1;
          return jsonResponse({ name: `@ankhorage/${readRepositoryName(url)}` });
        }
        return jsonResponse(remoteProviderPackage(readPackageName(url)));
      },
    });

    const entries = await source.readAsync();

    expect(peakRequests).toBe(5);
    expect(entries.map((entry) => entry.packageName)).toEqual(
      Array.from({ length: 12 }, (_, index) => `@ankhorage/provider-${index}`).sort((left, right) =>
        left.localeCompare(right),
      ),
    );
  });

  test('retries transient socket errors and rate-limited responses with server guidance', async () => {
    let rawAttempts = 0;
    const delays: number[] = [];
    const source = createGitHubProviderCatalogSource({
      fetchImpl(input) {
        const url = readRequestUrl(input);
        if (url.includes('/orgs/ankhorage/repos')) {
          return Promise.resolve(jsonResponse([githubRepository('retryable')]));
        }
        if (url.includes('raw.githubusercontent.com')) {
          rawAttempts += 1;
          return rawAttempts === 1
            ? Promise.reject(new Error('socket connection reset'))
            : Promise.resolve(jsonResponse({ name: '@ankhorage/retryable' }));
        }
        if (rawAttempts === 2) {
          rawAttempts += 1;
          return Promise.resolve(
            new Response(null, { headers: { 'Retry-After': '2' }, status: 429 }),
          );
        }
        return Promise.resolve(jsonResponse(remoteProviderPackage('retryable')));
      },
      retryDelayAsync(milliseconds) {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    });

    const entries = await source.readAsync();

    expect(entries.map((entry) => entry.packageName)).toEqual(['@ankhorage/retryable']);
    expect(rawAttempts).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBe(2_000);
  });

  test('reports permanent and invalid responses with their sanitized source context', async () => {
    const unauthorized = createGitHubProviderCatalogSource({
      fetchImpl: () => Promise.resolve(new Response(null, { status: 401 })),
    });
    const invalidJson = createGitHubProviderCatalogSource({
      fetchImpl: () => Promise.resolve(new Response('{', { status: 200 })),
    });

    await unauthorized.readAsync().then(
      () => {
        throw new Error('Expected the unauthorized request to fail.');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty('message', expect.stringContaining('HTTP 401; not retried'));
      },
    );
    await invalidJson.readAsync().then(
      () => {
        throw new Error('Expected invalid JSON to fail.');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty(
          'message',
          'Provider catalog GitHub repository discovery received invalid JSON from GitHub API page 1.',
        );
      },
    );
  });

  test('aborts every timed-out attempt without leaving retry work in flight', async () => {
    const signals: AbortSignal[] = [];
    const source = createGitHubProviderCatalogSource({
      fetchImpl(_input, init) {
        const signal = init?.signal;
        if (signal instanceof AbortSignal) signals.push(signal);
        return new Promise<Response>(() => undefined);
      },
      requestTimeoutMs: 1,
      retryDelayAsync: () => Promise.resolve(),
    });

    await source.readAsync().then(
      () => {
        throw new Error('Expected the timed-out request to fail.');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty(
          'message',
          expect.stringContaining('request timeout; retries exhausted after 3 attempts'),
        );
      },
    );
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.aborted)).toBeTrue();
  });
});

function readRequestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function readRepositoryName(url: string): string {
  const segments = new URL(url).pathname.split('/');
  return segments.at(-3) ?? '';
}

function readPackageName(url: string): string {
  const encodedPackageName = new URL(url).pathname.split('/').at(-2) ?? '';
  return decodeURIComponent(encodedPackageName).split('/').at(-1) ?? '';
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function githubRepository(name: string): Record<string, unknown> {
  return {
    archived: false,
    default_branch: 'main',
    fork: false,
    html_url: `https://github.com/ankhorage/${name}`,
    name,
  };
}

function remoteProviderPackage(name: string): Record<string, unknown> {
  return {
    ankh: {
      capabilities: createCapabilities([`fixture.${name}`]),
      category: name,
      provider: './dist/cli/index.js',
    },
    name: `@ankhorage/${name}`,
    version: '1.0.0',
  };
}

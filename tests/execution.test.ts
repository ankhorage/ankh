import type { AnkhCommandProviderManifest, AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, it } from 'bun:test';

import type { AnkhRuntimeCommandProvider } from '../src/execution.js';
import { resolveExecutableCommand } from '../src/execution.js';
import type { AnkhLoadedProvider } from '../src/providerManifestLoader.js';
import { createProviderRegistry } from '../src/providerRegistry.js';

const infraMetadata = {
  capabilities: ['infra.up', 'infra.status', 'infra.destroy'],
  category: 'infra',
  provider: './dist/ankh.provider.js',
} as const satisfies AnkhPackageMetadata;

const infraManifest = {
  id: '@ankhorage/infra',
  category: 'infra',
  version: '1.0.0',
  capabilities: ['infra.up', 'infra.status', 'infra.destroy'],
  commands: [
    {
      path: ['up'],
      capability: 'infra.up',
      summary: 'Bring project infrastructure up',
      aliases: ['start'],
    },
    {
      path: ['status'],
      capability: 'infra.status',
      summary: 'Show project infrastructure status',
    },
  ],
} as const satisfies AnkhCommandProviderManifest;

const noopHandler = () => undefined;

describe('resolveExecutableCommand', () => {
  it('returns a handler for valid runtime providers', () => {
    const runtimeProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ['up'],
          handler: noopHandler,
        },
        {
          path: ['status'],
          handler: noopHandler,
        },
      ],
    } as const satisfies AnkhRuntimeCommandProvider;
    const registry = createProviderRegistry([
      createLoadedProvider(runtimeProvider, runtimeProvider),
    ]);

    const result = resolveExecutableCommand(registry, 'infra', ['start', '--watch']);

    expect(result.diagnostics).toEqual([]);
    expect(result.resolvedCommand?.command.path).toEqual(['up']);
    expect(result.resolvedCommand?.argv).toEqual(['--watch']);
  });

  it('reports missing handlers when the provider has no runtime handlers', () => {
    const registry = createProviderRegistry([createLoadedProvider(infraManifest)]);

    const result = resolveExecutableCommand(registry, 'infra', ['up']);

    expect(result.resolvedCommand).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'provider-missing-command-handlers',
    );
  });

  it('reports an invalid handlers array', () => {
    const invalidProvider = {
      ...infraManifest,
      handlers: 'nope',
    };
    const registry = createProviderRegistry([createLoadedProvider(infraManifest, invalidProvider)]);

    const result = resolveExecutableCommand(registry, 'infra', ['up']);

    expect(result.resolvedCommand).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'invalid-provider-command-handlers',
    );
  });

  it('reports unknown handler paths and duplicate handler paths', () => {
    const invalidProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ['up'],
          handler: noopHandler,
        },
        {
          path: ['up'],
          handler: noopHandler,
        },
        {
          path: ['destroy'],
          handler: noopHandler,
        },
      ],
    };
    const registry = createProviderRegistry([createLoadedProvider(infraManifest, invalidProvider)]);

    const result = resolveExecutableCommand(registry, 'infra', ['up']);

    expect(result.resolvedCommand).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'provider-duplicate-command-handler-path',
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'provider-command-handler-unknown-path',
    );
  });

  it('reports non-function handlers and missing command handlers', () => {
    const invalidProvider = {
      ...infraManifest,
      handlers: [
        {
          path: ['up'],
          handler: 'nope',
        },
      ],
    };
    const registry = createProviderRegistry([createLoadedProvider(infraManifest, invalidProvider)]);

    const result = resolveExecutableCommand(registry, 'infra', ['up']);

    expect(result.resolvedCommand).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'provider-command-handler-not-function',
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'provider-command-handler-missing',
    );
  });
});

function createLoadedProvider(
  manifest: AnkhCommandProviderManifest,
  providerModuleDefaultExport: unknown = manifest,
): AnkhLoadedProvider {
  return {
    discoveredPackage: {
      metadata: infraMetadata,
      packageJsonPath: '/repo/packages/infra/package.json',
      packageName: '@ankhorage/infra',
      packageRoot: '/repo/packages/infra',
      source: 'workspace',
    },
    manifest,
    providerModuleDefaultExport,
    providerModulePath: '/repo/packages/infra/dist/ankh.provider.js',
    providerModuleUrl: 'file:///repo/packages/infra/dist/ankh.provider.js',
  };
}

import type { AnkhCommandProviderManifest, AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, it } from 'bun:test';

import { type AnkhRuntimeCommandProvider, resolveExecutableCommand } from '../src/execution.js';
import { renderCategoryHelp, renderCommands } from '../src/help.js';
import { createPackageRegistry } from '../src/packageRegistry.js';
import { resolvePlannableCommand } from '../src/planning.js';
import { createProviderRegistry } from '../src/providerRegistry.js';

const metadata = {
  capabilities: ['deploy.release', 'deploy.status'],
  category: 'deploy',
  provider: './dist/cli/index.js',
} as const satisfies AnkhPackageMetadata;

const manifest = {
  id: '@ankhorage/deploy',
  category: 'deploy',
  version: '1.0.0',
  capabilities: ['deploy.release', 'deploy.status'],
  commands: [
    {
      path: [],
      capability: 'deploy.release',
      summary: 'Deploy the authored release',
    },
    {
      path: ['status'],
      capability: 'deploy.status',
      summary: 'Show deployment status',
      aliases: ['s'],
    },
  ],
} as const satisfies AnkhCommandProviderManifest;

const discoveredPackage = {
  metadata,
  packageJsonPath: '/repo/node_modules/@ankhorage/deploy/package.json',
  packageName: '@ankhorage/deploy',
  packageRoot: '/repo/node_modules/@ankhorage/deploy',
  source: 'installed-dependency' as const,
};

const runtimeProvider = {
  ...manifest,
  handlers: [
    { path: [], handler: () => ({ exitCode: 0 }) },
    { path: ['status'], handler: () => ({ exitCode: 0 }) },
  ],
  planningHandlers: [
    {
      path: [],
      handler: () => ({
        diagnostics: [],
        kind: 'ankh-command-plan' as const,
        steps: [],
        title: 'Deploy',
        version: 1 as const,
      }),
    },
    {
      path: ['status'],
      handler: () => ({
        diagnostics: [],
        kind: 'ankh-command-plan' as const,
        steps: [],
        title: 'Status',
        version: 1 as const,
      }),
    },
  ],
} as const satisfies AnkhRuntimeCommandProvider;

const loadedProvider = {
  discoveredPackage,
  manifest,
  providerModuleDefaultExport: runtimeProvider,
  providerModulePath: '/repo/node_modules/@ankhorage/deploy/dist/cli/index.js',
  providerModuleUrl: 'file:///repo/node_modules/@ankhorage/deploy/dist/cli/index.js',
};

describe('category-root commands', () => {
  it('uses canonical non-root paths and aliases before the root fallback', () => {
    const registry = createProviderRegistry([loadedProvider]);

    expect(registry.resolveCommand('deploy', [])?.command.path).toEqual([]);
    expect(registry.resolveCommand('deploy', ['--dry-run'])?.command.path).toEqual([]);
    expect(registry.resolveCommand('deploy', ['--dry-run'])?.argv).toEqual(['--dry-run']);
    expect(registry.resolveCommand('deploy', ['status'])?.command.path).toEqual(['status']);
    expect(registry.resolveCommand('deploy', ['s'])?.command.path).toEqual(['status']);
  });

  it('resolves root execution and planning handler bindings', () => {
    const registry = createProviderRegistry([loadedProvider]);

    expect(resolveExecutableCommand(registry, 'deploy', []).resolvedCommand?.command.path).toEqual(
      [],
    );
    expect(resolvePlannableCommand(registry, 'deploy', []).resolvedCommand?.command.path).toEqual(
      [],
    );
  });

  it('renders root commands explicitly in command and category help', () => {
    const providerRegistry = createProviderRegistry([loadedProvider]);
    const packageRegistry = createPackageRegistry([discoveredPackage]);

    expect(renderCommands(packageRegistry.listPackages(), providerRegistry)).toContain('- (root)');
    expect(renderCategoryHelp('deploy', providerRegistry)).toContain('  deploy\n');
    expect(renderCategoryHelp('deploy', providerRegistry)).toContain('  deploy status\n');
  });
});

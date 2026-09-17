import type { AnkhCommandProviderManifest, AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, it } from 'bun:test';

import { type AnkhRuntimeCommandProvider, resolveExecutableCommand } from '../src/execution.js';
import { renderCategoryHelp, renderRootHelp } from '../src/help.js';
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

  it('renders canonical root help and package help without capability metadata', () => {
    const providerRegistry = createProviderRegistry([loadedProvider]);
    const rootHelp = renderRootHelp([
      {
        command: 'deploy',
        repositoryUrl: 'https://github.com/ankhorage/deploy',
      },
      {
        command: 'runtime',
        repositoryUrl: 'https://github.com/ankhorage/runtime',
      },
    ]);
    const categoryHelp = renderCategoryHelp(
      'deploy',
      providerRegistry,
      'Deploy Ankhorage projects.',
    );

    const renderedRootCommands = rootHelp
      .split('\n')
      .filter((line) => line.startsWith('  ') && line.includes('https://github.com/ankhorage/'))
      .map((line) => line.trim().split(/\s+/)[0]);

    expect(renderedRootCommands).toEqual([
      'apm',
      'board',
      'data-sources',
      'deploy',
      'devtools',
      'docs',
      'doctor',
      'infra',
      'navigator',
      'orchestrator',
      'permissions',
      'project-detector',
      'repository',
      'studio',
      'templates',
    ]);
    expect(rootHelp).toContain('deploy');
    expect(rootHelp).toContain('https://github.com/ankhorage/deploy');
    expect(rootHelp).toContain('docs');
    expect(rootHelp).toContain('https://github.com/ankhorage/paradox');
    expect(rootHelp).not.toContain('plan');
    expect(rootHelp).not.toContain('https://github.com/ankhorage/ankh');
    expect(rootHelp).not.toContain('runtime');
    expect(rootHelp).not.toContain('capability');
    expect(categoryHelp.startsWith('Deploy Ankhorage projects.\n')).toBe(true);
    expect(categoryHelp).toContain('  ankh deploy\n');
    expect(categoryHelp).toContain('  ankh deploy <command>\n');
    expect(categoryHelp).toContain('  deploy  Deploy the authored release\n');
    expect(categoryHelp).toContain('  status  Show deployment status\n');
    expect(categoryHelp).toContain('ankh deploy <command> --help');
    expect(categoryHelp).not.toContain('capability');
    expect(categoryHelp).not.toContain('Provider:');
    expect(categoryHelp).not.toContain('Version:');
  });
});

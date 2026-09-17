import type { AnkhCommandProviderManifest, AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, it } from 'bun:test';

import packageJson from '../package.json';
import { runCli } from '../src/cli/index.js';
import type { AnkhCommandContext } from '../src/commandContext.js';
import type { AnkhDiscoveredPackage } from '../src/discovery.js';
import type { AnkhCommandExecutionRequest, AnkhRuntimeCommandProvider } from '../src/execution.js';
import { createPackageRegistry } from '../src/packageRegistry.js';
import type {
  AnkhLoadedProvider,
  AnkhProviderManifestDiagnostic,
} from '../src/providerManifestLoader.js';
import { createProviderRegistry } from '../src/providerRegistry.js';

const infraMetadata = {
  capabilities: ['infra.up', 'infra.status', 'infra.down'],
  category: 'infra',
  provider: './dist/ankh.provider.js',
} as const satisfies AnkhPackageMetadata;

const infraManifest = {
  id: '@ankhorage/infra',
  category: 'infra',
  version: '1.0.0',
  capabilities: ['infra.up', 'infra.status'],
  commands: [
    {
      path: ['up'],
      capability: 'infra.up',
      summary: 'Bring project infrastructure up',
      aliases: ['start'],
      examples: ['ankh infra up shop'],
    },
    {
      path: ['status'],
      capability: 'infra.status',
      summary: 'Show project infrastructure status',
    },
  ],
} as const satisfies AnkhCommandProviderManifest;

const noopHandler = () => undefined;

function createDiscoveredPackage(
  packageName: string,
  metadata: AnkhPackageMetadata,
): AnkhDiscoveredPackage {
  return {
    metadata,
    packageJsonPath: `/repo/${packageName}/package.json`,
    packageName,
    packageRoot: `/repo/${packageName}`,
    source: 'workspace',
  };
}

function createLoadedProvider(
  discoveredPackage: AnkhDiscoveredPackage,
  manifest: AnkhCommandProviderManifest = infraManifest,
  providerModuleDefaultExport: unknown = manifest,
): AnkhLoadedProvider {
  return {
    discoveredPackage,
    manifest,
    providerModuleDefaultExport,
    providerModulePath: `${discoveredPackage.packageRoot}/dist/ankh.provider.js`,
    providerModuleUrl: `file://${discoveredPackage.packageRoot}/dist/ankh.provider.js`,
  };
}

function createRuntimeProvider(
  manifest: AnkhCommandProviderManifest,
  handlers: AnkhRuntimeCommandProvider['handlers'],
): AnkhRuntimeCommandProvider {
  return {
    ...manifest,
    handlers,
  };
}

function createInjectedState(
  discoveredPackages: readonly AnkhDiscoveredPackage[],
  providers: readonly AnkhLoadedProvider[],
) {
  return {
    registry: createPackageRegistry(discoveredPackages),
    providerRegistry: createProviderRegistry(providers),
  };
}

function createMemoryContext(version = packageJson.version): {
  readonly context: AnkhCommandContext;
  readonly stdout: { value: string };
  readonly stderr: { value: string };
} {
  const stdout = { value: '' };
  const stderr = { value: '' };

  return {
    context: {
      cwd: '/repo',
      env: {},
      version,
      writeStdout(text: string) {
        stdout.value += text;
      },
      writeStderr(text: string) {
        stderr.value += text;
      },
    },
    stdout,
    stderr,
  };
}

describe('runCli', () => {
  it('prints canonical command links for root help', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const state = createInjectedState([infraPackage], [createLoadedProvider(infraPackage)]);

    const result = await runCli([], { context, ...state });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain('Usage:');
    expect(stdout.value).toContain('ankh <command>');
    expect(stdout.value).toContain('Commands:');
    expect(stdout.value).toContain('infra');
    expect(stdout.value).toContain('https://github.com/ankhorage/infra');
    expect(stdout.value).not.toContain('plan');
    expect(stdout.value).not.toContain('https://github.com/ankhorage/ankh');
    expect(stdout.value).not.toContain('ankh commands');
    expect(stdout.value).not.toContain('capability');
    expect(stderr.value).toBe('');
  });

  it('prints the same root help for help aliases', async () => {
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const state = createInjectedState([infraPackage], [createLoadedProvider(infraPackage)]);

    for (const argv of [['--help'], ['-h'], ['help']] as const) {
      const { context, stdout, stderr } = createMemoryContext();
      const result = await runCli(argv, { context, ...state });

      expect(result).toEqual({ exitCode: 0 });
      expect(stdout.value).toContain('Commands:');
      expect(stdout.value).toContain('https://github.com/ankhorage/infra');
      expect(stderr.value).toBe('');
    }
  });

  it('prints the package version for version aliases', async () => {
    for (const argv of [['--version'], ['-v']] as const) {
      const { context, stdout, stderr } = createMemoryContext('9.9.9');
      const result = await runCli(argv, { context });

      expect(result).toEqual({ exitCode: 0 });
      expect(stdout.value).toBe('9.9.9\n');
      expect(stderr.value).toBe('');
    }
  });

  it('does not reserve commands as a built-in', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const state = createInjectedState([], []);

    const result = await runCli(['commands'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Unknown Ankh command: commands');
    expect(stderr.value).toContain('ankh --help');
  });

  it('renders package description fallback and complete command list without capability metadata', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const state = createInjectedState([infraPackage], [createLoadedProvider(infraPackage)]);

    const result = await runCli(['infra', '--help'], { context, ...state });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value.startsWith('@ankhorage/infra\n')).toBe(true);
    expect(stdout.value).toContain('ankh infra <command>');
    expect(stdout.value).toContain('up      Bring project infrastructure up');
    expect(stdout.value).toContain('status  Show project infrastructure status');
    expect(stdout.value).toContain('ankh infra <command> --help');
    expect(stdout.value).not.toContain('capability');
    expect(stdout.value).not.toContain('Provider:');
    expect(stdout.value).not.toContain('Version:');
    expect(stderr.value).toBe('');
  });

  it('dispatches canonical provider commands with remaining argv passed through untouched', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const requests: AnkhCommandExecutionRequest[] = [];
    const runtimeProvider = createRuntimeProvider(infraManifest, [
      {
        path: ['up'],
        handler(request) {
          requests.push(request);
          request.context.writeStdout(`handled:${request.argv.join('|')}\n`);
        },
      },
      { path: ['status'], handler: noopHandler },
    ]);
    const state = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, runtimeProvider, runtimeProvider)],
    );

    const result = await runCli(['infra', 'up', '--profile', 'local'], { context, ...state });

    expect(result).toEqual({ exitCode: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.argv).toEqual(['--profile', 'local']);
    expect(requests[0]?.command.path).toEqual(['up']);
    expect(stdout.value).toContain('handled:--profile|local');
    expect(stderr.value).toBe('');
  });

  it('dispatches aliases and prefers the longest canonical command path', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', {
      ...infraMetadata,
      capabilities: ['infra.up', 'infra.status', 'infra.port', 'infra.port.forward'],
    });
    const nestedManifest = {
      ...infraManifest,
      capabilities: ['infra.up', 'infra.status', 'infra.port', 'infra.port.forward'],
      commands: [
        ...infraManifest.commands,
        {
          path: ['port'],
          capability: 'infra.port',
          summary: 'Manage forwarded ports',
          aliases: ['pf'],
        },
        {
          path: ['port', 'forward'],
          capability: 'infra.port.forward',
          summary: 'Forward a named infrastructure port',
        },
      ],
    } as const satisfies AnkhCommandProviderManifest;
    const seen: string[] = [];
    const runtimeProvider = createRuntimeProvider(nestedManifest, [
      {
        path: ['up'],
        handler(request) {
          seen.push(`alias:${request.command.path.join(' ')}:${request.argv.join('|')}`);
        },
      },
      { path: ['status'], handler: noopHandler },
      {
        path: ['port'],
        handler(request) {
          seen.push(`port:${request.argv.join('|')}`);
        },
      },
      {
        path: ['port', 'forward'],
        handler(request) {
          seen.push(`forward:${request.argv.join('|')}`);
        },
      },
    ]);
    const state = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, runtimeProvider, runtimeProvider)],
    );

    const aliasResult = await runCli(['infra', 'start', '--watch'], { context, ...state });
    const longestPathResult = await runCli(['infra', 'port', 'forward', 'db', '--local', '5432'], {
      context,
      ...state,
    });

    expect(aliasResult).toEqual({ exitCode: 0 });
    expect(longestPathResult).toEqual({ exitCode: 0 });
    expect(seen).toEqual(['alias:up:--watch', 'forward:db|--local|5432']);
    expect(stdout.value).toBe('');
    expect(stderr.value).toBe('');
  });

  it('keeps execution diagnostics out of package help output', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const partialProvider = createRuntimeProvider(infraManifest, [
      { path: ['up'], handler: noopHandler },
    ]);
    const state = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, partialProvider, partialProvider)],
    );

    const result = await runCli(['infra', '--help'], { context, ...state });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain('Bring project infrastructure up');
    expect(stderr.value).toBe('');
  });

  it('prints execution diagnostics when a loaded provider has no handlers', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const state = createInjectedState([infraPackage], [createLoadedProvider(infraPackage)]);

    const result = await runCli(['infra', 'up'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Ankh command execution diagnostics:');
    expect(stderr.value).toContain('provider-missing-command-handlers');
  });

  it('rejects partially handled providers for direct dispatch', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    let wasCalled = false;
    const partialProvider = createRuntimeProvider(infraManifest, [
      {
        path: ['up'],
        handler() {
          wasCalled = true;
        },
      },
    ]);
    const state = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, partialProvider, partialProvider)],
    );

    const result = await runCli(['infra', 'up'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(wasCalled).toBeFalse();
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('provider-command-handler-missing');
  });

  it('prints unknown provider command guidance for known categories', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const runtimeProvider = createRuntimeProvider(infraManifest, [
      { path: ['up'], handler: noopHandler },
      { path: ['status'], handler: noopHandler },
    ]);
    const state = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, runtimeProvider, runtimeProvider)],
    );

    const result = await runCli(['infra', 'destroy'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Unknown Ankh command for category "infra": destroy');
    expect(stderr.value).toContain('ankh infra --help');
  });

  it('returns provider handler exit codes and catches thrown provider errors', async () => {
    const infraPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const successRun = createMemoryContext();
    const failureRun = createMemoryContext();
    const exitCodeProvider = createRuntimeProvider(infraManifest, [
      { path: ['up'], handler: () => ({ exitCode: 7 }) },
      { path: ['status'], handler: noopHandler },
    ]);
    const throwingProvider = createRuntimeProvider(infraManifest, [
      {
        path: ['up'],
        handler() {
          throw new Error('kaboom');
        },
      },
      { path: ['status'], handler: noopHandler },
    ]);
    const successState = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, exitCodeProvider, exitCodeProvider)],
    );
    const failureState = createInjectedState(
      [infraPackage],
      [createLoadedProvider(infraPackage, throwingProvider, throwingProvider)],
    );

    const successResult = await runCli(['infra', 'up'], {
      context: successRun.context,
      ...successState,
    });
    const failureResult = await runCli(['infra', 'up'], {
      context: failureRun.context,
      ...failureState,
    });

    expect(successResult).toEqual({ exitCode: 7 });
    expect(successRun.stderr.value).toBe('');
    expect(failureResult).toEqual({ exitCode: 1 });
    expect(failureRun.stderr.value).toContain(
      'Ankh command execution failed for "infra up": kaboom',
    );
  });

  it('treats duplicate provider categories as dispatch-ambiguous', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const primaryPackage = createDiscoveredPackage('@ankhorage/infra', infraMetadata);
    const duplicatePackage = createDiscoveredPackage('@ankhorage/infra-alt', infraMetadata);
    const executedProviders: string[] = [];
    const primaryProvider = createRuntimeProvider(infraManifest, [
      {
        path: ['up'],
        handler() {
          executedProviders.push('@ankhorage/infra');
        },
      },
      { path: ['status'], handler: noopHandler },
    ]);
    const duplicateManifest = {
      ...infraManifest,
      id: '@ankhorage/infra-alt',
    } as const satisfies AnkhCommandProviderManifest;
    const duplicateProvider = createRuntimeProvider(duplicateManifest, [
      {
        path: ['up'],
        handler() {
          executedProviders.push('@ankhorage/infra-alt');
        },
      },
      { path: ['status'], handler: noopHandler },
    ]);
    const state = createInjectedState(
      [primaryPackage, duplicatePackage],
      [
        createLoadedProvider(primaryPackage, primaryProvider, primaryProvider),
        createLoadedProvider(duplicatePackage, duplicateProvider, duplicateProvider),
      ],
    );

    const result = await runCli(['infra', 'up'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(executedProviders).toEqual([]);
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('provider-duplicate-category');
  });

  it('prints provider manifest diagnostics for dispatch when metadata exists but loading fails', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const providerDiagnostic = {
      category: 'infra',
      code: 'provider-command-alias-collides-with-path',
      message: 'Provider manifest command alias "status" collides with a canonical command path.',
      packageJsonPath: '/repo/@ankhorage/infra/package.json',
      packageName: '@ankhorage/infra',
      providerModulePath: '/repo/@ankhorage/infra/dist/ankh.provider.js',
      severity: 'error',
    } as const satisfies AnkhProviderManifestDiagnostic;

    const result = await runCli(['infra', 'up'], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [createDiscoveredPackage('@ankhorage/infra', infraMetadata)],
        }),
      loadProviders: () =>
        Promise.resolve({
          diagnostics: [providerDiagnostic],
          providers: [],
        }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Ankh provider manifest diagnostics:');
    expect(stderr.value).toContain('provider-command-alias-collides-with-path');
  });

  it('prints unknown category guidance through root help', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const state = createInjectedState([], []);

    const result = await runCli(['infra', '--help'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Unknown Ankh category: infra');
    expect(stderr.value).toContain('ankh --help');
    expect(stderr.value).not.toContain('ankh commands');
  });

  it('returns non-zero when metadata discovery fails unexpectedly during dispatch', async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(['infra', 'up'], {
      context,
      discoverPackages: () => Promise.reject(new Error('boom')),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Ankh package metadata discovery failed unexpectedly: boom');
  });

  it('returns non-zero when provider loading fails unexpectedly during dispatch', async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(['infra', 'up'], {
      context,
      discoverPackages: () =>
        Promise.resolve({
          diagnostics: [],
          packages: [createDiscoveredPackage('@ankhorage/infra', infraMetadata)],
        }),
      loadProviders: () => Promise.reject(new Error('load boom')),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Ankh provider manifest loading failed unexpectedly: load boom');
  });

  it('returns non-zero for unknown commands and points to root help', async () => {
    const { context, stdout, stderr } = createMemoryContext();
    const state = createInjectedState([], []);

    const result = await runCli(['something', 'else'], { context, ...state });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Unknown Ankh command: something else');
    expect(stderr.value).toContain('ankh --help');
    expect(stderr.value).not.toContain('ankh commands');
  });
});

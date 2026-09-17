import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AnkhCommandProviderManifest, AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { afterEach, expect, it } from 'bun:test';

import { runCli } from '../src/cli/index.js';
import type { AnkhCommandContext } from '../src/commandContext.js';
import type { AnkhDiscoveredPackage } from '../src/discovery.js';
import type { AnkhRuntimeCommandProvider } from '../src/execution.js';
import type { AnkhLoadedProvider } from '../src/providerManifestLoader.js';

const temporaryDirectories: string[] = [];

const metadata = {
  capabilities: ['infra.up'],
  category: 'infra',
  provider: './dist/cli/index.js',
} as const satisfies AnkhPackageMetadata;

const manifest = {
  id: '@ankhorage/infra',
  category: 'infra',
  version: '1.0.0',
  capabilities: ['infra.up'],
  commands: [
    {
      path: ['up'],
      capability: 'infra.up',
      summary: 'Bring project infrastructure up',
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

it('uses the same dynamically discovered provider for root help, category help, plan, and dispatch', async () => {
  const packageRoot = await mkdtemp(path.join(tmpdir(), 'ankh-unified-provider-'));
  temporaryDirectories.push(packageRoot);
  await writeFile(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: '@ankhorage/infra',
        description: 'Infrastructure provider.',
        repository: {
          type: 'git',
          url: 'git+https://github.com/ankhorage/infra.git',
        },
        ankh: metadata,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const discoveredPackage: AnkhDiscoveredPackage = {
    metadata,
    packageJsonPath: path.join(packageRoot, 'package.json'),
    packageName: '@ankhorage/infra',
    packageRoot,
    source: 'installed-dependency',
  };
  const runtimeProvider: AnkhRuntimeCommandProvider = {
    ...manifest,
    handlers: [
      {
        path: ['up'],
        handler(request) {
          request.context.writeStdout('infra-up\n');
        },
      },
    ],
    planningHandlers: [
      {
        path: ['up'],
        handler: () => ({
          diagnostics: [],
          kind: 'ankh-command-plan',
          steps: [],
          title: 'Infra up',
          version: 1,
        }),
      },
    ],
  };
  const loadedProvider: AnkhLoadedProvider = {
    discoveredPackage,
    manifest,
    providerModuleDefaultExport: runtimeProvider,
    providerModulePath: path.join(packageRoot, 'dist', 'cli', 'index.js'),
    providerModuleUrl: `file://${path.join(packageRoot, 'dist', 'cli', 'index.js')}`,
  };
  let discoveryCalls = 0;

  const run = async (argv: readonly string[]) => {
    const stdout = { value: '' };
    const stderr = { value: '' };
    const context: AnkhCommandContext = {
      cwd: packageRoot,
      env: {},
      version: 'test',
      writeStdout(text) {
        stdout.value += text;
      },
      writeStderr(text) {
        stderr.value += text;
      },
    };
    const result = await runCli(argv, {
      context,
      discoverPackages: () => {
        discoveryCalls += 1;
        return Promise.resolve({ diagnostics: [], packages: [discoveredPackage] });
      },
      loadProviders: () => Promise.resolve({ diagnostics: [], providers: [loadedProvider] }),
    });

    return { result, stderr: stderr.value, stdout: stdout.value };
  };

  const rootHelp = await run(['--help']);
  expect(rootHelp.result).toEqual({ exitCode: 0 });
  expect(rootHelp.stdout).toContain('infra');
  expect(rootHelp.stdout).toContain('https://github.com/ankhorage/infra');
  expect(rootHelp.stderr).toBe('');

  for (const helpToken of ['-h', '--help'] as const) {
    const categoryHelp = await run(['infra', helpToken]);
    expect(categoryHelp.result).toEqual({ exitCode: 0 });
    expect(categoryHelp.stdout.startsWith('Infrastructure provider.\n')).toBe(true);
    expect(categoryHelp.stdout).toContain('ankh infra <command>');
    expect(categoryHelp.stderr).toBe('');
  }

  const plan = await run(['plan', 'infra', 'up']);
  expect(plan.result).toEqual({ exitCode: 0 });
  expect(plan.stdout).toContain('Infra up');
  expect(plan.stderr).toBe('');

  const dispatch = await run(['infra', 'up']);
  expect(dispatch.result).toEqual({ exitCode: 0 });
  expect(dispatch.stdout).toBe('infra-up\n');
  expect(dispatch.stderr).toBe('');

  expect(discoveryCalls).toBe(5);
});

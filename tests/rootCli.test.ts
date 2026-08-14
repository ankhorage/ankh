import type { AnkhCommandProviderManifest, AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, it } from 'bun:test';

import { runCli } from '../src/cli/index.js';
import type { AnkhCommandContext } from '../src/commandContext.js';
import type { AnkhRuntimeCommandProvider } from '../src/execution.js';
import { createPackageRegistry } from '../src/packageRegistry.js';
import { createProviderRegistry } from '../src/providerRegistry.js';

const metadata = {
  capabilities: ['deploy.release'],
  category: 'deploy',
  provider: './dist/cli/index.js',
} as const satisfies AnkhPackageMetadata;

const manifest = {
  id: '@ankhorage/deploy',
  category: 'deploy',
  version: '1.0.0',
  capabilities: ['deploy.release'],
  commands: [
    {
      path: [],
      capability: 'deploy.release',
      summary: 'Deploy the authored release',
    },
  ],
} as const satisfies AnkhCommandProviderManifest;

function createState(seen: string[]) {
  const discoveredPackage = {
    metadata,
    packageJsonPath: '/repo/deploy/package.json',
    packageName: '@ankhorage/deploy',
    packageRoot: '/repo/deploy',
    source: 'workspace' as const,
  };
  const runtimeProvider = {
    ...manifest,
    handlers: [
      {
        path: [],
        handler(request) {
          seen.push(`run:${request.argv.join('|')}`);
          seen.push(`interaction:${request.context.interaction?.interactive ?? false}`);
        },
      },
    ],
    planningHandlers: [
      {
        path: [],
        handler(request) {
          seen.push(`plan:${request.argv.join('|')}`);
          return {
            diagnostics: [],
            kind: 'ankh-command-plan' as const,
            steps: [],
            title: 'Deploy release',
            version: 1 as const,
          };
        },
      },
    ],
  } as const satisfies AnkhRuntimeCommandProvider;
  const loadedProvider = {
    discoveredPackage,
    manifest,
    providerModuleDefaultExport: runtimeProvider,
    providerModulePath: '/repo/deploy/dist/cli/index.js',
    providerModuleUrl: 'file:///repo/deploy/dist/cli/index.js',
  };
  return {
    registry: createPackageRegistry([discoveredPackage]),
    providerRegistry: createProviderRegistry([loadedProvider]),
  };
}

function createContext(): {
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
      version: 'test',
      interaction: {
        interactive: true,
        confirm: () => Promise.resolve('confirmed'),
      },
      writeStdout: (text) => {
        stdout.value += text;
      },
      writeStderr: (text) => {
        stderr.value += text;
      },
    },
    stdout,
    stderr,
  };
}

describe('root CLI dispatch', () => {
  it('executes an explicit category-root command with argv passthrough', async () => {
    const seen: string[] = [];
    const state = createState(seen);
    const output = createContext();

    const result = await runCli(['deploy', '--dry-run'], { context: output.context, ...state });

    expect(result).toEqual({ exitCode: 0 });
    expect(seen).toEqual(['run:--dry-run', 'interaction:true']);
    expect(output.stderr.value).toBe('');
  });

  it('plans an explicit category-root command in human and JSON modes', async () => {
    const seen: string[] = [];
    const state = createState(seen);
    const human = createContext();
    const json = createContext();

    const humanResult = await runCli(['plan', 'deploy'], { context: human.context, ...state });
    const jsonResult = await runCli(['plan', 'deploy', '--json'], {
      context: json.context,
      ...state,
    });

    expect(humanResult).toEqual({ exitCode: 0 });
    expect(jsonResult).toEqual({ exitCode: 0 });
    expect(seen).toEqual(['plan:', 'plan:']);
    expect(human.stdout.value).toContain('Plan: Deploy release');
    expect(JSON.parse(json.stdout.value)).toMatchObject({
      kind: 'ankh-command-plan',
      title: 'Deploy release',
      version: 1,
    });
  });
});

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import doctorPackageJson from '@ankhorage/doctor/package.json';
import { expect, test } from 'bun:test';

import { runCli } from '../src/cli/index.js';
import type { AnkhCommandContext } from '../src/commandContext.js';
import type { AnkhDiscoveredPackage } from '../src/discovery.js';
import type { AnkhProviderRuntime } from '../src/types/providers.js';
import { DOCTOR_FIXTURE_CAPABILITIES } from './fixtures/canonicalDoctorProvider.js';

test('root CLI routes resolved Doctor for native OAuth readiness', async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ankh-doctor-auth5-'));
  try {
    const manifestPath = path.join(fixture, 'ankh.config.json');
    await fs.writeFile(manifestPath, `${JSON.stringify(createManifest(), null, 2)}\n`, 'utf8');
    const captured = createCapturedContext(fixture);
    const providerRuntime = createDoctorProviderRuntime();

    const result = await runCli(['doctor', 'validate', manifestPath], {
      context: captured.context,
      providerRuntime,
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(captured.stdout.value).toContain('Callback scheme: ankh-android.');
    expect(captured.stdout.value).toContain('Callback scheme: ankh-ios.');
    expect(captured.stdout.value).toContain('requires a development or standalone app build');
    expect(captured.stderr.value).toBe('');
  } finally {
    await fs.rm(fixture, { force: true, recursive: true });
  }
});

/*** Resolve the real installed Doctor package through the explicit provider runtime contract. */
function createDoctorProviderRuntime(): AnkhProviderRuntime {
  const packageRoot = process.cwd();
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const providerMetadata = {
    capabilities: DOCTOR_FIXTURE_CAPABILITIES,
    category: 'doctor',
    provider: './tests/fixtures/canonicalDoctorProvider.ts',
  } as const;

  const discoveredPackage: AnkhDiscoveredPackage = {
    metadata: providerMetadata,
    packageJsonPath,
    packageName: '@ankhorage/doctor',
    packageRoot,
    source: 'installed-dependency',
  };
  const entry = {
    description: doctorPackageJson.description,
    metadata: providerMetadata,
    packageName: '@ankhorage/doctor',
    repositoryUrl: 'https://github.com/ankhorage/doctor',
    version: doctorPackageJson.version,
  };

  return {
    resolveCatalogAsync: () => Promise.resolve({ entries: [entry] }),
    resolvePackageAsync: () => Promise.resolve(discoveredPackage),
  };
}

/*** Create a captured test command context. */
function createCapturedContext(cwd: string) {
  const stdout = { value: '' };
  const stderr = { value: '' };
  const context: AnkhCommandContext = {
    cwd,
    env: {},
    version: 'test',
    writeStdout(text) {
      stdout.value += text;
    },
    writeStderr(text) {
      stderr.value += text;
    },
  };
  return { context, stderr, stdout };
}

/*** Create the native OAuth manifest exercised through Doctor validation. */
function createManifest() {
  return {
    deploy: {
      targets: {
        android: { enabled: true, package: 'com.ankh.android', scheme: 'ankh-android' },
        ios: { enabled: true, bundleIdentifier: 'com.ankh.ios', scheme: 'ankh-ios' },
      },
    },
    infra: {
      secretStore: { provider: 'supabase-vault' },
      auth: {
        scope: 'global',
        provider: 'supabase',
        oauth: {
          enabled: true,
          callbackRoute: '/auth/callback',
          providers: [{ id: 'google', enabled: true, credentialsRef: 'auth/oauth/google' }],
        },
      },
    },
  };
}

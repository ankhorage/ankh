import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { runCli } from '../src/cli/index.js';
import type { AnkhCommandContext } from '../src/commandContext.js';

test('root CLI surfaces Doctor 0.10 native OAuth readiness', async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ankh-doctor-auth5-'));
  try {
    const manifestPath = path.join(fixture, 'ankh.config.json');
    await fs.writeFile(manifestPath, `${JSON.stringify(createManifest(), null, 2)}\n`, 'utf8');
    const captured = createCapturedContext(fixture);

    const result = await runCli(['doctor', 'validate', manifestPath], {
      context: captured.context,
      discoverPackages: () => Promise.resolve({ diagnostics: [], packages: [] }),
      loadProviders: () => Promise.resolve({ diagnostics: [], providers: [] }),
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

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { createFileConsumerProviderManifestSource } from '../src/features/providers/adapters/outbound/createFileConsumerProviderManifestSource.js';

test('resolves a caret from installed exact consumer bytes, not catalog latest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ankh-provider-caret-'));
  const source = createFileConsumerProviderManifestSource();
  try {
    await writeFile(path.join(root, 'package.json'), '{"name":"consumer"}\n');
    const installed = path.join(root, 'node_modules', '@ankhorage', 'devtools');
    await mkdir(installed, { recursive: true });
    await writeFile(
      path.join(installed, 'package.json'),
      '{"name":"@ankhorage/devtools","version":"2.4.3"}\n',
    );
    expect(await source.readInstalledVersionAsync(root, '@ankhorage/devtools', '^2.4.2')).toBe(
      '2.4.3',
    );
    expect(await source.readInstalledVersionAsync(root, '@ankhorage/devtools', '^3.0.0')).toBeNull();
    expect(await source.readInstalledVersionAsync(root, '@ankhorage/missing', '^2.4.2')).toBeNull();
    await expect(source.readInstalledVersionAsync(root, '../escape', '^2.4.2')).rejects.toThrow(
      'Invalid provider package name',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects installed files with a mismatched provider identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ankh-provider-identity-'));
  try {
    await writeFile(path.join(root, 'package.json'), '{"name":"consumer"}\n');
    const installed = path.join(root, 'node_modules', '@ankhorage', 'devtools');
    await mkdir(installed, { recursive: true });
    await writeFile(path.join(installed, 'package.json'), '{"name":"fake","version":"2.4.2"}\n');
    const source = createFileConsumerProviderManifestSource();
    await expect(source.readInstalledVersionAsync(root, '@ankhorage/devtools', '^2.4.2')).rejects.toThrow(
      'Installed provider metadata is invalid',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { readPackagePresentation } from '../src/features/help/readPackagePresentation.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('readPackagePresentation', () => {
  it('reads the package description and normalizes the repository URL', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ankh-package-presentation-'));
    temporaryDirectories.push(root);
    const packageJsonPath = path.join(root, 'package.json');
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(
        {
          description: 'Headless project update analysis and execution.',
          repository: {
            type: 'git',
            url: 'git+https://github.com/ankhorage/apm.git',
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await expect(readPackagePresentation(packageJsonPath)).resolves.toEqual({
      description: 'Headless project update analysis and execution.',
      repositoryUrl: 'https://github.com/ankhorage/apm',
    });
  });
});

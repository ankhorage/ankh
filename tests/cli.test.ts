import { describe, expect, it } from 'bun:test';

import packageJson from '../package.json';
import { runCli } from '../src/cli.js';
import type { AnkhCommandContext } from '../src/commandContext.js';

const FORBIDDEN_CATEGORY_NAMES = [
  'infra',
  'studio',
  'board',
  'doctor',
  'dev',
  'runtime',
  'templates',
  'orchestrator',
];

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
  it('prints help when called with no args', async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli([], { context });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toContain('Ankh CLI');
    expect(stdout.value).toContain('ankh commands');
    expect(stderr.value).toBe('');
  });

  it('prints help for help aliases', async () => {
    for (const argv of [['--help'], ['-h'], ['help']] as const) {
      const { context, stdout, stderr } = createMemoryContext();

      const result = await runCli(argv, { context });

      expect(result).toEqual({ exitCode: 0 });
      expect(stdout.value).toContain('Built-ins:');
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

  it('prints the empty registry message for commands', async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(['commands'], { context });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout.value).toBe('No Ankh command providers are registered yet.\n');
    expect(stderr.value).toBe('');
  });

  it('returns non-zero for unknown commands', async () => {
    const { context, stdout, stderr } = createMemoryContext();

    const result = await runCli(['something', 'else'], { context });

    expect(result).toEqual({ exitCode: 1 });
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Unknown Ankh command: something else');
    expect(stderr.value).toContain('ankh commands');
    expect(stderr.value).toContain('ankh --help');
  });

  it('does not mention hardcoded provider categories in bootstrap output', async () => {
    for (const argv of [[], ['commands'], ['unknown']] as const) {
      const { context, stdout, stderr } = createMemoryContext();
      await runCli(argv, { context });

      const output = `${stdout.value}\n${stderr.value}`;
      for (const categoryName of FORBIDDEN_CATEGORY_NAMES) {
        expect(output).not.toContain(categoryName);
      }
    }
  });
});

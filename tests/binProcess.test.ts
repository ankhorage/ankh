import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import packageJson from '../package.json';

const temporaryDirectories: string[] = [];
const repositoryRoot = path.dirname(import.meta.dir);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('keeps a published MCP provider alive through the built binary until STDIO closes', async () => {
  const fixture = await createFixtureAsync();

  await expectCommandAsync(fixture, ['--version'], 0, packageJson.version);
  await expectCommandAsync(fixture, ['mcp', 'add', '@fixture/provider'], 0, '@fixture/provider');
  await expectCommandAsync(fixture, ['mcp', 'list'], 0, '@fixture/provider');
  await expectCommandAsync(fixture, ['mcp', 'doctor'], 0, 'fixture');

  const server = startCommand(fixture, ['mcp', 'serve']);
  try {
    server.send({
      id: 1,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'ankh-process-test', version: '1.0.0' },
        protocolVersion: '2025-06-18',
      },
    });
    expect(await server.readAsync(1)).toMatchObject({
      result: { capabilities: { tools: {} }, serverInfo: { name: '@ankhorage/mcp' } },
    });
    expect(server.child.exitCode).toBeNull();

    server.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    server.send({ id: 2, jsonrpc: '2.0', method: 'tools/list', params: {} });
    const listedTools = JSON.stringify(await server.readAsync(2));
    expect(listedTools).toContain('fixture.echo');
    expect(listedTools).toContain('fixture.account-read');

    server.send({
      id: 3,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: {}, name: 'fixture.echo' },
    });
    expect(await server.readAsync(3)).toMatchObject({
      result: { content: [{ text: '{"ok":true}', type: 'text' }] },
    });
    expect(server.child.exitCode).toBeNull();

    server.send({
      id: 4,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: { accountId: 'allowed' }, name: 'fixture.account-read' },
    });
    expect(await server.readAsync(4)).toMatchObject({
      result: { content: [{ text: '{"accountId":"allowed"}', type: 'text' }] },
    });

    server.send({
      id: 5,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: { accountId: 'denied' }, name: 'fixture.account-read' },
    });
    const rejectedCall = JSON.stringify(await server.readAsync(5));
    expect(rejectedCall).toContain('account-not-allowed');
    expect(rejectedCall).toContain('"isError":true');
  } finally {
    server.closeStdin();
  }
  expect(await server.exitedAsync()).toBe(0);

  const failingWorkspace = await createFailingWorkspaceAsync();
  const failingResult = await runCommandAsync(failingWorkspace, fixture.cacheDirectory, [
    'mcp',
    'serve',
  ]);
  expect(failingResult.exitCode).toBe(1);
  expect(failingResult.stderr).toContain('MCP server failed to initialize.');
}, 60_000);

async function createFixtureAsync(): Promise<{
  readonly cacheDirectory: string;
  readonly cwd: string;
}> {
  const root = await createTemporaryDirectoryAsync('ankh-bin-process-');
  const cacheDirectory = readPublishedMcpProviderCacheDirectory();
  const mcpProviderVersion = await readPublishedMcpProviderVersionAsync(cacheDirectory);
  const cwd = path.join(root, 'workspace');
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, 'package.json'), '{"name":"fixture-workspace","type":"module"}\n');
  await mkdir(path.join(cwd, '.ankh'), { recursive: true });
  await writeFile(
    path.join(cwd, '.ankh', 'mcp.json'),
    '{"allowedAccounts":["allowed"],"packages":["@fixture/provider"]}\n',
  );
  await writeFixtureIntegrationAsync(cwd);
  await writeProviderCatalogAsync(cacheDirectory, mcpProviderVersion);
  return { cacheDirectory, cwd };
}

/*** Reads the CI-provisioned cache containing the independently published MCP provider. */
function readPublishedMcpProviderCacheDirectory(): string {
  const cacheDirectory = process.env.ANKH_PUBLISHED_MCP_PROVIDER_CACHE_DIR;
  if (cacheDirectory === undefined || cacheDirectory.length === 0) {
    throw new Error(
      'Set ANKH_PUBLISHED_MCP_PROVIDER_CACHE_DIR to run the published MCP consumer acceptance.',
    );
  }
  return cacheDirectory;
}

/*** Reads the exact provider version installed by the independent published-consumer setup. */
async function readPublishedMcpProviderVersionAsync(cacheDirectory: string): Promise<string> {
  const packageJsonPath = path.join(
    cacheDirectory,
    'providers',
    'node_modules',
    '@ankhorage',
    'mcp',
    'package.json',
  );
  const packageJson: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  if (!isPublishedMcpPackageJson(packageJson)) {
    throw new Error(`Expected the published @ankhorage/mcp package at ${packageJsonPath}.`);
  }
  return packageJson.version;
}

/*** Verifies the package manifest belongs to the MCP provider used by this acceptance boundary. */
function isPublishedMcpPackageJson(
  value: unknown,
): value is { readonly name: '@ankhorage/mcp'; readonly version: string } {
  if (typeof value !== 'object' || value === null) return false;
  const { name, version } = value as Record<string, unknown>;
  return name === '@ankhorage/mcp' && typeof version === 'string' && version.length > 0;
}

async function createFailingWorkspaceAsync(): Promise<string> {
  const cwd = await createTemporaryDirectoryAsync('ankh-bin-failure-');
  await writeFile(path.join(cwd, 'package.json'), '{"name":"failing-workspace","type":"module"}\n');
  await mkdir(path.join(cwd, '.ankh'), { recursive: true });
  await writeFile(path.join(cwd, '.ankh', 'mcp.json'), '{"packages":["@fixture/missing"]}\n');
  return cwd;
}

async function writeFixtureIntegrationAsync(cwd: string): Promise<void> {
  const providerDirectory = path.join(cwd, 'node_modules', '@fixture', 'provider');
  await mkdir(providerDirectory, { recursive: true });
  await writeFile(
    path.join(providerDirectory, 'package.json'),
    '{"name":"@fixture/provider","type":"module","exports":{"./mcp":{"import":"./mcp.js"}}}\n',
  );
  await writeFile(
    path.join(providerDirectory, 'mcp.js'),
    "export const integration = { id: 'fixture', tools: [" +
      "{ id: 'echo', title: 'Echo', description: 'Echo fixture', risk: 'read', scope: 'global', inputSchema: { type: 'object', additionalProperties: false }, executeAsync: async () => ({ ok: true }) }," +
      "{ id: 'account-read', title: 'Account read', description: 'Read fixture account', risk: 'read', scope: 'account', accountId: (input) => typeof input.accountId === 'string' ? input.accountId : null, inputSchema: { type: 'object', required: ['accountId'], properties: { accountId: { type: 'string' } }, additionalProperties: false }, executeAsync: async (input) => ({ accountId: input.accountId }) }" +
      '] };\n',
  );
}

async function writeProviderCatalogAsync(
  cacheDirectory: string,
  mcpProviderVersion: string,
): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(
    path.join(cacheDirectory, 'provider-catalog-v2.json'),
    `${JSON.stringify({
      cachedAtMs: Date.now(),
      entries: [
        {
          description: 'Secure, provider-neutral MCP runtime and Ankh CLI provider.',
          metadata: {
            capabilities: [
              createMcpCapability('mcp.add'),
              createMcpCapability('mcp.list'),
              createMcpCapability('mcp.doctor'),
              createMcpCapability('mcp.serve'),
            ],
            category: 'mcp',
            provider: './dist/cli/index.js',
          },
          packageName: '@ankhorage/mcp',
          repositoryUrl: 'https://github.com/ankhorage/mcp',
          version: mcpProviderVersion,
        },
      ],
    })}\n`,
  );
}

function createMcpCapability(id: string) {
  return {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    id,
    owner: '@ankhorage/mcp',
  };
}

async function expectCommandAsync(
  fixture: { readonly cacheDirectory: string; readonly cwd: string },
  args: readonly string[],
  exitCode: number,
  expectedStdout: string,
): Promise<void> {
  const result = await runCommandAsync(fixture.cwd, fixture.cacheDirectory, args);
  expect(result.exitCode).toBe(exitCode);
  expect(result.stdout).toContain(expectedStdout);
}

function startCommand(
  fixture: { readonly cacheDirectory: string; readonly cwd: string },
  args: readonly string[],
): StdioCommand {
  const child = spawn(process.execPath, [path.join(repositoryRoot, 'dist', 'bin.js'), ...args], {
    cwd: fixture.cwd,
    env: { ...process.env, ANKH_CACHE_DIR: fixture.cacheDirectory },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return createStdioCommand(child);
}

async function runCommandAsync(
  cwd: string,
  cacheDirectory: string,
  args: readonly string[],
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const child = spawn(process.execPath, [path.join(repositoryRoot, 'dist', 'bin.js'), ...args], {
    cwd,
    env: { ...process.env, ANKH_CACHE_DIR: cacheDirectory },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    waitForExitAsync(child),
    readStreamAsync(child.stdout),
    readStreamAsync(child.stderr),
  ]);
  return { exitCode, stderr, stdout };
}

interface StdioCommand {
  readonly child: ReturnType<typeof spawn>;
  closeStdin(): void;
  exitedAsync(): Promise<number>;
  readAsync(id: number): Promise<unknown>;
  send(message: unknown): void;
}

function createStdioCommand(child: ReturnType<typeof spawn>): StdioCommand {
  const messages = new Map<number, unknown>();
  const waiters = new Map<number, (message: unknown) => void>();
  const { stdin, stdout } = child;
  if (stdin === null || stdout === null) throw new Error('Expected piped STDIO streams.');
  let bufferedStdout = '';
  stdout.on('data', (chunk: Buffer) => {
    bufferedStdout += chunk.toString('utf8');
    const lines = bufferedStdout.split('\n');
    bufferedStdout = lines.pop() ?? '';
    for (const line of lines) recordMessage(line, messages, waiters);
  });
  return {
    child,
    closeStdin() {
      stdin.end();
    },
    exitedAsync() {
      return waitForExitAsync(child);
    },
    readAsync(id) {
      const message = messages.get(id);
      if (message !== undefined) return Promise.resolve(message);
      return new Promise((resolve) => waiters.set(id, resolve));
    },
    send(message) {
      stdin.write(`${JSON.stringify(message)}\n`);
    },
  };
}

function recordMessage(
  line: string,
  messages: Map<number, unknown>,
  waiters: Map<number, (message: unknown) => void>,
): void {
  const message: unknown = JSON.parse(line);
  if (typeof message !== 'object' || message === null || !('id' in message)) return;
  const { id } = message as { readonly id?: unknown };
  if (typeof id !== 'number') return;
  const waiter = waiters.get(id);
  if (waiter !== undefined) {
    waiters.delete(id);
    waiter(message);
    return;
  }
  messages.set(id, message);
}

function waitForExitAsync(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

async function readStreamAsync(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function createTemporaryDirectoryAsync(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

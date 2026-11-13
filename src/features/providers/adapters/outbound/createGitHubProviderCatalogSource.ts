import { areCapabilitiesEqual } from '@ankhorage/capability';
import type { Capability } from '@ankhorage/contracts/capability';

import type { AnkhProviderCatalogEntry } from '../../../../types/providers.js';
import type { ProviderCatalogSource } from '../../application/ports/outbound/providerCatalogSource.js';
import { parsePublishedProviderEntry } from '../../domain/parsePublishedProviderEntry.js';

const DEFAULT_GITHUB_ORGANIZATION = 'ankhorage';
const GITHUB_PAGE_SIZE = 100;
const MAX_GITHUB_PAGES = 100;
const MAX_CONCURRENT_REPOSITORIES = 5;
const MAX_REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_BASE_DELAY_MS = 250;

type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type DelayAsync = (milliseconds: number) => Promise<void>;

interface RemoteRequest {
  readonly init?: RequestInit;
  readonly phase: string;
  readonly source: string;
  readonly url: string;
}

/*** Create the GitHub-backed source for the official Ankhorage provider catalog. */
export function createGitHubProviderCatalogSource(
  options: {
    readonly fetchImpl?: FetchFunction;
    readonly organization?: string;
    readonly random?: () => number;
    readonly requestTimeoutMs?: number;
    readonly retryDelayAsync?: DelayAsync;
    readonly token?: string;
  } = {},
): ProviderCatalogSource {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const organization = options.organization ?? DEFAULT_GITHUB_ORGANIZATION;
  const token = options.token?.trim();
  const requestPolicy = {
    random: options.random ?? Math.random,
    requestTimeoutMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    retryDelayAsync: options.retryDelayAsync ?? sleepAsync,
  };

  return {
    async readAsync() {
      const repositories = await readRepositoriesAsync(
        fetchImpl,
        organization,
        token,
        requestPolicy,
      );
      const candidates = repositories.filter(
        (repository) => !repository.archived && !repository.fork,
      );
      const entries = (
        await mapInBatchesAsync(candidates, MAX_CONCURRENT_REPOSITORIES, (repository) =>
          readProviderEntryAsync(fetchImpl, organization, repository, requestPolicy),
        )
      ).filter((entry): entry is AnkhProviderCatalogEntry => entry !== null);

      validateCatalogUniqueness(entries);
      return entries.sort((left, right) =>
        left.metadata.category.localeCompare(right.metadata.category),
      );
    },
  };
}

interface GitHubRepository {
  readonly archived: boolean;
  readonly defaultBranch: string;
  readonly fork: boolean;
  readonly name: string;
  readonly repositoryUrl: string;
}

interface RequestPolicy {
  readonly random: () => number;
  readonly requestTimeoutMs: number;
  readonly retryDelayAsync: DelayAsync;
}

/*** Read all public repositories in the provider organization. */
async function readRepositoriesAsync(
  fetchImpl: FetchFunction,
  organization: string,
  token: string | undefined,
  requestPolicy: RequestPolicy,
): Promise<readonly GitHubRepository[]> {
  const pages = Array.from({ length: MAX_GITHUB_PAGES }, (_, index) => index + 1);
  const repositories: GitHubRepository[] = [];

  for (const page of pages) {
    const source = `GitHub API page ${page}`;
    const response = await readRemoteResponseAsync(
      fetchImpl,
      {
        init: {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ankh-cli',
            ...(token === undefined || token === '' ? {} : { Authorization: `Bearer ${token}` }),
          },
        },
        phase: 'GitHub repository discovery',
        source,
        url: `https://api.github.com/orgs/${encodeURIComponent(organization)}/repos?type=public&per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
      },
      requestPolicy,
    );
    const rawPage = await readJsonAsync(response, source, 'GitHub repository discovery');
    if (!Array.isArray(rawPage)) {
      throw new Error('GitHub repository discovery returned an invalid repository list.');
    }

    const pageRepositories = rawPage
      .map(parseRepository)
      .filter((repository): repository is GitHubRepository => repository !== null);
    repositories.push(...pageRepositories);

    if (rawPage.length < GITHUB_PAGE_SIZE) return repositories;
  }

  throw new Error(
    `GitHub repository discovery exceeded the ${MAX_GITHUB_PAGES}-page safety limit.`,
  );
}

/*** Parse the GitHub fields required for provider metadata discovery. */
function parseRepository(value: unknown): GitHubRepository | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.name !== 'string' ||
    typeof value.default_branch !== 'string' ||
    typeof value.archived !== 'boolean' ||
    typeof value.fork !== 'boolean' ||
    typeof value.html_url !== 'string'
  ) {
    return null;
  }

  return {
    archived: value.archived,
    defaultBranch: value.default_branch,
    fork: value.fork,
    name: value.name,
    repositoryUrl: value.html_url,
  };
}

/*** Resolve one repository candidate to the latest published npm provider metadata. */
async function readProviderEntryAsync(
  fetchImpl: FetchFunction,
  organization: string,
  repository: GitHubRepository,
  requestPolicy: RequestPolicy,
): Promise<AnkhProviderCatalogEntry | null> {
  const rawSource = `raw.githubusercontent.com/${repository.name}/package.json`;
  const response = await readRemoteResponseAsync(
    fetchImpl,
    {
      phase: `provider package discovery for repository "${repository.name}"`,
      source: rawSource,
      url: `https://raw.githubusercontent.com/${encodeURIComponent(organization)}/${encodeURIComponent(repository.name)}/${encodeURIComponent(repository.defaultBranch)}/package.json`,
    },
    requestPolicy,
    true,
  );
  if (response.status === 404) return null;

  const rawCandidatePackage = await readJsonAsync(
    response,
    rawSource,
    'provider package discovery',
  );
  if (!isRecord(rawCandidatePackage)) return null;
  const packageName = readNonEmptyString(rawCandidatePackage.name);
  if (!packageName?.startsWith('@ankhorage/')) return null;

  return readPublishedProviderEntryAsync(fetchImpl, packageName, repository, requestPolicy);
}

/*** Read the latest published npm manifest so catalog state is always installable. */
async function readPublishedProviderEntryAsync(
  fetchImpl: FetchFunction,
  packageName: string,
  repository: GitHubRepository,
  requestPolicy: RequestPolicy,
): Promise<AnkhProviderCatalogEntry | null> {
  const source = `npm package metadata for ${packageName}`;
  const response = await readRemoteResponseAsync(
    fetchImpl,
    {
      init: { headers: { Accept: 'application/json' } },
      phase: `published provider resolution for package "${packageName}"`,
      source,
      url: `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    },
    requestPolicy,
    true,
  );
  if (response.status === 404) return null;

  const rawPublishedPackage = await readJsonAsync(
    response,
    source,
    'published provider resolution',
  );
  if (!isRecord(rawPublishedPackage)) {
    throw new Error(`npm returned invalid package metadata while resolving ${packageName}.`);
  }
  if (rawPublishedPackage.ankh === undefined) return null;
  if (readNonEmptyString(rawPublishedPackage.name) !== packageName) {
    throw new Error(`npm returned mismatched package metadata while resolving ${packageName}.`);
  }

  const entry = parsePublishedProviderEntry(rawPublishedPackage, repository.repositoryUrl);
  return entry?.packageName === packageName ? entry : null;
}

/*** Fetch one remote source with timeout, bounded retries, and sanitized diagnostics. */
async function readRemoteResponseAsync(
  fetchImpl: FetchFunction,
  request: RemoteRequest,
  requestPolicy: RequestPolicy,
  allowsNotFound = false,
): Promise<Response> {
  const attempts = Array.from({ length: MAX_REQUEST_ATTEMPTS }, (_, index) => index + 1);

  for (const attempt of attempts) {
    try {
      const response = await fetchWithTimeoutAsync(
        fetchImpl,
        request.url,
        request.init,
        requestPolicy.requestTimeoutMs,
      );
      if (response.ok || (allowsNotFound && response.status === 404)) return response;
      if (!isRetryableStatus(response.status)) {
        throw requestFailureError(request, `HTTP ${response.status}`, attempt, false);
      }
      if (attempt === MAX_REQUEST_ATTEMPTS) {
        throw requestFailureError(request, `HTTP ${response.status}`, attempt, true);
      }
      await discardResponseBodyAsync(response);
      await requestPolicy.retryDelayAsync(retryDelayMs(response, attempt, requestPolicy.random));
    } catch (error) {
      if (isCatalogRequestError(error)) throw error;
      const retryable = isTransientRequestError(error);
      if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) {
        throw requestFailureError(request, requestErrorCategory(error), attempt, retryable);
      }
      await requestPolicy.retryDelayAsync(retryDelayMs(undefined, attempt, requestPolicy.random));
    }
  }

  throw new Error('Provider catalog request attempts were unexpectedly exhausted.');
}

/*** Invoke fetch with an abort signal and release its timer on every settled path. */
async function fetchWithTimeoutAsync(
  fetchImpl: FetchFunction,
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError());
    }, timeoutMs);
    void Promise.resolve()
      .then(() => fetchImpl(url, { ...init, signal: controller.signal }))
      .then(
        (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(toError(error));
        },
      );
  });
}

/*** Convert an unknown fetch rejection into the Error boundary used by request diagnostics. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Provider catalog request failed.');
}

/*** Parse a JSON response while retaining source context without exposing response content. */
async function readJsonAsync(response: Response, source: string, phase: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`Provider catalog ${phase} received invalid JSON from ${source}.`);
  }
}

/*** Process asynchronous operations in fixed-size batches without unbounded remote work. */
async function mapInBatchesAsync<Input, Output>(
  values: readonly Input[],
  batchSize: number,
  operation: (value: Input) => Promise<Output>,
): Promise<readonly Output[]> {
  const batches = Array.from({ length: Math.ceil(values.length / batchSize) }, (_, index) =>
    values.slice(index * batchSize, (index + 1) * batchSize),
  );
  const results: Output[] = [];
  for (const batch of batches) results.push(...(await Promise.all(batch.map(operation))));
  return results;
}

/*** Delay a retry without retaining timers after the retry has begun. */
function sleepAsync(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/*** Discard a retryable response body before the following request opens another connection. */
async function discardResponseBodyAsync(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A failed cancellation does not change the retry decision.
  }
}

/*** Calculate a jittered retry delay while honoring explicit server retry guidance. */
function retryDelayMs(
  response: Response | undefined,
  attempt: number,
  random: () => number,
): number {
  const serverDelayMs = response === undefined ? null : readServerRetryDelayMs(response);
  if (serverDelayMs !== null) return serverDelayMs;
  const exponentialDelayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.round(exponentialDelayMs * (0.5 + random()));
}

/*** Read Retry-After or GitHub rate-limit reset delays from a response. */
function readServerRetryDelayMs(response: Response): number | null {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  return Number.isFinite(resetSeconds) && resetSeconds > 0
    ? Math.max(0, resetSeconds * 1_000 - Date.now())
    : null;
}

/*** Identify HTTP responses that can recover without changing provider metadata. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/*** Identify connection and timeout errors that can be retried safely. */
function isTransientRequestError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? String(error.code) : '';
  return (
    /ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT/u.test(code) ||
    /socket|connection|network|fetch failed|timed out|timeout/u.test(error.message)
  );
}

/*** Categorize a request failure without including raw error details in user-facing diagnostics. */
function requestErrorCategory(error: unknown): string {
  return error instanceof RequestTimeoutError ? 'request timeout' : 'network connection error';
}

/*** Create a concise diagnostic that identifies the failed catalog source and retry state. */
function requestFailureError(
  request: RemoteRequest,
  category: string,
  attempt: number,
  retriesExhausted: boolean,
): CatalogRequestError {
  const retryState = retriesExhausted
    ? `retries exhausted after ${attempt} attempts`
    : 'not retried';
  return new CatalogRequestError(
    `Provider catalog ${request.phase} failed from ${request.source} (${category}; ${retryState}).`,
  );
}

/*** Identify failures already sanitized for provider-catalog diagnostics. */
function isCatalogRequestError(error: unknown): error is CatalogRequestError {
  return error instanceof CatalogRequestError;
}

class CatalogRequestError extends Error {}

class RequestTimeoutError extends Error {}

/*** Reject ambiguous categories or conflicting canonical capabilities in the remote catalog. */
function validateCatalogUniqueness(entries: readonly AnkhProviderCatalogEntry[]): void {
  const categories = new Map<string, string>();
  const capabilities = new Map<
    string,
    { readonly capability: Capability; readonly packageName: string }
  >();

  for (const entry of entries) {
    const categoryOwner = categories.get(entry.metadata.category);
    if (categoryOwner !== undefined) {
      throw new Error(
        `Duplicate Ankh category "${entry.metadata.category}" declared by ${categoryOwner} and ${entry.packageName}.`,
      );
    }
    categories.set(entry.metadata.category, entry.packageName);

    for (const capability of entry.metadata.capabilities) {
      const existing = capabilities.get(capability.id);
      if (existing !== undefined) {
        if (!areCapabilitiesEqual(existing.capability, capability)) {
          throw new Error(
            `Conflicting Ankh capability "${capability.id}" declared by ${existing.packageName} and ${entry.packageName}.`,
          );
        }
        continue;
      }
      capabilities.set(capability.id, { capability, packageName: entry.packageName });
    }
  }
}

/*** Read a trimmed non-empty string. */
function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

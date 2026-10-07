import type { Capability } from '@ankhorage/contracts/capabilities';
import type { AnkhPackageMetadata, AnkhProviderReference } from '@ankhorage/contracts/cli';

import type { AnkhProviderCatalogEntry } from '../../../../types/providers.js';
import { areCapabilitiesEqual } from '../../../../utils/areCapabilitiesEqual.js';
import { parseCapability } from '../../../../utils/parseCapability.js';
import type { ProviderCatalogSource } from '../../application/ports/outbound/providerCatalogSource.js';

const DEFAULT_GITHUB_ORGANIZATION = 'ankhorage';
const GITHUB_PAGE_SIZE = 100;

type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/*** Create the GitHub-backed source for the official Ankhorage provider catalog. */
export function createGitHubProviderCatalogSource(
  options: {
    readonly fetchImpl?: FetchFunction;
    readonly organization?: string;
    readonly token?: string;
  } = {},
): ProviderCatalogSource {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const organization = options.organization ?? DEFAULT_GITHUB_ORGANIZATION;
  const token = options.token?.trim();

  return {
    async readAsync() {
      const repositories = await readRepositoriesAsync(fetchImpl, organization, token);
      const entries = (
        await Promise.all(
          repositories
            .filter((repository) => !repository.archived && !repository.fork)
            .map((repository) => readProviderEntryAsync(fetchImpl, organization, repository)),
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

/*** Read all public repositories in the provider organization. */
async function readRepositoriesAsync(
  fetchImpl: FetchFunction,
  organization: string,
  token: string | undefined,
): Promise<readonly GitHubRepository[]> {
  const repositories: GitHubRepository[] = [];

  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/orgs/${encodeURIComponent(organization)}/repos?type=public&per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ankh-cli',
          ...(token === undefined || token === '' ? {} : { Authorization: `Bearer ${token}` }),
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub provider discovery failed with HTTP ${response.status}.`);
    }

    const rawPage: unknown = await response.json();
    if (!Array.isArray(rawPage)) {
      throw new Error('GitHub provider discovery returned an invalid repository list.');
    }

    const pageRepositories = rawPage
      .map(parseRepository)
      .filter((repository): repository is GitHubRepository => repository !== null);
    repositories.push(...pageRepositories);

    if (rawPage.length < GITHUB_PAGE_SIZE) return repositories;
  }
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
): Promise<AnkhProviderCatalogEntry | null> {
  const response = await fetchImpl(
    `https://raw.githubusercontent.com/${encodeURIComponent(organization)}/${encodeURIComponent(repository.name)}/${encodeURIComponent(repository.defaultBranch)}/package.json`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Could not read ${repository.name}/package.json from GitHub (HTTP ${response.status}).`,
    );
  }

  const rawCandidatePackage: unknown = await response.json();
  if (!isRecord(rawCandidatePackage)) return null;
  const packageName = readNonEmptyString(rawCandidatePackage.name);
  if (!packageName?.startsWith('@ankhorage/')) return null;

  return readPublishedProviderEntryAsync(fetchImpl, packageName, repository);
}

/*** Read the latest published npm manifest so catalog state is always installable. */
async function readPublishedProviderEntryAsync(
  fetchImpl: FetchFunction,
  packageName: string,
  repository: GitHubRepository,
): Promise<AnkhProviderCatalogEntry | null> {
  const response = await fetchImpl(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    { headers: { Accept: 'application/json' } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Could not read latest published metadata for ${packageName} from npm (HTTP ${response.status}).`,
    );
  }

  const rawPublishedPackage: unknown = await response.json();
  if (!isRecord(rawPublishedPackage) || rawPublishedPackage.ankh === undefined) return null;
  if (readNonEmptyString(rawPublishedPackage.name) !== packageName) {
    throw new Error(`npm returned mismatched package metadata while resolving ${packageName}.`);
  }

  return parseProviderEntry(rawPublishedPackage, repository);
}

/*** Parse one package manifest and return its validated CLI-provider entry when present. */
function parseProviderEntry(
  rawPackage: Record<string, unknown>,
  repository: GitHubRepository,
): AnkhProviderCatalogEntry | null {
  const packageName = readNonEmptyString(rawPackage.name);
  const version = readNonEmptyString(rawPackage.version);
  if (!packageName?.startsWith('@ankhorage/')) {
    throw new Error(
      `${repository.name} declares Ankh metadata without an @ankhorage package name.`,
    );
  }
  if (version === null) {
    throw new Error(`${packageName} declares Ankh metadata without a valid package version.`);
  }
  if (!isRecord(rawPackage.ankh)) {
    throw new Error(`${packageName} package.json.ankh must be an object.`);
  }

  const metadata = parseAnkhMetadata(rawPackage.ankh, packageName);
  if (metadata.provider === null) return null;
  const providerMetadata = { ...metadata, provider: metadata.provider };
  const description = readNonEmptyString(rawPackage.description) ?? packageName;

  return {
    description,
    metadata: providerMetadata,
    packageName,
    repositoryUrl: repository.repositoryUrl,
    version,
  };
}

/*** Parse package-owned Ankh category, provider, and capability metadata. */
function parseAnkhMetadata(
  rawMetadata: Record<string, unknown>,
  packageName: string,
): AnkhPackageMetadata {
  const category = readNonEmptyString(rawMetadata.category);
  if (category === null) {
    throw new Error(`${packageName} package.json.ankh.category must be a non-empty string.`);
  }

  if (
    !('provider' in rawMetadata) ||
    (rawMetadata.provider !== null &&
      (typeof rawMetadata.provider !== 'string' || !isProviderReference(rawMetadata.provider)))
  ) {
    throw new Error(
      `${packageName} package.json.ankh.provider must be null or a package-relative path.`,
    );
  }
  const provider = typeof rawMetadata.provider === 'string' ? rawMetadata.provider : null;

  if (!Array.isArray(rawMetadata.capabilities)) {
    throw new Error(`${packageName} package.json.ankh.capabilities must be an array.`);
  }
  const capabilities: Capability[] = [];
  for (const rawCapability of rawMetadata.capabilities) {
    const capability = parseCapability(rawCapability);
    if (capability === null) {
      throw new Error(`${packageName} contains an invalid Ankh capability descriptor.`);
    }
    capabilities.push(capability);
  }

  return { capabilities, category, provider };
}

/*** Reject ambiguous categories or conflicting canonical capabilities in the remote catalog. */
function validateCatalogUniqueness(entries: readonly AnkhProviderCatalogEntry[]): void {
  const categories = new Map<string, string>();
  const capabilities = new Map<string, { readonly capability: Capability; readonly packageName: string }>();

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

/*** Validate package-relative provider references. */
function isProviderReference(value: string): value is AnkhProviderReference {
  return value.startsWith('./');
}

/*** Narrow an unknown JSON value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

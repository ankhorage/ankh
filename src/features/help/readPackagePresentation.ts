import { readFile } from 'node:fs/promises';

/***
 * Read the human-facing package description and repository URL used by CLI help.
 */
export async function readPackagePresentation(
  packageJsonPath: string,
): Promise<PackagePresentation> {
  try {
    const parsedJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
    if (!isRecord(parsedJson)) {
      return {
        description: null,
        repositoryUrl: null,
      };
    }

    return {
      description: getNonEmptyString(parsedJson.description),
      repositoryUrl: getRepositoryUrl(parsedJson.repository),
    };
  } catch {
    return {
      description: null,
      repositoryUrl: null,
    };
  }
}

interface PackagePresentation {
  readonly description: string | null;
  readonly repositoryUrl: string | null;
}

/***
 * Return a trimmed non-empty string or `null`.
 */
function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

/***
 * Normalize npm package repository metadata to a browser-friendly repository URL.
 */
function getRepositoryUrl(value: unknown): string | null {
  const rawRepositoryUrl =
    typeof value === 'string'
      ? getNonEmptyString(value)
      : isRecord(value)
        ? getNonEmptyString(value.url)
        : null;

  return rawRepositoryUrl === null ? null : normalizeRepositoryUrl(rawRepositoryUrl);
}

/***
 * Remove npm Git transport decoration from a repository URL.
 */
function normalizeRepositoryUrl(repositoryUrl: string): string {
  const withoutGitPrefix = repositoryUrl.startsWith('git+')
    ? repositoryUrl.slice('git+'.length)
    : repositoryUrl;

  return withoutGitPrefix.endsWith('.git')
    ? withoutGitPrefix.slice(0, -'.git'.length)
    : withoutGitPrefix;
}

/***
 * Narrow an unknown JSON value to a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

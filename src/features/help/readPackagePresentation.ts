import { readFile } from 'node:fs/promises';
import path from 'node:path';

/***
 * Read the human-facing package description and repository URL used by CLI help.
 */
export async function readPackagePresentation(
  packageJsonPath: string,
): Promise<PackagePresentation> {
  const fallbackRepositoryUrl = getAnkhorageRepositoryUrlFromPath(packageJsonPath);

  try {
    const parsedJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
    if (!isRecord(parsedJson)) {
      return {
        description: null,
        repositoryUrl: fallbackRepositoryUrl,
      };
    }

    return {
      description: getNonEmptyString(parsedJson.description),
      repositoryUrl: getRepositoryUrl(parsedJson.repository) ?? fallbackRepositoryUrl,
    };
  } catch {
    return {
      description: null,
      repositoryUrl: fallbackRepositoryUrl,
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
 * Derive the conventional Ankhorage repository URL from an installed scoped package path.
 */
function getAnkhorageRepositoryUrlFromPath(packageJsonPath: string): string | null {
  const packageRoot = path.dirname(packageJsonPath);
  const scopeRoot = path.dirname(packageRoot);

  if (path.basename(scopeRoot) !== '@ankhorage') {
    return null;
  }

  const packageName = path.basename(packageRoot);
  return packageName === '' ? null : `https://github.com/ankhorage/${packageName}`;
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

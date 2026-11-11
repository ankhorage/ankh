import type { ProviderReleaseSource } from '../../application/ports/outbound/providerReleaseSource.js';
import { parsePublishedProviderEntry } from '../../domain/parsePublishedProviderEntry.js';

type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/*** Create the npm adapter that resolves one explicitly selected published provider release. */
export function createNpmProviderReleaseSource(
  options: { readonly fetchImpl?: FetchFunction } = {},
): ProviderReleaseSource {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  return {
    async resolveAsync({ catalogEntry, version }) {
      const response = await fetchImpl(
        `https://registry.npmjs.org/${encodeURIComponent(catalogEntry.packageName)}/${encodeURIComponent(version)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (response.status === 404) {
        throw new Error(
          `Published provider ${catalogEntry.packageName}@${version} does not exist.`,
        );
      }
      if (!response.ok) {
        throw new Error(
          `Could not resolve ${catalogEntry.packageName}@${version} from npm (HTTP ${response.status}).`,
        );
      }
      const entry = parsePublishedProviderEntry(await response.json(), catalogEntry.repositoryUrl);
      if (entry?.packageName !== catalogEntry.packageName || entry.version !== version) {
        throw new Error(
          `npm returned invalid provider metadata for ${catalogEntry.packageName}@${version}.`,
        );
      }
      return entry;
    },
  };
}

import type {
  AnkhInputValueCandidates,
  AnkhInputValueOrigin,
  AnkhResolvedInputValue,
} from '../../../types/inputResolution.js';

/***
 * Resolve one user-facing value with canonical Ankh precedence.
 *
 * The precedence is explicit override, CLI, environment, then provider default.
 * Undefined, null, empty, and whitespace-only strings are treated as absent.
 */
export function resolveAnkhInputValue(
  candidates: AnkhInputValueCandidates,
): AnkhResolvedInputValue | null {
  const values: readonly [AnkhInputValueOrigin, string | null | undefined][] = [
    ['explicit', candidates.explicit],
    ['cli', candidates.cli],
    ['environment', candidates.environment],
    ['default', candidates.defaultValue],
  ];

  for (const [origin, candidate] of values) {
    const value = normalizeCandidate(candidate);
    if (value !== null) return { value, origin };
  }

  return null;
}

/*** Normalize one precedence candidate without letting blank values mask lower-priority sources. */
function normalizeCandidate(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AnkhCapabilityId,
  AnkhPackageMetadata,
  AnkhProviderReference,
} from '@ankhorage/contracts/cli';

import type { AnkhDiscoverySource, AnkhMetadataDiscoveryDiagnostic } from './discovery.js';

export interface ReadAnkhPackageMetadataOptions {
  readonly packageJsonPath: string;
  readonly source: AnkhDiscoverySource;
}

export interface ReadAnkhPackageMetadataResult {
  readonly packageName: string | null;
  readonly packageRoot: string;
  readonly metadata: AnkhPackageMetadata | null;
  readonly diagnostics: readonly AnkhMetadataDiscoveryDiagnostic[];
}

interface ParsedPackageJson {
  readonly name?: unknown;
  readonly ankh?: unknown;
}

export async function readAnkhPackageMetadata(
  options: ReadAnkhPackageMetadataOptions,
): Promise<ReadAnkhPackageMetadataResult> {
  const packageRoot = path.dirname(options.packageJsonPath);

  let rawText: string;
  try {
    rawText = await readFile(options.packageJsonPath, 'utf8');
  } catch {
    return {
      packageName: null,
      packageRoot,
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'package-json-read-failed',
          message: 'Could not read package.json while discovering Ankh metadata.',
          packageJsonPath: options.packageJsonPath,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText) as unknown;
  } catch {
    return {
      packageName: null,
      packageRoot,
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'invalid-package-json',
          message: 'package.json is not valid JSON.',
          packageJsonPath: options.packageJsonPath,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  if (!isRecord(parsedJson)) {
    return {
      packageName: null,
      packageRoot,
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'invalid-package-json-shape',
          message: 'package.json must parse to a JSON object.',
          packageJsonPath: options.packageJsonPath,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  const packageJson = parsedJson as ParsedPackageJson;
  const packageName = getPackageName(packageJson.name);

  if (packageJson.ankh === undefined) {
    return {
      packageName,
      packageRoot,
      metadata: null,
      diagnostics: [],
    };
  }

  const nameDiagnostics =
    packageName !== null
      ? []
      : [
          createDiagnostic({
            code: 'invalid-package-name',
            message: 'package.json "name" must be a non-empty string.',
            packageJsonPath: options.packageJsonPath,
            severity: 'error',
            source: options.source,
          }),
        ];

  const metadataResult = validateAnkhMetadata({
    packageJsonPath: options.packageJsonPath,
    packageName,
    rawAnkhMetadata: packageJson.ankh,
    source: options.source,
  });

  return {
    packageName,
    packageRoot,
    metadata: metadataResult.metadata,
    diagnostics: [...nameDiagnostics, ...metadataResult.diagnostics],
  };
}

interface ValidateAnkhMetadataOptions {
  readonly packageJsonPath: string;
  readonly packageName: string | null;
  readonly rawAnkhMetadata: unknown;
  readonly source: AnkhDiscoverySource;
}

interface ValidateAnkhMetadataResult {
  readonly metadata: AnkhPackageMetadata | null;
  readonly diagnostics: readonly AnkhMetadataDiscoveryDiagnostic[];
}

function validateAnkhMetadata(options: ValidateAnkhMetadataOptions): ValidateAnkhMetadataResult {
  if (!isRecord(options.rawAnkhMetadata)) {
    return {
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'invalid-ankh-metadata',
          message: 'package.json "ankh" must be an object when present.',
          packageJsonPath: options.packageJsonPath,
          packageName: options.packageName,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  const rawCategory = options.rawAnkhMetadata.category;
  if (typeof rawCategory !== 'string' || rawCategory.trim() === '') {
    return {
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'invalid-ankh-category',
          message: 'package.json "ankh.category" must be a non-empty string.',
          packageJsonPath: options.packageJsonPath,
          packageName: options.packageName,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  const rawProvider = options.rawAnkhMetadata.provider;
  const provider =
    rawProvider === null
      ? null
      : typeof rawProvider === 'string' && isProviderReference(rawProvider)
        ? rawProvider
        : undefined;

  if (provider === undefined) {
    return {
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'invalid-ankh-provider',
          message:
            'package.json "ankh.provider" must be null or a package-relative path starting with "./".',
          packageJsonPath: options.packageJsonPath,
          packageName: options.packageName,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  const rawCapabilities = options.rawAnkhMetadata.capabilities;
  if (!Array.isArray(rawCapabilities)) {
    return {
      metadata: null,
      diagnostics: [
        createDiagnostic({
          code: 'invalid-ankh-capabilities',
          message: 'package.json "ankh.capabilities" must be an array of strings.',
          packageJsonPath: options.packageJsonPath,
          packageName: options.packageName,
          severity: 'error',
          source: options.source,
        }),
      ],
    };
  }

  const capabilities: AnkhCapabilityId[] = [];
  for (const capability of rawCapabilities) {
    if (typeof capability !== 'string' || !isCapabilityId(capability)) {
      return {
        metadata: null,
        diagnostics: [
          createDiagnostic({
            code: 'invalid-ankh-capabilities',
            message:
              'package.json "ankh.capabilities" must contain dot-separated string identifiers.',
            packageJsonPath: options.packageJsonPath,
            packageName: options.packageName,
            severity: 'error',
            source: options.source,
          }),
        ],
      };
    }

    capabilities.push(capability);
  }

  return {
    metadata: {
      category: rawCategory.trim(),
      provider,
      capabilities,
    },
    diagnostics: [],
  };
}

function getPackageName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function isCapabilityId(value: string): value is AnkhCapabilityId {
  const segments = value.split('.');
  return segments.length >= 2 && segments.every((segment) => segment.length > 0);
}

function isProviderReference(value: string): value is AnkhProviderReference {
  return value.startsWith('./');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface DiagnosticInput {
  readonly code: string;
  readonly message: string;
  readonly packageJsonPath: string;
  readonly packageName?: string | null;
  readonly severity: 'warning' | 'error';
  readonly source: AnkhDiscoverySource;
}

function createDiagnostic(input: DiagnosticInput): AnkhMetadataDiscoveryDiagnostic {
  return {
    code: input.code,
    message: input.message,
    packageJsonPath: input.packageJsonPath,
    packageName: input.packageName ?? undefined,
    severity: input.severity,
    source: input.source,
  };
}

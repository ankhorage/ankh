# Public API

## AnkhCliRunResult

Kind: `type`
Module: `src/commandContext.ts`
Source: `src/commandContext.ts:11:1`

### Members

| Name     | Kind     | Type     | Required | Description |
| -------- | -------- | -------- | -------- | ----------- |
| exitCode | property | `number` | yes      |             |

## AnkhCommandContext

Kind: `type`
Module: `src/commandContext.ts`
Source: `src/commandContext.ts:3:1`

### Members

| Name        | Kind     | Type                                            | Required | Description |
| ----------- | -------- | ----------------------------------------------- | -------- | ----------- |
| cwd         | property | `string`                                        | yes      |             |
| env         | property | `Readonly<Record<string, string \| undefined>>` | yes      |             |
| version     | property | `string`                                        | yes      |             |
| writeStderr | method   | `(text: string) => void`                        | yes      |             |
| writeStdout | method   | `(text: string) => void`                        | yes      |             |

## AnkhCommandListing

Kind: `type`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:3:1`

### Members

| Name       | Kind     | Type                             | Required | Description |
| ---------- | -------- | -------------------------------- | -------- | ----------- |
| capability | property | `${string}.${string}`            | yes      |             |
| category   | property | `string`                         | yes      |             |
| path       | property | `readonly [string, ...string[]]` | yes      |             |
| providerId | property | `string`                         | yes      |             |
| summary    | property | `string`                         | yes      |             |

## AnkhDiscoveredPackage

Kind: `type`
Module: `src/discovery.ts`
Source: `src/discovery.ts:14:1`

### Members

| Name            | Kind     | Type                  | Required | Description |
| --------------- | -------- | --------------------- | -------- | ----------- |
| metadata        | property | `AnkhPackageMetadata` | yes      |             |
| packageJsonPath | property | `string`              | yes      |             |
| packageName     | property | `string`              | yes      |             |
| packageRoot     | property | `string`              | yes      |             |
| source          | property | `AnkhDiscoverySource` | yes      |             |

## AnkhDiscoverySource

Kind: `unknown`
Module: `src/discovery.ts`
Source: `src/discovery.ts:12:1`

## AnkhMetadataDiscoveryDiagnostic

Kind: `type`
Module: `src/discovery.ts`
Source: `src/discovery.ts:22:1`

### Members

| Name            | Kind     | Type                               | Required | Description |
| --------------- | -------- | ---------------------------------- | -------- | ----------- |
| code            | property | `string`                           | yes      |             |
| message         | property | `string`                           | yes      |             |
| packageJsonPath | property | `string \| undefined`              | no       |             |
| packageName     | property | `string \| undefined`              | no       |             |
| severity        | property | `"warning" \| "error"`             | yes      |             |
| source          | property | `AnkhDiscoverySource \| undefined` | no       |             |

## AnkhMetadataDiscoveryResult

Kind: `type`
Module: `src/discovery.ts`
Source: `src/discovery.ts:31:1`

### Members

| Name        | Kind     | Type                                         | Required | Description |
| ----------- | -------- | -------------------------------------------- | -------- | ----------- |
| diagnostics | property | `readonly AnkhMetadataDiscoveryDiagnostic[]` | yes      |             |
| packages    | property | `readonly AnkhDiscoveredPackage[]`           | yes      |             |

## AnkhPackageRegistry

Kind: `type`
Module: `src/packageRegistry.ts`
Source: `src/packageRegistry.ts:3:1`

### Members

| Name         | Kind   | Type                                     | Required | Description |
| ------------ | ------ | ---------------------------------------- | -------- | ----------- |
| hasCategory  | method | `(category: string) => boolean`          | yes      |             |
| listPackages | method | `() => readonly AnkhDiscoveredPackage[]` | yes      |             |

## AnkhProviderRegistry

Kind: `type`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:11:1`

### Members

| Name          | Kind   | Type                                           | Required | Description |
| ------------- | ------ | ---------------------------------------------- | -------- | ----------- |
| hasCategory   | method | `(category: string) => boolean`                | yes      |             |
| listCommands  | method | `() => readonly AnkhCommandListing[]`          | yes      |             |
| listProviders | method | `() => readonly AnkhCommandProviderManifest[]` | yes      |             |

## createDefaultCommandContext

Kind: `function`
Module: `src/commandContext.ts`
Source: `src/commandContext.ts:18:1`

### Signatures

- `() => AnkhCommandContext`
  - returns: `AnkhCommandContext`

## createPackageRegistry

Kind: `function`
Module: `src/packageRegistry.ts`
Source: `src/packageRegistry.ts:8:1`

### Signatures

- `(packages?: readonly AnkhDiscoveredPackage[]) => AnkhPackageRegistry`
  - packages: `readonly AnkhDiscoveredPackage[]` (optional)
  - returns: `AnkhPackageRegistry`

## createProviderRegistry

Kind: `function`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:20:1`

### Signatures

- `(providers?: readonly AnkhCommandProviderManifest[]) => AnkhProviderRegistry`
  - providers: `readonly AnkhCommandProviderManifest[]` (optional)
  - returns: `AnkhProviderRegistry`

## discoverAnkhPackages

Kind: `function`
Module: `src/discovery.ts`
Source: `src/discovery.ts:45:1`

### Signatures

- `(options: DiscoverAnkhPackagesOptions) => Promise<AnkhMetadataDiscoveryResult>`
  - options: `DiscoverAnkhPackagesOptions`
  - returns: `Promise<AnkhMetadataDiscoveryResult>`

## parseArgv

Kind: `function`
Module: `src/parser.ts`
Source: `src/parser.ts:16:1`

### Signatures

- `(argv: readonly string[]) => ParsedCliRequest`
  - argv: `readonly string[]`
  - returns: `ParsedCliRequest`

## ParsedCliRequest

Kind: `unknown`
Module: `src/parser.ts`
Source: `src/parser.ts:1:1`

## runCli

Kind: `function`
Module: `src/cli.ts`
Source: `src/cli.ts:29:1`

### Signatures

- `(argv: readonly string[], options?: RunCliOptions) => Promise<AnkhCliRunResult>`
  - argv: `readonly string[]`
  - options: `RunCliOptions` (optional)
  - returns: `Promise<AnkhCliRunResult>`

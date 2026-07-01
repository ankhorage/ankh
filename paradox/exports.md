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

## AnkhCommandExecutionContext

Kind: `type`
Module: `src/execution.ts`
Source: `src/execution.ts:12:1`

### Members

| Name             | Kind     | Type                                            | Required | Description |
| ---------------- | -------- | ----------------------------------------------- | -------- | ----------- |
| cwd              | property | `string`                                        | yes      |             |
| env              | property | `Readonly<Record<string, string \| undefined>>` | yes      |             |
| packageRegistry  | property | `AnkhPackageRegistry`                           | yes      |             |
| providerRegistry | property | `AnkhProviderRegistry`                          | yes      |             |
| version          | property | `string`                                        | yes      |             |
| writeStderr      | method   | `(text: string) => void`                        | yes      |             |
| writeStdout      | method   | `(text: string) => void`                        | yes      |             |

## AnkhCommandExecutionRequest

Kind: `type`
Module: `src/execution.ts`
Source: `src/execution.ts:17:1`

### Members

| Name     | Kind     | Type                          | Required | Description |
| -------- | -------- | ----------------------------- | -------- | ----------- |
| argv     | property | `readonly string[]`           | yes      |             |
| command  | property | `AnkhCommandListing`          | yes      |             |
| context  | property | `AnkhCommandExecutionContext` | yes      |             |
| provider | property | `AnkhLoadedProvider`          | yes      |             |

## AnkhCommandExecutionResult

Kind: `type`
Module: `src/execution.ts`
Source: `src/execution.ts:24:1`

### Members

| Name     | Kind     | Type     | Required | Description |
| -------- | -------- | -------- | -------- | ----------- |
| exitCode | property | `number` | yes      |             |

## AnkhCommandHandler

Kind: `unknown`
Module: `src/execution.ts`
Source: `src/execution.ts:28:1`

## AnkhCommandHandlerBinding

Kind: `type`
Module: `src/execution.ts`
Source: `src/execution.ts:35:1`

### Members

| Name    | Kind     | Type                             | Required | Description |
| ------- | -------- | -------------------------------- | -------- | ----------- |
| handler | property | `AnkhCommandHandler`             | yes      |             |
| path    | property | `readonly [string, ...string[]]` | yes      |             |

## AnkhCommandListing

Kind: `type`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:5:1`

### Members

| Name        | Kind     | Type                             | Required | Description |
| ----------- | -------- | -------------------------------- | -------- | ----------- |
| aliases     | property | `readonly string[] \| undefined` | no       |             |
| capability  | property | `${string}.${string}`            | yes      |             |
| category    | property | `string`                         | yes      |             |
| examples    | property | `readonly string[] \| undefined` | no       |             |
| packageName | property | `string`                         | yes      |             |
| path        | property | `readonly [string, ...string[]]` | yes      |             |
| providerId  | property | `string`                         | yes      |             |
| summary     | property | `string`                         | yes      |             |

## AnkhDiscoveredPackage

Kind: `type`
Module: `src/discovery.ts`
Source: `src/discovery.ts:15:1`

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

## AnkhLoadedProvider

Kind: `type`
Module: `src/providerManifestLoader.ts`
Source: `src/providerManifestLoader.ts:22:1`

### Members

| Name                        | Kind     | Type                          | Required | Description |
| --------------------------- | -------- | ----------------------------- | -------- | ----------- |
| discoveredPackage           | property | `AnkhDiscoveredPackage`       | yes      |             |
| manifest                    | property | `AnkhCommandProviderManifest` | yes      |             |
| providerModuleDefaultExport | property | `unknown`                     | yes      |             |
| providerModulePath          | property | `string`                      | yes      |             |
| providerModuleUrl           | property | `string`                      | yes      |             |

## AnkhMetadataDiscoveryDiagnostic

Kind: `type`
Module: `src/discovery.ts`
Source: `src/discovery.ts:23:1`

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
Source: `src/discovery.ts:32:1`

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

| Name           | Kind   | Type                                                  | Required | Description |
| -------------- | ------ | ----------------------------------------------------- | -------- | ----------- |
| findByCategory | method | `(category: string) => AnkhDiscoveredPackage \| null` | yes      |             |
| hasCategory    | method | `(category: string) => boolean`                       | yes      |             |
| listPackages   | method | `() => readonly AnkhDiscoveredPackage[]`              | yes      |             |

## AnkhProviderManifestDiagnostic

Kind: `type`
Module: `src/providerManifestLoader.ts`
Source: `src/providerManifestLoader.ts:12:1`

### Members

| Name               | Kind     | Type                   | Required | Description |
| ------------------ | -------- | ---------------------- | -------- | ----------- |
| category           | property | `string \| undefined`  | no       |             |
| code               | property | `string`               | yes      |             |
| message            | property | `string`               | yes      |             |
| packageJsonPath    | property | `string`               | yes      |             |
| packageName        | property | `string`               | yes      |             |
| providerModulePath | property | `string \| undefined`  | no       |             |
| severity           | property | `"warning" \| "error"` | yes      |             |

## AnkhProviderRegistry

Kind: `type`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:22:1`

### Members

| Name              | Kind   | Type                                                                                   | Required | Description |
| ----------------- | ------ | -------------------------------------------------------------------------------------- | -------- | ----------- |
| findAllByCategory | method | `(category: string) => readonly AnkhLoadedProvider[]`                                  | yes      |             |
| findByCategory    | method | `(category: string) => AnkhLoadedProvider \| null`                                     | yes      |             |
| hasCategory       | method | `(category: string) => boolean`                                                        | yes      |             |
| listCommands      | method | `() => readonly AnkhCommandListing[]`                                                  | yes      |             |
| listProviders     | method | `() => readonly AnkhLoadedProvider[]`                                                  | yes      |             |
| resolveCommand    | method | `(category: string, tokens: readonly string[]) => AnkhResolvedProviderCommand \| null` | yes      |             |

## AnkhResolvedProviderCommand

Kind: `type`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:16:1`

### Members

| Name     | Kind     | Type                 | Required | Description |
| -------- | -------- | -------------------- | -------- | ----------- |
| argv     | property | `readonly string[]`  | yes      |             |
| command  | property | `AnkhCommandListing` | yes      |             |
| provider | property | `AnkhLoadedProvider` | yes      |             |

## AnkhRuntimeCommandProvider

Kind: `type`
Module: `src/execution.ts`
Source: `src/execution.ts:40:1`

### Members

| Name         | Kind     | Type                                                | Required | Description |
| ------------ | -------- | --------------------------------------------------- | -------- | ----------- |
| capabilities | property | `readonly `${string}.${string}`[]`                  | yes      |             |
| category     | property | `string`                                            | yes      |             |
| commands     | property | `readonly AnkhCommandDescriptor[]`                  | yes      |             |
| handlers     | property | `readonly AnkhCommandHandlerBinding[] \| undefined` | no       |             |
| id           | property | `string`                                            | yes      |             |
| version      | property | `string`                                            | yes      |             |

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
Source: `src/packageRegistry.ts:9:1`

### Signatures

- `(packages?: readonly AnkhDiscoveredPackage[]) => AnkhPackageRegistry`
  - packages: `readonly AnkhDiscoveredPackage[]` (optional)
  - returns: `AnkhPackageRegistry`

## createProviderRegistry

Kind: `function`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:34:1`

### Signatures

- `(providers?: readonly AnkhLoadedProvider[]) => AnkhProviderRegistry`
  - providers: `readonly AnkhLoadedProvider[]` (optional)
  - returns: `AnkhProviderRegistry`

## discoverAnkhPackages

Kind: `function`
Module: `src/discovery.ts`
Source: `src/discovery.ts:46:1`

### Signatures

- `(options: DiscoverAnkhPackagesOptions) => Promise<AnkhMetadataDiscoveryResult>`
  - options: `DiscoverAnkhPackagesOptions`
  - returns: `Promise<AnkhMetadataDiscoveryResult>`

## loadProviderManifests

Kind: `function`
Module: `src/providerManifestLoader.ts`
Source: `src/providerManifestLoader.ts:35:1`

### Signatures

- `(packages: readonly AnkhDiscoveredPackage[]) => Promise<LoadProviderManifestsResult>`
  - packages: `readonly AnkhDiscoveredPackage[]`
  - returns: `Promise<LoadProviderManifestsResult>`

## LoadProviderManifestsResult

Kind: `type`
Module: `src/providerManifestLoader.ts`
Source: `src/providerManifestLoader.ts:30:1`

### Members

| Name        | Kind     | Type                                        | Required | Description |
| ----------- | -------- | ------------------------------------------- | -------- | ----------- |
| diagnostics | property | `readonly AnkhProviderManifestDiagnostic[]` | yes      |             |
| providers   | property | `readonly AnkhLoadedProvider[]`             | yes      |             |

## parseArgv

Kind: `function`
Module: `src/parser.ts`
Source: `src/parser.ts:17:1`

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
Source: `src/cli.ts:65:1`

### Signatures

- `(argv: readonly string[], options?: RunCliOptions) => Promise<AnkhCliRunResult>`
  - argv: `readonly string[]`
  - options: `RunCliOptions` (optional)
  - returns: `Promise<AnkhCliRunResult>`

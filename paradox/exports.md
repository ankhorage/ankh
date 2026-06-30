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
Source: `src/providerRegistry.ts:6:1`

### Members

| Name       | Kind     | Type                             | Required | Description |
| ---------- | -------- | -------------------------------- | -------- | ----------- |
| capability | property | `${string}.${string}`            | yes      |             |
| category   | property | `string`                         | yes      |             |
| path       | property | `readonly [string, ...string[]]` | yes      |             |
| providerId | property | `string`                         | yes      |             |
| summary    | property | `string`                         | yes      |             |

## AnkhProviderRegistry

Kind: `type`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:14:1`

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

## createProviderRegistry

Kind: `function`
Module: `src/providerRegistry.ts`
Source: `src/providerRegistry.ts:23:1`

### Signatures

- `(providers?: readonly AnkhCommandProviderManifest[]) => AnkhProviderRegistry`
  - providers: `readonly AnkhCommandProviderManifest[]` (optional)
  - returns: `AnkhProviderRegistry`

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
Source: `src/cli.ts:20:1`

### Signatures

- `(argv: readonly string[], options?: RunCliOptions) => Promise<AnkhCliRunResult>`
  - argv: `readonly string[]`
  - options: `RunCliOptions` (optional)
  - returns: `Promise<AnkhCliRunResult>`

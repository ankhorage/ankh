export interface ConsumerProviderManifestSource {
  readAsync(cwd: string): Promise<Record<string, unknown> | null>;
}

export interface ConsumerProviderManifestSource {
  readAsync(cwd: string): Promise<Record<string, unknown> | null>;
  readInstalledVersionAsync(
    cwd: string,
    packageName: string,
    range: string,
  ): Promise<string | null>;
}

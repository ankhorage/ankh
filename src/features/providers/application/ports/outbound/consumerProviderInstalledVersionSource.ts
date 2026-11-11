export interface ConsumerProviderInstalledVersionSource {
  resolveAsync(input: { readonly cwd: string; readonly packageName: string }): Promise<string>;
}

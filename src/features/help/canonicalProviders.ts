export interface CanonicalAnkhProvider {
  readonly command: string;
  readonly repositoryUrl: string;
}

/***
 * Return the canonical executable provider catalog shown by root help.
 */
export function getCanonicalAnkhProviders(): readonly CanonicalAnkhProvider[] {
  return [
    { command: 'apm', repositoryUrl: 'https://github.com/ankhorage/apm' },
    { command: 'deploy', repositoryUrl: 'https://github.com/ankhorage/deploy' },
    { command: 'devtools', repositoryUrl: 'https://github.com/ankhorage/devtools' },
    { command: 'docs', repositoryUrl: 'https://github.com/ankhorage/paradox' },
    { command: 'doctor', repositoryUrl: 'https://github.com/ankhorage/doctor' },
    { command: 'infra', repositoryUrl: 'https://github.com/ankhorage/infra' },
    { command: 'orchestrator', repositoryUrl: 'https://github.com/ankhorage/orchestrator' },
    { command: 'repository', repositoryUrl: 'https://github.com/ankhorage/repository' },
    { command: 'studio', repositoryUrl: 'https://github.com/ankhorage/studio' },
    { command: 'templates', repositoryUrl: 'https://github.com/ankhorage/templates' },
  ] as const;
}

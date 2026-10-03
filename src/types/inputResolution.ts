export type AnkhInputValueOrigin = 'explicit' | 'cli' | 'environment' | 'default';

export interface AnkhInputValueCandidates {
  readonly explicit?: string | null;
  readonly cli?: string | null;
  readonly environment?: string | null;
  readonly defaultValue?: string | null;
}

export interface AnkhResolvedInputValue {
  readonly value: string;
  readonly origin: AnkhInputValueOrigin;
}

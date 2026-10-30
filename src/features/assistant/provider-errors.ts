/** A provider policy block; callers expose only the existing localized unavailable response. */
export class ProviderSafetyBlockedError extends Error {
  constructor() {
    super('provider safety block');
    this.name = 'ProviderSafetyBlockedError';
  }
}

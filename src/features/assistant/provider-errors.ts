/** A provider policy block; callers expose only the existing localized unavailable response. */
export class ProviderSafetyBlockedError extends Error {
  constructor() {
    super('provider safety block');
    this.name = 'ProviderSafetyBlockedError';
  }
}

/** An HTTP 429 provider quota rejection, with no upstream details. */
export class ProviderQuotaError extends Error {
  constructor() {
    super('provider quota unavailable');
    this.name = 'ProviderQuotaError';
  }
}

/** A syntactically valid provider response that failed our output contract. */
export class ProviderOutputValidationError extends Error {
  constructor() {
    super('provider output invalid');
    this.name = 'ProviderOutputValidationError';
  }
}

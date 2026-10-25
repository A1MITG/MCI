// One error type for everything a stage can fail with. `retryable` drives the retry policy.

export class RunError extends Error {
  constructor(code, message, { retryable = false, stage = null, cause } = {}) {
    super(message, { cause });
    this.code = code;
    this.retryable = retryable;
    this.stage = stage;
  }

  toJSON() {
    return { code: this.code, message: this.message, retryable: this.retryable, stage: this.stage };
  }
}

export const CODES = {
  timeout: { retryable: true },
  rate_limited: { retryable: true },
  provider_error: { retryable: true },
  invalid_json: { retryable: true },
  schema_invalid: { retryable: true },
  refused: { retryable: false },
  fetch_blocked: { retryable: false },
  budget_exceeded: { retryable: false },
  cancelled: { retryable: false },
  locked: { retryable: false },
  config_error: { retryable: false },
};

export function runError(code, message, opts = {}) {
  return new RunError(code, message, { retryable: CODES[code]?.retryable ?? false, ...opts });
}

// Bounded retry with exponential backoff and jitter. Only RunErrors marked retryable are retried.
import { RunError } from './errors.js';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new RunError('cancelled', 'Cancelled during retry wait'));
    });
  });

export async function withRetry(fn, { maxAttempts, baseDelayMs, maxDelayMs }, { signal, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      const retryable = err instanceof RunError && err.retryable;
      if (!retryable || attempt >= maxAttempts) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
      onRetry?.(err, attempt, delay);
      await sleep(delay, signal);
    }
  }
}

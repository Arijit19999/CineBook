export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  factor?: number;
  onRetry?: (attempt: number, err: unknown) => void;
}

// Runs fn, retrying on throw with exponential backoff.
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseMs = 100, factor = 2, onRetry } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      onRetry?.(attempt + 1, err);
      const delay = baseMs * Math.pow(factor, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

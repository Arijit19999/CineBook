export class CircuitOpenError extends Error {
  statusCode = 503;
  retryAfterMs: number;
  constructor(name: string, retryAfterMs: number) {
    super(`Service "${name}" is temporarily unavailable. Please try again shortly.`);
    this.retryAfterMs = retryAfterMs;
  }
}

type State = 'closed' | 'open' | 'half-open';

// Minimal circuit breaker: trips open after N consecutive failures, stays open for
// a cooldown, then allows a single trial (half-open) before fully closing.
export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private openedAt = 0;

  constructor(private opts: { name: string; failureThreshold: number; cooldownMs: number }) {}

  get currentState(): State {
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.opts.cooldownMs) {
        throw new CircuitOpenError(this.opts.name, this.opts.cooldownMs - elapsed);
      }
      this.state = 'half-open';
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    if (this.state === 'half-open' || this.failures >= this.opts.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}

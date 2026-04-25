interface Bucket {
  tokens: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  consume(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { tokens: this.limit, resetAt: t + this.windowMs };
      this.buckets.set(key, b);
    }
    if (b.tokens <= 0) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
    }
    b.tokens -= 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  // Periodic GC; safe to call from a timer.
  gc(): void {
    const t = this.now();
    for (const [k, b] of this.buckets) {
      if (b.resetAt <= t) this.buckets.delete(k);
    }
  }
}

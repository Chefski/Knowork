import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  it('allows up to limit then rejects with retry_after', () => {
    let now = 1_000;
    const limiter = new RateLimiter(2, 3_000, () => now);

    expect(limiter.consume('k')).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(limiter.consume('k')).toEqual({ allowed: true, retryAfterSec: 0 });

    const rejected = limiter.consume('k');
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSec).toBe(3);
  });

  it('resets bucket when window elapses', () => {
    let now = 10_000;
    const limiter = new RateLimiter(1, 1_000, () => now);

    expect(limiter.consume('room:a').allowed).toBe(true);
    expect(limiter.consume('room:a').allowed).toBe(false);

    now += 1_000;
    expect(limiter.consume('room:a')).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it('isolates buckets per key and gc removes expired buckets', () => {
    let now = 50_000;
    const limiter = new RateLimiter(1, 2_000, () => now);

    expect(limiter.consume('ip:1').allowed).toBe(true);
    expect(limiter.consume('ip:2').allowed).toBe(true);
    expect(limiter.consume('ip:1').allowed).toBe(false);
    expect(limiter.consume('ip:2').allowed).toBe(false);

    now += 2_100;
    limiter.gc();

    expect(limiter.consume('ip:1').allowed).toBe(true);
    expect(limiter.consume('ip:2').allowed).toBe(true);
  });
});

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { SESSION_CODE_ALPHABET } from '@vanguard/shared';

/** 256-bit random bearer token. */
export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashSecret = (s: string): string => createHash('sha256').update(s).digest('hex');

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export const newPin = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function newSessionCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += SESSION_CODE_ALPHABET[randomInt(0, SESSION_CODE_ALPHABET.length)];
  }
  return out;
}

/** Sliding-window limiter: at most `limit` hits per `windowMs` per key (PIN attempts). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    const ok = recent.length < this.limit;
    if (ok) recent.push(t);
    this.hits.set(key, recent);
    return ok;
  }
}

/**
 * Seeded PRNG (mulberry32). The generator state is a uint32 stored on the sim state object,
 * so it serialises with the state and replays exactly.
 */
export interface RngHolder {
  rng: number;
}

export function seedRng(seed: number): number {
  // Scramble the seed so that small consecutive seeds give unrelated streams.
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function nextRandom(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function uniform(s: RngHolder, min: number, max: number): number {
  return min + (max - min) * nextRandom(s);
}

/** Integer in [min, max] inclusive. */
export function randInt(s: RngHolder, min: number, max: number): number {
  return min + Math.floor(nextRandom(s) * (max - min + 1));
}

export function chance(s: RngHolder, p: number): boolean {
  return nextRandom(s) < p;
}

export function pick<T>(s: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty list');
  return items[Math.floor(nextRandom(s) * items.length)]!;
}

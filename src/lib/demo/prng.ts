// Deterministic pseudo-random generator (mulberry32). Same seed => same dataset, every run.

export type Rng = {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  weighted: <T>(items: readonly (readonly [T, number])[]) => T;
  chance: (p: number) => boolean;
  /** Log-normal-ish skew: most values near min, long tail toward max. */
  skew: (min: number, max: number, power?: number) => number;
};

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (min: number, max: number) => min + (max - min) * next();
  const int = (min: number, max: number) => Math.floor(range(min, max + 1));
  const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const weighted = <T,>(items: readonly (readonly [T, number])[]) => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r <= 0) return item;
    }
    return items[items.length - 1][0];
  };
  const chance = (p: number) => next() < p;
  const skew = (min: number, max: number, power = 2.6) => min + (max - min) * Math.pow(next(), power);
  return { next, range, int, pick, weighted, chance, skew };
}

/** Stable string hash (FNV-1a) used to derive sub-seeds. */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const round = (n: number, digits = 0) => {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
};

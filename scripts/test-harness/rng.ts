/**
 * Test Harness — deterministisk PRNG (reproducerbarhed).
 * Samme seed => samme sekvens => samme genererede data.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  private next: () => number
  constructor(seed: string) {
    const s = xmur3(seed)
    this.next = mulberry32(s())
  }
  /** float [0,1) */
  float(): number {
    return this.next()
  }
  /** heltal [min, max] inklusiv */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  /** true med sandsynlighed p (0..1) */
  chance(p: number): boolean {
    return this.next() < p
  }
  /** vaelg ét element */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  /** vaegtet valg: [{item, weight}] */
  weighted<T>(items: ReadonlyArray<{ item: T; weight: number }>): T {
    const total = items.reduce((s, i) => s + i.weight, 0)
    let r = this.next() * total
    for (const i of items) {
      r -= i.weight
      if (r <= 0) return i.item
    }
    return items[items.length - 1].item
  }
}

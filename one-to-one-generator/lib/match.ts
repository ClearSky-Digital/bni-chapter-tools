export type Pair = [string, string];
export interface Round { pairs: Pair[] }
export interface MatchOptions { rounds?: number; attempts?: number; rng?: () => number }
export interface MatchResult { pairs: Pair[]; trio?: [string, string, string]; left?: string; repeats: number }

const key = (a: string, b: string) => JSON.stringify(a < b ? [a, b] : [b, a]);

/** Pure: pairs the names, reshuffling to avoid pairs seen in the last `rounds` rounds (history is newest first). Odd counts get one trio. */
export function matchRound(input: string[], history: Round[], opts: MatchOptions = {}): MatchResult {
  const { rounds = 4, attempts = 500, rng = Math.random } = opts;
  const names = [...new Set(input.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return { pairs: [], repeats: 0 };
  if (names.length === 1) return { pairs: [], left: names[0], repeats: 0 };

  const met = new Set<string>();
  for (const r of history.slice(0, rounds)) for (const [a, b] of r.pairs) met.add(key(a.trim(), b.trim()));

  let best: MatchResult | undefined;
  for (let t = 0; t < attempts; t++) {
    const s = [...names];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    const trio = s.length % 2 ? ([s.pop()!, s.pop()!, s.pop()!] as [string, string, string]) : undefined;
    const pairs: Pair[] = [];
    for (let i = 0; i < s.length; i += 2) pairs.push([s[i], s[i + 1]]);
    let repeats = pairs.filter(([a, b]) => met.has(key(a, b))).length;
    if (trio) repeats += [[0, 1], [1, 2], [0, 2]].filter(([x, y]) => met.has(key(trio[x], trio[y]))).length;
    if (!best || repeats < best.repeats) best = { pairs, trio, repeats };
    if (repeats === 0) break;
  }
  return best!;
}

/** Pairs a round contributes to history (a trio counts as three pairs). */
export function roundPairs(r: MatchResult): Pair[] {
  const t = r.trio;
  return t ? [...r.pairs, [t[0], t[1]], [t[1], t[2]], [t[0], t[2]]] : r.pairs;
}

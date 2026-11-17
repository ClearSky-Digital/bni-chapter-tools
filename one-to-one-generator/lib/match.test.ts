import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRound, roundPairs, type Round } from './match.ts';

const names = (n: number) => Array.from({ length: n }, (_, i) => `Member ${i + 1}`);
const key = (a: string, b: string) => [a, b].sort().join('|');
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

test('even count pairs everyone once', () => {
  const r = matchRound(names(10), [], { rng: seeded(1) });
  assert.equal(r.pairs.length, 5);
  assert.equal(r.trio, undefined);
  assert.equal(new Set(r.pairs.flat()).size, 10);
});

test('odd count makes one trio, everyone placed once', () => {
  const r = matchRound(names(11), [], { rng: seeded(2) });
  assert.equal(r.pairs.length, 4);
  assert.equal(r.trio?.length, 3);
  assert.equal(new Set([...r.pairs.flat(), ...r.trio!]).size, 11);
});

test('avoids repeats from the last N rounds when possible', () => {
  const m = names(12);
  const history: Round[] = [];
  for (let i = 0; i < 4; i++) {
    const r = matchRound(m, history, { rng: seeded(10 + i) });
    assert.equal(r.repeats, 0, `round ${i} had repeats`);
    history.unshift({ pairs: [...r.pairs, ...(r.trio ? [[r.trio[0], r.trio[1]], [r.trio[1], r.trio[2]], [r.trio[0], r.trio[2]]] as [string, string][] : [])] });
  }
  const seen = new Set<string>();
  for (const h of history) for (const [a, b] of h.pairs) { assert.ok(!seen.has(key(a, b))); seen.add(key(a, b)); }
});

test('only the last N rounds count', () => {
  const history: Round[] = [{ pairs: [] }, { pairs: [['Member 1', 'Member 2']] }];
  const r = matchRound(['Member 1', 'Member 2'], history, { rounds: 1, rng: seeded(3) });
  assert.equal(r.repeats, 0);
  const r2 = matchRound(['Member 1', 'Member 2'], history, { rounds: 2, rng: seeded(3) });
  assert.equal(r2.repeats, 1);
});

test('reports unavoidable repeats and handles tiny rosters', () => {
  const r = matchRound(['A', 'B'], [{ pairs: [['A', 'B']] }], { rng: seeded(4) });
  assert.equal(r.repeats, 1);
  assert.deepEqual(matchRound([], []).pairs, []);
  assert.equal(matchRound(['Solo'], []).left, 'Solo');
});

test('does not mutate its inputs and ignores blank and duplicate names', () => {
  const m = ['A', 'B', ' ', 'A', 'C', 'D'];
  const copy = [...m];
  const r = matchRound(m, []);
  assert.deepEqual(m, copy);
  assert.equal(r.pairs.length, 2);
});

test('history names with stray whitespace still count as met', () => {
  const r = matchRound(['A', 'B'], [{ pairs: [[' A', 'B ']] }], { rng: seeded(5) });
  assert.equal(r.repeats, 1);
});
test('large odd roster with history places everyone', () => {
  const m = names(41);
  const first = matchRound(m, [], { rng: seeded(6) });
  const r = matchRound(m, [{ pairs: roundPairs(first) }], { rng: seeded(7) });
  assert.equal(new Set([...r.pairs.flat(), ...r.trio!]).size, 41);
  assert.equal(r.repeats, 0);
});

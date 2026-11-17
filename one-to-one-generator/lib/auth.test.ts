import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenMatches, createLimiter } from './auth.ts';

test('tokenMatches accepts only the exact secret', () => {
  assert.equal(tokenMatches('Bearer s3cret-value-0123456', 's3cret-value-0123456'), true);
  assert.equal(tokenMatches('Bearer s3cret-valuf', 's3cret-value-0123456'), false);
  assert.equal(tokenMatches('s3cret-value-0123456', 's3cret-value-0123456'), false);
  assert.equal(tokenMatches(null, 's3cret-value-0123456'), false);
});
test('an unset or short secret never matches', () => {
  assert.equal(tokenMatches('Bearer ', ''), false);
  assert.equal(tokenMatches('Bearer abc', undefined), false);
  assert.equal(tokenMatches('Bearer abc', 'abc'), false);
});
test('limiter blocks after the cap and frees after the window', () => {
  let t = 0;
  const l = createLimiter(3, 1000, () => t);
  assert.deepEqual([l(), l(), l(), l()], [true, true, true, false]);
  t = 1001;
  assert.equal(l(), true);
});

import { createKeyedLimiter } from './auth.ts';
test('keyed limiter counts each key separately', () => {
  let t = 0;
  const l = createKeyedLimiter(2, 1000, () => t);
  assert.deepEqual([l('a'), l('a'), l('a'), l('b')], [true, true, false, true]);
  t = 2000;
  assert.equal(l('a'), true);
});

test('keyed limiter stays bounded under a flood of new keys', () => {
  const l = createKeyedLimiter(1, 60_000, () => 0);
  for (let i = 0; i < 12_000; i++) l(`k${i}`);
  assert.equal(l('k11999'), false); // newest key is still tracked
});

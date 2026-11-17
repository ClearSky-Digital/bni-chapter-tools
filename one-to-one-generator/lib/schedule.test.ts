import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRoundDay } from './schedule.ts';

const anchor = '2026-11-17';
test('anchor Tuesday is a round day (Pacific)', () => {
  assert.equal(isRoundDay(new Date('2026-11-17T16:00:00Z'), anchor), true);
});
test('a week later is off, two weeks later is on', () => {
  assert.equal(isRoundDay(new Date('2026-11-24T16:00:00Z'), anchor), false);
  assert.equal(isRoundDay(new Date('2026-12-01T16:00:00Z'), anchor), true);
});
test('uses Pacific date, not UTC, and survives the clock change', () => {
  assert.equal(isRoundDay(new Date('2026-12-02T03:00:00Z'), anchor), true); // still Dec 1 in Pacific
  assert.equal(isRoundDay(new Date('2027-03-23T15:00:00Z'), anchor), true); // after DST start
});
test('days before the anchor are never round days', () => {
  assert.equal(isRoundDay(new Date('2026-11-03T16:00:00Z'), anchor), false);
});

import { validAnchor, pacificDate } from './schedule.ts';
test('validAnchor and pacificDate', () => {
  assert.equal(validAnchor('2026-11-17'), true);
  assert.equal(validAnchor('11/17/2026'), false);
  assert.equal(pacificDate(new Date('2026-12-02T03:00:00Z')), '2026-12-01');
});
test('fall-back day 2026-11-01 keeps the cycle', () => {
  assert.equal(isRoundDay(new Date('2026-11-03T16:00:00Z'), '2026-11-03'), true);
  assert.equal(isRoundDay(new Date('2026-11-17T16:00:00Z'), '2026-11-03'), true);
});

import { isScheduledDay } from './schedule.ts';
const at = (iso: string) => new Date(iso);
const opts = (schedule: 'weekly' | 'biweekly' | 'monthly') => ({ schedule, anchorDate: '2026-11-17', roundDays: 14 });

test('weekly: every Tuesday (Pacific) and no other day; the anchor is ignored', () => {
  assert.equal(isScheduledDay(at('2026-11-24T16:00:00Z'), opts('weekly')), true);
  assert.equal(isScheduledDay(at('2026-11-10T16:00:00Z'), opts('weekly')), true, 'before the anchor still counts');
  assert.equal(isScheduledDay(at('2026-11-25T16:00:00Z'), opts('weekly')), false);
  assert.equal(isScheduledDay(at('2026-11-23T16:00:00Z'), opts('weekly')), false);
});

test('biweekly keeps the anchor, including across a DST change', () => {
  assert.equal(isScheduledDay(at('2026-11-17T16:00:00Z'), opts('biweekly')), true);
  assert.equal(isScheduledDay(at('2026-11-24T16:00:00Z'), opts('biweekly')), false);
  assert.equal(isScheduledDay(at('2027-03-23T15:00:00Z'), opts('biweekly')), true, 'after spring forward, 126 days on');
  assert.equal(isScheduledDay(at('2027-03-16T15:00:00Z'), opts('biweekly')), false);
});

test('monthly: only the first Tuesday of the month', () => {
  assert.equal(isScheduledDay(at('2026-12-01T16:00:00Z'), opts('monthly')), true, 'first Tuesday on the 1st');
  assert.equal(isScheduledDay(at('2026-12-08T16:00:00Z'), opts('monthly')), false);
  assert.equal(isScheduledDay(at('2027-09-07T15:00:00Z'), opts('monthly')), true, 'first Tuesday on the 7th');
  assert.equal(isScheduledDay(at('2027-09-14T15:00:00Z'), opts('monthly')), false);
  assert.equal(isScheduledDay(at('2027-03-02T16:00:00Z'), opts('monthly')), true, 'a 5-Tuesday month: first');
  assert.equal(isScheduledDay(at('2027-03-30T15:00:00Z'), opts('monthly')), false, 'a 5-Tuesday month: fifth');
  assert.equal(isScheduledDay(at('2027-01-05T16:00:00Z'), opts('monthly')), true);
});

test('monthly: the Pacific date decides, not the UTC date, and the week after DST ends works', () => {
  assert.equal(isScheduledDay(at('2026-12-02T01:00:00Z'), opts('monthly')), true, '5 pm Pacific on Tuesday Dec 1 is Wednesday in UTC');
  assert.equal(isScheduledDay(at('2026-12-01T07:30:00Z'), opts('monthly')), false, 'late Monday Pacific is not Tuesday yet');
  assert.equal(isScheduledDay(at('2026-11-03T16:00:00Z'), opts('monthly')), true, 'first Tuesday of Nov, two days after DST ended');
  assert.equal(isScheduledDay(at('2026-11-04T07:30:00Z'), opts('monthly')), true, '11:30 pm PST Nov 3');
});

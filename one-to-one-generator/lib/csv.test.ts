import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRosterCsv, neutralizeCell, checkRows } from './csv.ts';

const L = { maxBytes: 100_000, maxRows: 500 };

test('parses name and business from a BNI-style export, ignoring other columns', () => {
  const csv = 'First Name,Last Name,Company Name,Phone,Email\nAda,Lovelace,Analytical Engines,555-0101,ada@example.test\nGrace,Hopper,"Compilers, Inc.",555-0102,g@example.test\n';
  const r = parseRosterCsv(csv, L);
  assert.ok(r.ok);
  assert.deepEqual(r.members, [
    { name: 'Ada Lovelace', business: 'Analytical Engines' },
    { name: 'Grace Hopper', business: 'Compilers, Inc.' },
  ]);
  assert.ok(!JSON.stringify(r).includes('555-0101'));
});
test('accepts a single Full Name or Member Name column and an optional business', () => {
  assert.ok(parseRosterCsv('Member Name\nAda Lovelace\n', L).ok);
  const r = parseRosterCsv('Full Name,Company\nAda Lovelace,\n', L);
  assert.ok(r.ok && r.members[0].business === '');
});
test('handles BOM, CRLF, quoted newlines and doubled quotes', () => {
  const r = parseRosterCsv('﻿Name,Company\r\n"Ada ""A"" L",Eng\r\n', L);
  assert.ok(r.ok);
  assert.equal(r.members[0].name, 'Ada "A" L');
});
test('drops blank rows and duplicate names, and reports them as counts', () => {
  const r = parseRosterCsv('Name,Company\nAda,X\n,\nada,Y\nGrace,Z\n', L);
  assert.ok(r.ok);
  assert.equal(r.members.length, 2);
  assert.equal(r.skipped, 2);
});
test('rejects missing name column, empty file, oversize and too many rows', () => {
  assert.equal(parseRosterCsv('Company\nX\n', L).ok, false);
  assert.equal(parseRosterCsv('', L).ok, false);
  assert.equal(parseRosterCsv('Name\n' + 'a'.repeat(200), { maxBytes: 100, maxRows: 5 }).ok, false);
  assert.equal(parseRosterCsv('Name\nA\nB\nC\nD\nE\nF\nG\n', { maxBytes: 1000, maxRows: 5 }).ok, false);
});
test('formula injection is neutralized and control characters removed', () => {
  assert.equal(neutralizeCell('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  for (const c of ['+', '-', '@', '\t', '\r']) assert.ok(neutralizeCell(`${c}1`).startsWith("'"));
  assert.equal(neutralizeCell('Ada\u0000 L'), 'Ada L');
  const r = parseRosterCsv('Name,Company\n=cmd|x,@sum\n', L);
  assert.ok(r.ok);
  assert.ok(r.members[0].name.startsWith("'") && r.members[0].business.startsWith("'"));
});
test('overlong cells are cut', () => {
  const r = parseRosterCsv(`Name\n${'x'.repeat(500)}\n`, L);
  assert.ok(r.ok && r.members[0].name.length <= 120);
});

test('first and last name columns win over a separate Name column that may hold something else', () => {
  const r = parseRosterCsv('Name,First Name,Last Name,Company\nLicensed agent,Ada,Example,Example Engines\n', L);
  assert.ok(r.ok);
  assert.equal(r.members[0].name, 'Ada Example');
});

test('checkRows flags a missing business, a single word, a role word and a duplicate', () => {
  const r = parseRosterCsv('Name,Company\nAda Example,Example Engines\nGrace Sample,\nCher,Solo Co\nLicensed agent,Realty Co\nVice President,Club Co\nLin Made-Up,Made-Up Co\nlin made-up,Other Co\n', L);
  assert.ok(r.ok);
  const flags = checkRows(r.members, r.duplicates);
  const by = Object.fromEntries(flags.map((f) => [f.name, f.reasons.join('|')]));
  assert.match(by['Grace Sample'], /no business/);
  assert.match(by['Cher'], /one word/);
  assert.match(by['Licensed agent'], /role or title/);
  assert.match(by['Vice President'], /role or title/);
  assert.match(by['lin made-up'], /duplicate/);
  assert.ok(!by['Ada Example'], 'a normal row is not flagged');
});

test('checkRows does not flag ordinary names that contain a role-like substring', () => {
  const flags = checkRows([{ name: 'Marge Directorson', business: 'Shop' }, { name: 'Owen Agentis', business: 'Shop' }], []);
  assert.equal(flags.length, 0);
});

test('a comma tail made only of role words is dropped and reported', () => {
  const r = parseRosterCsv('Name,Company\n"Ada Example, Licensed agent",Example Engines\nGrace Sample,Sample Co\n', L);
  assert.ok(r.ok);
  assert.deepEqual(r.members.map((m) => m.name), ['Ada Example', 'Grace Sample']);
  assert.deepEqual(r.renamed, [{ from: 'Ada Example, Licensed agent', to: 'Ada Example' }]);
});

test('role tails with several words and "and" are dropped; other tails stay and are flagged', () => {
  const r = parseRosterCsv('Name,Company\n"Lin Made-Up, Licensed Real Estate Agent",Made-Up Co\n"Sam Pretend, Owner and Broker",Pretend LLC\n"Rae Fictional, Jr.",Fictional Fitness\n"Kit Invented, DDS",Invented Dental\n', L);
  assert.ok(r.ok);
  assert.deepEqual(r.members.map((m) => m.name), ['Lin Made-Up', 'Sam Pretend', 'Rae Fictional, Jr.', 'Kit Invented, DDS']);
  assert.equal(r.renamed.length, 2);
  const flags = checkRows(r.members, r.duplicates);
  const by = Object.fromEntries(flags.map((f) => [f.name, f.reasons.join('|')]));
  assert.match(by['Rae Fictional, Jr.'], /comma/);
  assert.match(by['Kit Invented, DDS'], /comma/);
  assert.ok(!by['Lin Made-Up']);
});

test('a role-only name before the comma is not emptied', () => {
  const r = parseRosterCsv('Name,Company\n"Licensed agent, Broker",Realty Co\n', L);
  assert.ok(r.ok);
  assert.equal(r.members[0].name, 'Licensed agent, Broker');
});

test('a cleaned name that repeats another row counts as a duplicate', () => {
  const r = parseRosterCsv('Name,Company\nAda Example,Example Engines\n"Ada Example, Licensed agent",Example Engines\n', L);
  assert.ok(r.ok);
  assert.equal(r.members.length, 1);
  assert.equal(r.duplicates.length, 1);
});

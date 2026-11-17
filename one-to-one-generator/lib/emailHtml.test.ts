import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchEmailHtml, updateEmailHtml } from './emailHtml.ts';

const base = { dateLabel: 'November 17, 2026', rosterLabel: 'November 10, 2026', link: 'https://apps.example.test/chaptertools/leadership' };
const person = (name: string, business = '') => ({ name, business });

test('match email: one row per pair, names bold with the business under them, header and footer', () => {
  const html = matchEmailHtml({ ...base, groups: [[person('Ada Example', 'Example Engines'), person('Grace Sample', 'Sample Compilers')], [person('Lin Made-Up', 'Made-Up Co'), person('Sam Pretend', 'Pretend LLC')]], repeats: 0 });
  assert.match(html, /November 17, 2026/);
  assert.match(html, /<strong[^>]*>Ada Example<\/strong>/);
  assert.match(html, /Example Engines/);
  assert.equal((html.match(/data-row="group"/g) ?? []).length, 2);
  assert.match(html, /Roster last updated November 10, 2026/);
  assert.match(html, /href="https:\/\/apps\.example\.test\/chaptertools\/leadership"/);
  assert.match(html, /not made or endorsed by BNI/);
});

test('match email: a trio is one row with three people and a label', () => {
  const html = matchEmailHtml({ ...base, groups: [[person('Ada Example', 'A Co'), person('Grace Sample', 'G Co'), person('Lin Made-Up', 'L Co')]], repeats: 0 });
  assert.match(html, /Group of three/);
  assert.equal((html.match(/data-person/g) ?? []).length, 3);
});

test('match email: layout is tables with inline styles only, no images, no scripts, no style blocks', () => {
  const html = matchEmailHtml({ ...base, groups: [[person('A One', 'X'), person('B Two', 'Y')]], repeats: 1 });
  assert.match(html, /<table role="presentation"/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /#CF2030/);
  assert.ok(!/<img|<script|<style|<link/i.test(html));
  assert.match(html, /met in a recent round/);
});

test('match email: names, businesses and links are escaped', () => {
  const html = matchEmailHtml({ ...base, link: 'javascript:alert(1)', groups: [[person('<b>Bold</b> & Co', 'Smith "&" <i>Sons</i>'), person("O'Neil", '')]], repeats: 0 });
  assert.ok(!html.includes('<b>Bold'));
  assert.ok(!html.includes('<i>Sons'));
  assert.match(html, /&lt;b&gt;Bold&lt;\/b&gt; &amp; Co/);
  assert.match(html, /Smith &quot;&amp;&quot; &lt;i&gt;Sons&lt;\/i&gt;/);
  assert.match(html, /O&#39;Neil/);
  assert.ok(!html.includes('javascript:'));
});

test('please-update email: explains the reason, links to leadership, and is escaped and styled the same way', () => {
  const html = updateEmailHtml({ link: base.link, reason: 'the roster was last updated November 1, 2026' });
  assert.match(html, /Please update the chapter roster/);
  assert.match(html, /the roster was last updated November 1, 2026/);
  assert.match(html, /href="https:\/\/apps\.example\.test/);
  assert.match(html, /not made or endorsed by BNI/);
  assert.ok(!/<img|<script|<style/i.test(html));
});

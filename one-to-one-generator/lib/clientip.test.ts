import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from './server.ts';
import { loadConfig } from './config.ts';

const req = (h: Record<string, string>) => new Request('http://localhost/x', { headers: h });

test('two-hop chain (visitor, Cloudflare edge): hops=2 picks the visitor', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }), 2), '198.51.100.7');
});
test('hops=1 takes the last entry', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }), 1), '203.0.113.9');
});
test('a forged leading entry does not change the result', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7, 203.0.113.9' }), 2), '198.51.100.7');
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 6.6.6.6, 198.51.100.7, 203.0.113.9' }), 2), '198.51.100.7');
});
test('missing header, empty header or too few entries fail closed to one shared bucket', () => {
  assert.equal(clientIp(req({}), 2), 'unknown');
  assert.equal(clientIp(req({ 'x-forwarded-for': '' }), 1), 'unknown');
  assert.equal(clientIp(req({ 'x-forwarded-for': '203.0.113.9' }), 2), 'unknown');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' , ' }), 2), 'unknown');
});
test('X-Real-IP and CF-Connecting-IP are not trusted', () => {
  assert.equal(clientIp(req({ 'x-real-ip': '9.9.9.9', 'cf-connecting-ip': '8.8.8.8' }), 1), 'unknown');
  assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9', 'x-real-ip': '9.9.9.9', 'cf-connecting-ip': '8.8.8.8' }), 2), '198.51.100.7');
});
test('TRUSTED_PROXY_HOPS defaults to 1, accepts 1 to 5 and rejects the rest', () => {
  const base = { CRON_SECRET: 'c'.repeat(20), SESSION_SECRET: 's'.repeat(32), TOOL_URL: 'https://apps.example.test/chaptertools', MATCH_TO: 'chapter@example.test' };
  const hops = (v?: string) => { const r = loadConfig({ ...base, ...(v === undefined ? {} : { TRUSTED_PROXY_HOPS: v }) }); return r.ok ? r.config.trustedProxyHops : null; };
  assert.equal(hops(), 1);
  assert.equal(hops('2'), 2);
  assert.equal(hops('0'), null);
  assert.equal(hops('9'), null);
  assert.equal(hops('two'), null);
});

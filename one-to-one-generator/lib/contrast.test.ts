import { test } from 'node:test';
import assert from 'node:assert/strict';

// Colour pairs used on the leadership page (Tailwind slate values and the BNI reds). WCAG AA needs 4.5 for body text.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const WHITE = '#ffffff', SLATE100 = '#f1f5f9', RED50 = '#fef2f2';
const pairs: [string, string, string][] = [
  ['header text on red', WHITE, '#CF2030'],
  ['button text on red', WHITE, '#CF2030'],
  ['button text on dark red (hover)', WHITE, '#A61926'],
  ['ghost button text on white', '#A61926', WHITE],
  ['ghost button text on hover tint', '#A61926', RED50],
  ['message text on page', '#7F1D1D', SLATE100],
  ['body text on white', '#334155', WHITE],
  ['body text on page', '#334155', SLATE100],
  ['small print on white', '#475569', WHITE],
  ['small print on page', '#475569', SLATE100],
  ['footer link on page', '#A61926', SLATE100],
  ['check-these text on its tint', '#7F1D1D', RED50],
  ['file name text on white', '#334155', WHITE],
  ['headings on white', '#0f172a', WHITE],
];
for (const [name, fg, bg] of pairs) {
  test(`contrast: ${name}`, () => assert.ok(ratio(fg, bg) >= 4.5, `${name} is ${ratio(fg, bg).toFixed(2)}`));
}

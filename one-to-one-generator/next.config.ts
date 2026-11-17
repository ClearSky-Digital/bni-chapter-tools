import type { NextConfig } from 'next';

// Leadership pages and the API: no referrers (a sign-in token may be in the address), no indexing, no framing.
const privateHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Cache-Control', value: 'no-store' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/chaptertools',
  allowedDevOrigins: ['192.168.22.222'],
  async headers() {
    return [
      { source: '/leadership', headers: privateHeaders },
      { source: '/api/:path*', headers: privateHeaders },
    ];
  },
};

export default nextConfig;

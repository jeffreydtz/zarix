/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.telegram.org' },
    ],
  },
  async headers() {
    return [
      {
        source: '/shared/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/api/shared/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://api.telegram.org https://coin-images.coingecko.com https://assets.coingecko.com https://s.yimg.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.telegram.org",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/logo-formats/favicon.ico' },
      {
        source: '/apple-touch-icon.png',
        destination: '/logo-formats/apple-touch-icon.png',
      },
    ];
  },
};

module.exports = nextConfig;

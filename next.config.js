/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    domains: ['api.telegram.org'],
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

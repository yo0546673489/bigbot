/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: 'http://localhost:7878/:path*',
      },
    ]
  },
};

module.exports = nextConfig;
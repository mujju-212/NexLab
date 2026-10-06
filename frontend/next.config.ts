import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const nextConfig: NextConfig = {
  // Minimal server output for the Docker image (docker/Dockerfile.frontend):
  // copies only used chunks + a tiny node server instead of node_modules.
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // /api/* proxy to Flask. Unused while NEXT_PUBLIC_API_URL points straight at
  // :5000, but setting NEXT_PUBLIC_API_URL=/api makes the browser same-origin
  // (no CORS) behind the frontend container — kept for that deployment.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/free/analytics',
        destination: '/practice/progress',
        permanent: false,
      },
      {
        source: '/free-user/analytics',
        destination: '/practice/progress',
        permanent: false,
      },
      {
        source: '/practice/analytics',
        destination: '/practice/progress',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
};

export default nextConfig;

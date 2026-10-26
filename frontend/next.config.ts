import type { NextConfig } from 'next';

// Server-side proxy target (never seen by the browser).
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:5000';
const API_URL = process.env.BACKEND_API_URL || `${BACKEND_URL}/api`;

const nextConfig: NextConfig = {
  // Minimal server output for the Docker image (docker/Dockerfile.frontend):
  // copies only used chunks + a tiny node server instead of node_modules.
  // Docker image (docker/Dockerfile.frontend) wants a standalone bundle in
  // production. Set NEXT_LOCAL_START=1 to build a regular bundle instead, which
  // is what `next start` (and any plain Node host) expects.
  output:
    process.env.NODE_ENV === 'production' && process.env.NEXT_LOCAL_START !== '1'
      ? 'standalone'
      : undefined,
  // /api/* proxy to Flask. Unused while NEXT_PUBLIC_API_URL points straight at
  // :5000, but setting NEXT_PUBLIC_API_URL=/api makes the browser same-origin
  // (no CORS) behind the frontend container — kept for that deployment.
  async rewrites() {
    return {
      // Keep Socket.IO rewrites ahead of filesystem routing, as before.
      beforeFiles: [
        {
          source: '/socket.io',
          destination: `${BACKEND_URL}/socket.io/`,
        },
        {
          source: '/socket.io/:path*',
          destination: `${BACKEND_URL}/socket.io/:path*`,
        },
      ],
      // Let the explicit /api/ai/harness/message route handler proxy long AI
      // turns without Next's 30-second rewrite timeout. Other API calls still
      // use the standard same-origin proxy when no app route matches.
      afterFiles: [],
      fallback: [
        {
          source: '/api/:path*',
          destination: `${API_URL}/:path*`,
        },
      ],
    };
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

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/chat-widget',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Default to 'self' and commonly used dev origins. 
            // When real domains are known, add them here: https://real-site.com
            value: "frame-ancestors 'self' http://localhost:* https://*.vercel.app;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

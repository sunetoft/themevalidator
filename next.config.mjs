const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.bunnystocks.com",
    "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
    "frame-ancestors 'self'",
  ];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // yahoo-finance2 ships Deno/test-only modules (@gadicc/fetch-mock-cache/…) in its
    // ESM build that webpack cannot resolve — keep it out of the bundle (same fix as
    // HoldSell/OptionLookup; the package was unused here until the ticker chart route).
    serverComponentsExternalPackages: ['@prisma/client', 'yahoo-finance2'],
    instrumentationHook: true,
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'canvas', 'jsdom', 'yahoo-finance2'];
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

export default nextConfig;

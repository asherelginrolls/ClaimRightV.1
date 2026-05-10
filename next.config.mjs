/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? [process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, '')]
          : []),
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://checkout.razorpay.com",
              "frame-src https://challenges.cloudflare.com https://api.razorpay.com",
              "connect-src 'self' https://*.supabase.co",
              "img-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig

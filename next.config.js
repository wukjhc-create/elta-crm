/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark native Node.js packages as external so they're not bundled by Turbopack
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client', 'basic-ftp', 'socks', 'cpu-features'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      // Allow localhost for dev and production domains
      allowedOrigins: [
        'localhost:3000',
        // Add your Vercel domains here after deployment
        // They will be automatically allowed via VERCEL_URL
        ...(process.env.VERCEL_URL ? [process.env.VERCEL_URL] : []),
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? [process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, '')]
          : []),
      ].filter(Boolean),
      // Sprint 9G — haevet fra default 1mb for besigtigelsesbilleder.
      // Klient komprimerer til max 1.5MB per billede + max 5MB total
      // payload-budget, saa 10mb giver god margin uden at risikere DOS.
      bodySizeLimit: '10mb',
    },
  },
  // Empty turbopack config to silence Next.js 16 warning
  // Turbopack is enabled by default in Next.js 16
  turbopack: {},
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    }
    return config
  },
}

module.exports = nextConfig

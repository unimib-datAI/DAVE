/** @type {import('next').NextConfig} */


const nextConfig = {
  reactStrictMode: true,
  experimental: {
    emotion: true
  },
  images: {
    domains: ['upload.wikimedia.org'],
  },
  // Disable TypeScript type checking during build
  typescript: {
    // !! WARN !!
    // Ignoring TypeScript type errors can be dangerous.
    // The issues should be fixed eventually.
    ignoreBuildErrors: true,
  },
  // Disable ESLint checking during build
  eslint: {
    // !! WARN !!
    // Ignoring ESLint errors can be dangerous.
    // The issues should be fixed eventually.
    ignoreDuringBuilds: true,
  },
  async redirects() {

    let redirectRoutes = []

    if (process.env.NEXT_PUBLIC_BASE_PATH) {
      redirectRoutes = [
        {
          source: '/',
          destination: process.env.NEXT_PUBLIC_BASE_PATH,
          permanent: true,
          basePath: false
        },
        ...redirectRoutes
      ]
    }
    return redirectRoutes;
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
}

module.exports = nextConfig

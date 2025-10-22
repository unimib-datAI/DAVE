/** @type {import('next').NextConfig} */

// Handle basePath - Next.js requires it to be either empty string or a path prefix (not "/")
const getBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
  if (!basePath || basePath === '/') {
    return '';
  }
  return basePath;
};

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    emotion: true,
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
    let redirectRoutes = [];

    const basePath = getBasePath();
    if (basePath) {
      redirectRoutes = [
        {
          source: '/',
          destination: basePath,
          permanent: true,
          basePath: false,
        },
        ...redirectRoutes,
      ];
    }
    return redirectRoutes;
  },
  basePath: getBasePath(),
};

module.exports = nextConfig;

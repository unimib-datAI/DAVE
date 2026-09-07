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
  // Pin the workspace root so Turbopack doesn't walk up to a stray lockfile
  // outside frontend/.
  turbopack: {
    root: __dirname,
  },
  compiler: {
    // Next 16: emotion moved from experimental.emotion -> compiler.emotion
    emotion: true,
  },
  experimental: {
    // Raise the body-size limit for the proxy layer (large document uploads).
    proxyClientMaxBodySize: '150mb',
  },
  images: {
    // Next 16: images.domains was removed in favour of remotePatterns.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
    ],
  },
  // Disable TypeScript type checking during build
  typescript: {
    // !! WARN !!
    // Ignoring TypeScript type errors can be dangerous.
    // The issues should be fixed eventually.
    ignoreBuildErrors: true,
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
  // Prevent @xenova/transformers (browser-only) from being bundled for SSR
  serverExternalPackages: ['@xenova/transformers'],
};

module.exports = nextConfig;

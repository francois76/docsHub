/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Rule bundle-barrel-imports: auto-transform lucide-react named imports into
    // direct per-icon imports at build time, avoiding loading all 1 500+ modules.
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Allow serving assets from cloned repos
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;

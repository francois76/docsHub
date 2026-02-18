/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
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

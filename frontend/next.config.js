/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Backend is called directly (CORS enabled on backend). Keep rewrites optional.
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  async redirects() {
    return [{source: '/signup', destination: '/sign-up', permanent: false}];
  },
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig = {
  transpilePackages: ['@health-coach/health-core']
} satisfies NextConfig;

export default nextConfig;

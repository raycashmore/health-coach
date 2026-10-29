import type { NextConfig } from 'next';

const nextConfig = {
  agentRules: false,
  transpilePackages: ['@health-coach/health-core']
} satisfies NextConfig;

export default nextConfig;

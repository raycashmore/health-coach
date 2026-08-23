import type { NextConfig } from 'next';

const nextConfig = {
  serverExternalPackages: ['pdfjs-dist'],
  transpilePackages: ['@health-coach/health-core']
} satisfies NextConfig;

export default nextConfig;

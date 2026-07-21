import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Monorepo: backend imports ../../catalog at repo root (outside backend/).
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;

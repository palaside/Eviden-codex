import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Resolve Turbopack root to an absolute path – avoid EPERM errors on Windows drives
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  // Ensure webpack does not watch the root drive (polling, ignore node_modules)
  webpack: (config) => {
    config.watchOptions = { poll: 1000, ignored: /node_modules/ };
    return config;
  },
};

export default nextConfig;

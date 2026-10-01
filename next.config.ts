import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next 16 defaults to the CLI type-checker. Its wrapper does not pass the
    // local TypeScript binary's arguments correctly in this environment.
    useTypeScriptCli: false,
  },
};
export default nextConfig;

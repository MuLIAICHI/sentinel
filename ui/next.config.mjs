/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app has its own lockfile separate from the repo root; scope tracing here.
  outputFileTracingRoot: import.meta.dirname,
  // The lib/ files use NodeNext-style `.js` import specifiers so the root
  // vitest/tsc (NodeNext) can compile them. Teach webpack the same rewrite so
  // `./reducer.js` resolves to `reducer.ts`/`.tsx` in the Next build.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;

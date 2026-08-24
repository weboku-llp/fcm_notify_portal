/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TypeScript source and are transpiled by Next.
  transpilePackages: ["@notif/contracts"],
  eslint: { ignoreDuringBuilds: true },
  // Contracts use NodeNext-style `./foo.js` specifiers that point at `foo.ts`.
  // Webpack needs this alias; without it, resolution fails for the barrel file.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;

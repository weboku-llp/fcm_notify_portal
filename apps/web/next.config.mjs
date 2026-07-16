/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TS source and transpiled by Next.
  transpilePackages: ["@notif/contracts"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

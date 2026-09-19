/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // These ship native binaries; load them from node_modules instead of bundling.
  serverExternalPackages: ["ffmpeg-static", "youtube-dl-exec"],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // M1: uploads go through a Node route handler; allow larger bodies for video.
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;

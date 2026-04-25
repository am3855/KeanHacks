/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Preserve existing aliases and externals for MediaPipe WASM compatibility
    config.resolve.alias = { ...config.resolve.alias };
    config.externals = [...(config.externals || [])];
    return config;
  },
};

export default nextConfig;

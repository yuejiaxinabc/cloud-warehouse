/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['antd', '@ant-design/icons', 'recharts'],
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push('ali-oss', 'cos-nodejs-sdk-v5');
    return config;
  },
}
module.exports = nextConfig

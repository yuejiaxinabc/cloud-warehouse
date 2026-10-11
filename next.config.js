/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // 安全加固（FIX-2026-1005）：项目未使用 next/image，
  // 关闭内置图片优化器以消除 Image Optimization RCE/DoS/磁盘耗尽整条攻击面（Next 14 EOL 余留通告）
  images: { unoptimized: true },
  transpilePackages: ['antd', '@ant-design/icons', 'recharts'],
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push('ali-oss', 'cos-nodejs-sdk-v5');
    return config;
  },
}
module.exports = nextConfig

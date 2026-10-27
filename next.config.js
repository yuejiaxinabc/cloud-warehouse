/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIX-2026-1012：启用 instrumentation.ts，用于启动期 NEXTAUTH_SECRET 强度自检
  experimental: { instrumentationHook: true },
  // FIX-2026-1012：Next 默认在每个响应打 X-Powered-By: Next.js，
  // 相当于免费告诉扫描器这是什么框架、该用哪套漏洞。关掉。
  poweredByHeader: false,
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

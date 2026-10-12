'use client';

// Next.js 15 + React 19 适配：antd v5 在 React 19 下需要此补丁修复部分内部 API 不兼容。
// 放在根布局（所有路由共用），模块副作用会在客户端初始化时先于 antd 组件执行。
import '@ant-design/v5-patch-for-react-19';

export default function AntdReact19Patch() {
  return null;
}

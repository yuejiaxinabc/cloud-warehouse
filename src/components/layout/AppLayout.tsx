'use client';

/**
 * 遗留入口（1.2.4 分工 A 整理）：
 * 真正的 AppLayout 在 ./Sidebar.tsx（默认导出，内含 Sider + Header + Content），
 * (dashboard)/layout.tsx 也是从那里引入的。
 * 旧版这里曾以 <Sidebar collapsed onCollapse> 的方式调用，但 Sidebar 并不接受
 * 这两个 props，会导致 TypeScript 编译失败；现改为直接复用同一份实现，
 * 保持 `components/layout/index.ts` 的 `export { default as AppLayout }` 可用。
 */
export { default } from './Sidebar';
export { default as AppLayout } from './Sidebar';

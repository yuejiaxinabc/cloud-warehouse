/**
 * 启动期安全自检（FIX-2026-1012）
 *
 * 注意两点：
 * 1) 项目使用 src/ 目录结构，instrumentation.ts 必须放在 src/ 下，
 *    放仓库根目录 Next 不会加载且没有任何提示。
 * 2) 这里只记录日志、不抛异常 —— Next 会把 instrumentation 的异常在每次
 *    请求时重试加载，导致满屏堆栈且错误页不可控。真正的 fail-closed 闸门
 *    放在 middleware：密钥不合格时全站返回 503。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { secretUsable } = await import('./lib/env-guard');
    secretUsable();
  }
}

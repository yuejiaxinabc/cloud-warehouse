/**
 * 启动期安全自检 + 备份调度（FIX-2026-1012 / v1.2.4）
 *
 * 注意：
 * 1) 项目使用 src/ 目录结构，instrumentation.ts 必须放在 src/ 下，放仓库根目录不会被加载。
 * 2) 这里只记录日志、不抛异常 —— Next 会把 instrumentation 的异常在每次请求时重试加载。
 * 3) 关键：instrumentation 会同时被 edge 与 node 编译，**不能静态或动态 import 含
 *    node:child_process / node:fs 的模块**（会触发 UnhandledSchemeError）。
 *    所以备份调度改成「定时向本机 cron 接口发一个请求」，真正的备份逻辑留在
 *    API 路由里（Node runtime）。
 */
const globalForBackup = globalThis as unknown as { __backupTimer?: NodeJS.Timeout; __backupBooted?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { secretUsable } = await import('./lib/env-guard');
  secretUsable();

  if (globalForBackup.__backupBooted) return;
  globalForBackup.__backupBooted = true;

  const port = process.env.PORT || '3000';
  const target = process.env.BACKUP_CRON_URL || ('http://127.0.0.1:' + port + '/api/cron/backup');

  globalForBackup.__backupTimer = setInterval(async () => {
    try {
      const res = await fetch(target, {
        headers: { 'x-cron-secret': process.env.NEXTAUTH_SECRET || '' },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (data && data.ran) console.log('[backup] 定时备份已完成');
    } catch (error: any) {
      console.warn('[backup] 定时备份调度异常：', (error && error.message) || error);
    }
  }, 60 * 1000);

  if (typeof globalForBackup.__backupTimer.unref === 'function') globalForBackup.__backupTimer.unref();
  console.log('[backup] 自动备份调度器已启动（每 60 秒检查一次）');
}

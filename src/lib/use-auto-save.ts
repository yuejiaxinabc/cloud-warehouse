import { useEffect, useRef, useCallback } from 'react';

/**
 * useAutoSave - 自动保存表单数据到 localStorage
 * 
 * 功能：
 * - 每隔 intervalMs 毫秒自动保存当前数据到 localStorage
 * - 组件挂载时自动恢复上次保存的数据
 * - 组件卸载或数据提交成功后清除保存的数据
 * 
 * @param key localStorage 键名
 * @param data 要保存的数据（对象）
 * @param intervalMs 保存间隔（毫秒），默认 30000（30秒）
 * @returns { restoreData, clearSaved }
 */
export function useAutoSave<T extends Record<string, any>>(
  key: string,
  data: T | null,
  intervalMs: number = 30000
) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<T | null>(data);

  // Keep ref in sync
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Auto-save on interval
  useEffect(() => {
    if (!data) return;

    timerRef.current = setInterval(() => {
      try {
        const current = dataRef.current;
        if (current && Object.keys(current).length > 0) {
          const saveData = {
            data: current,
            savedAt: new Date().toISOString(),
            version: 1,
          };
          localStorage.setItem(key, JSON.stringify(saveData));
          console.log(`[AutoSave] ${key} saved at ${new Date().toLocaleTimeString()}`);
        }
      } catch (e) {
        console.warn('[AutoSave] save failed:', e);
      }
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [key, data, intervalMs]);

  // Restore saved data
  const restoreData = useCallback((): { data: T; savedAt: string } | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.data && parsed.version === 1) {
        return { data: parsed.data, savedAt: parsed.savedAt };
      }
      return null;
    } catch {
      return null;
    }
  }, [key]);

  // Clear saved data (call after successful submit)
  const clearSaved = useCallback(() => {
    try {
      localStorage.removeItem(key);
      console.log(`[AutoSave] ${key} cleared`);
    } catch {}
  }, [key]);

  return { restoreData, clearSaved };
}

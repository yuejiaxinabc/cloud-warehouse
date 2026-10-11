/**
 * 云仓库存管理系统 - 客户端 API 模块
 * 适用于: Windows / macOS / iOS / Android / 鸿蒙
 * 
 * 所有客户端 APP 共用此模块，通过 WebView 加载或作为独立 JS 模块
 */

interface AppConfig {
  apiBaseUrl: string;  // API 地址，如 https://warehouse.yuejiaxin.ln.cn
  apiToken: string;    // API Token
  platform: string;    // 平台标识: windows-x86 | windows-x64 | mac-arm | mac-intel | ios | android | harmonyos
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class InventoryAPI {
  private config: AppConfig | null = null;

  /**
   * 初始化配置
   */
  configure(config: AppConfig): void {
    this.config = config;
    localStorage.setItem('app_config', JSON.stringify(config));
  }

  /**
   * 加载已保存的配置
   */
  loadConfig(): AppConfig | null {
    if (this.config) return this.config;
    const saved = localStorage.getItem('app_config');
    if (saved) {
      this.config = JSON.parse(saved);
      return this.config;
    }
    return null;
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return !!this.loadConfig();
  }

  /**
   * 清除配置
   */
  clearConfig(): void {
    this.config = null;
    localStorage.removeItem('app_config');
  }

  /**
   * 获取当前平台标识
   */
  getPlatform(): string {
    // 如果是原生 APP 注入的平台信息
    if ((window as any).__PLATFORM__) return (window as any).__PLATFORM__;
    
    // 通过 UserAgent 判断
    const ua = navigator.userAgent;
    if (/Windows/.test(ua)) {
      return /x64|Win64|WOW64/.test(ua) ? 'windows-x64' : 'windows-x86';
    }
    if (/Mac/.test(ua)) {
      return /Intel/.test(ua) ? 'mac-intel' : 'mac-arm';
    }
    if (/iPhone|iPad/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/HarmonyOS/.test(ua)) return 'harmonyos';
    return 'web';
  }

  /**
   * 统一请求方法
   */
  async request<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const config = this.loadConfig();
    if (!config) {
      return { success: false, error: '未配置API地址，请先在设置中配置' };
    }

    const url = `${config.apiBaseUrl.replace(/\/+$/, '')}${path}`;
    const platform = this.getPlatform();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Token': config.apiToken,
      'X-Client-Platform': platform,
      'X-Client-Version': '1.0.0',
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // 处理 302 重定向（NextAuth 登录）
      if (response.status === 302) {
        return { success: false, error: '登录已过期，请重新登录' };
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return { success: false, error: '无法连接到服务器，请检查API地址是否正确' };
      }
      return { success: false, error: error.message || '网络请求失败' };
    }
  }

  // ============ 业务 API ============

  /** 登录检查 */
  async loginCheck(username: string, password: string) {
    return this.request('/api/auth/login-check', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  /** 获取验证码 */
  async getCaptcha() {
    return this.request('/api/auth/captcha');
  }

  /** 获取 CSRF Token */
  async getCsrf() {
    return this.request('/api/auth/csrf');
  }

  /** 获取商品列表 */
  async getProducts(params: { page?: number; pageSize?: number; keyword?: string } = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params.keyword) sp.set('keyword', params.keyword);
    return this.request(`/api/products?${sp}`);
  }

  /** 获取仓库列表 */
  async getWarehouses() {
    return this.request('/api/warehouse');
  }

  /** 获取库存列表 */
  async getInventory(params: { page?: number; pageSize?: number; keyword?: string } = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params.keyword) sp.set('keyword', params.keyword);
    return this.request(`/api/inventory?${sp}`);
  }

  /** 获取入库单列表 */
  async getStockIn(params: { page?: number; pageSize?: number; status?: string } = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params.status) sp.set('status', params.status);
    return this.request(`/api/stock-in?${sp}`);
  }

  /** 获取出库单列表 */
  async getStockOut(params: { page?: number; pageSize?: number; status?: string } = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params.status) sp.set('status', params.status);
    return this.request(`/api/stock-out?${sp}`);
  }

  /** 获取日志 */
  async getLogs(params: { type?: string; page?: number; pageSize?: number; keyword?: string } = {}) {
    const sp = new URLSearchParams();
    if (params.type) sp.set('type', params.type);
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params.keyword) sp.set('keyword', params.keyword);
    return this.request(`/api/logs?${sp}`);
  }

  /** 获取系统设置 */
  async getSettings() {
    return this.request('/api/settings/system');
  }

  /** 验证 Token */
  async verifyToken(token: string) {
    return this.request('/api/settings/token', {
      method: 'PUT',
      body: JSON.stringify({ token }),
    });
  }
}

// 导出单例
export const api = new InventoryAPI();
export type { AppConfig, ApiResponse };

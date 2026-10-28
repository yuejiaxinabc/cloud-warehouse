'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/brand/Logo';

/**
 * 仓库现场大屏（v1.3）
 * - 独立路由，不挂在 dashboard 布局下，适合挂电视全屏
 * - 30 秒轮询，只读，不提供任何写操作
 */
export default function ScreenPage() {
  const router = useRouter();
  const [data, setData] = useState<any>({ kpi: null, trend: [], alerts: [] });
  const [now, setNow] = useState(new Date());
  const [fail, setFail] = useState(false);
  // 柱子悬浮提示：{ x, y, date, inbound, outbound, transfer }
  const [tip, setTip] = useState<any>(null);

  // Esc 也能退出大屏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const [kpi, alerts, trend] = await Promise.all([
        fetch('/api/reports?type=dashboard', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/alerts?pageSize=8', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/reports?type=trend&days=7', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      setData({
        kpi: kpi?.success ? kpi.data : null,
        trend: Array.isArray(trend?.data) ? trend.data : (trend?.data?.results || []),
        alerts: alerts?.success ? (alerts.data?.items || []) : [],
      });
      setFail(false);
    } catch {
      setFail(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    const c = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load]);

  const kpi = data.kpi || {};
  const cards = [
    { label: '库存记录数', value: kpi.inventoryCount ?? '—', unit: '条' },
    { label: '库存总价值', value: kpi.totalValue != null ? `¥${Number(kpi.totalValue).toLocaleString()}` : '—' },
    { label: '商品种类', value: kpi.productCount ?? '—', unit: '种' },
    { label: '仓库数', value: kpi.warehouseCount ?? '—', unit: '个' },
    { label: '待处理预警', value: data.alerts.length || 0, unit: '条' },
  ];

  const maxTrend = Math.max(1, ...data.trend.map((t: any) => Math.max(Number(t.inbound || 0), Number(t.outbound || 0))));

  return (
    <div className="yc-screen">
      <header className="yc-screen-head">
        <div className="yc-screen-brand">
          <LogoMark size={40} />
          <div>
            <div className="yc-screen-title">云仓 · 仓储实时看板</div>
            <div className="yc-screen-sub">YUNCANG LIVE WAREHOUSE BOARD</div>
          </div>
        </div>
        <div className="yc-screen-head-right">
          <div className="yc-screen-clock">
            <div className="yc-screen-time">{now.toLocaleTimeString('zh-CN', { hour12: false })}</div>
            <div className="yc-screen-date">{now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })}</div>
          </div>
          <button className="yc-screen-exit" onClick={() => router.push('/')} title="退出大屏（Esc）">
            <span aria-hidden>✕</span> 退出大屏
          </button>
        </div>
      </header>

      {fail && <div className="yc-screen-warn">数据刷新失败，将在 30 秒后重试</div>}

      <section className="yc-screen-kpis">
        {cards.map((c) => (
          <div className="yc-screen-kpi" key={c.label}>
            <div className="yc-screen-kpi-label">{c.label}</div>
            <div className="yc-screen-kpi-value">
              {c.value}
              {c.unit && <span className="yc-screen-kpi-unit">{c.unit}</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="yc-screen-main">
        <div className="yc-screen-panel">
          <div className="yc-screen-panel-title">近 7 天出入库</div>
          <div className="yc-screen-chart">
            {data.trend.length === 0 && <div className="yc-screen-empty">暂无出入库数据</div>}
            {data.trend.map((t: any) => {
              const inH = (Number(t.inbound || 0) / maxTrend) * 100;
              const outH = (Number(t.outbound || 0) / maxTrend) * 100;
              const show = (e: React.MouseEvent, kind: 'in' | 'out') => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 10,
                  date: t.date,
                  kind,
                  inbound: Number(t.inbound || 0),
                  outbound: Number(t.outbound || 0),
                  transfer: Number(t.transfer || 0),
                });
              };
              return (
                <div className="yc-screen-bar-group" key={t.date}>
                  <div className="yc-screen-bars">
                    <div
                      className="yc-screen-bar in"
                      style={{ height: `${inH}%` }}
                      onMouseEnter={(e) => show(e, 'in')}
                      onMouseLeave={() => setTip(null)}
                    />
                    <div
                      className="yc-screen-bar out"
                      style={{ height: `${outH}%` }}
                      onMouseEnter={(e) => show(e, 'out')}
                      onMouseLeave={() => setTip(null)}
                    />
                  </div>
                  <div className="yc-screen-bar-label">{t.date}</div>
                </div>
              );
            })}
          </div>
          <div className="yc-screen-legend">
            <span><i className="in" />入库</span>
            <span><i className="out" />出库</span>
          </div>
        </div>

        <div className="yc-screen-panel">
          <div className="yc-screen-panel-title">预警滚动</div>
          <ul className="yc-screen-alerts">
            {data.alerts.length === 0 && <li className="yc-screen-empty">暂无预警</li>}
            {data.alerts.map((a: any) => (
              <li key={a.id} className={`lv-${String(a.level || '').toLowerCase()}`}>
                <span className="dot" />
                <span className="txt">{a.title}｜{a.productName || ''}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {tip && (
        <div
          className="yc-screen-tip"
          style={{ left: tip.x, top: tip.y }}
          role="tooltip"
        >
          <div className="yc-screen-tip-date">{tip.date}</div>
          <div className={`yc-screen-tip-row ${tip.kind === 'in' ? 'is-active' : ''}`}>
            <i className="dot in" />入库<b>{tip.inbound}</b>
          </div>
          <div className={`yc-screen-tip-row ${tip.kind === 'out' ? 'is-active' : ''}`}>
            <i className="dot out" />出库<b>{tip.outbound}</b>
          </div>
          {tip.transfer > 0 && (
            <div className="yc-screen-tip-row"><i className="dot tr" />调拨<b>{tip.transfer}</b></div>
          )}
        </div>
      )}

      <footer className="yc-screen-foot">每 30 秒自动刷新 · 数据来源：云仓仓储管理系统</footer>
    </div>
  );
}

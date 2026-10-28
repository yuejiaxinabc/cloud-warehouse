import React from 'react';

/**
 * 云仓品牌标识（v1.1.1 重新设计）
 *
 * 设计语汇：
 *  - 图形 = 「云」+「仓」：上方云朵弧线代表云端/数字化，下方方体代表货箱与仓位；
 *  - 方体中间一道竖线是货位分隔，暗示「四段货位编码」这一核心业务；
 *  - 整体落在 12px 圆角方块里，缩到 24px 仍能看清轮廓，适合侧栏与登录页复用。
 */
export function LogoMark({
  size = 32,
  radius,
  variant = 'solid',
}: {
  size?: number;
  radius?: number;
  variant?: 'solid' | 'light';
}) {
  const r = radius ?? Math.round(size * 0.28);
  const solid = variant === 'solid';
  const gid = `yc-grad-${size}-${radius ?? 'd'}-${variant}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="云仓"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gid} x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {solid ? (
        <rect width="48" height="48" rx={r} fill={`url(#${gid})`} />
      ) : (
        <rect width="48" height="48" rx={r} fill="#EFF6FF" stroke="#BFDBFE" />
      )}

      {/* 云：一段饱满的云朵轮廓 */}
      <path
        d="M16.4 22.6c0-3.2 2.5-5.8 5.6-5.8 1.9 0 3.6 1 4.6 2.5a4.6 4.6 0 0 1 6.6 4.1c0 .3 0 .6-.1.9a3.6 3.6 0 0 1-1.3 6.9H16.6a4.2 4.2 0 0 1-.2-8.4z"
        fill={solid ? '#FFFFFF' : '#2563EB'}
        fillOpacity={solid ? 0.96 : 1}
      />

      {/* 仓：货箱方体 */}
      <path
        d="M15 30.5h18v8.1c0 1.2-1 2.2-2.2 2.2H17.2A2.2 2.2 0 0 1 15 38.6z"
        fill={solid ? '#FFFFFF' : '#2563EB'}
        fillOpacity={solid ? 0.55 : 0.18}
      />
      {/* 货位分隔线 */}
      <path
        d="M24 30.5v10.3"
        stroke={solid ? '#1D4ED8' : '#2563EB'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity={solid ? 0.9 : 0.7}
      />
    </svg>
  );
}

/** Logo + 文字组合，用于侧边栏头部与登录页 */
export function LogoLockup({
  size = 34,
  title = '云仓',
  subtitle = '智能仓储管理平台',
  collapsed = false,
  color = '#0F172A',
}: {
  size?: number;
  title?: string;
  subtitle?: string;
  collapsed?: boolean;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <LogoMark size={size} />
      {!collapsed && (
        <div style={{ minWidth: 0, lineHeight: 1.25 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color,
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 11,
                color: color === '#0F172A' ? '#94A3B8' : 'rgba(255,255,255,0.75)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.2px',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LogoMark;

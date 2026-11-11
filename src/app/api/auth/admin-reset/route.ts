import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { hash, compare } from 'bcryptjs';
import crypto from 'crypto';
import { handleApiError, AppError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';
import { hit } from '@/lib/rate-limit';

/**
 * 全局重置令牌（M5）
 *
 * v1.2.0 的三处问题：
 *  1) 令牌「长期有效直到管理员重新设置」—— 泄露即永久接管全员账号；
 *  2) 一个令牌全用户共用，重置成功后仍可继续用；
 *  3) UI 只能设置不能清除（API 里的 clear-token 没人调用），等于不可撤销。
 *
 * 现在的规则：
 *  - 令牌有时效（默认 24h，最长 7 天），过期即失效；
 *  - 一次性：任何一次成功重置后立即作废，必须由管理员重新签发；
 *  - 可显式清除（clear-token / clear / disable 均接受），并写审计日志；
 *  - verify 走 IP 限流 + 恒定时间比较 + 统一错误文案（不暴露用户名是否存在）。
 */

const CATEGORY = 'reset_token';
const COL_TOKEN = 'global';
const COL_EXPIRES = 'expiresAt';
const COL_SUBJECT = 'username';

const DEFAULT_TTL_HOURS = 1;
const MAX_TTL_HOURS = 24;

async function readTokenRows() {
  const rows = await prisma.systemConfig.findMany({ where: { category: CATEGORY } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.colKey] = r.value ?? '';
  const tokenHash = map[COL_TOKEN] || '';
  const expiresAtRaw = map[COL_EXPIRES] || '';
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  return {
    tokenHash,
    expiresAt,
    username: map[COL_SUBJECT] || '',
    expired: !expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || !map[COL_SUBJECT],
    hasToken: !!tokenHash,
  };
}

async function clearToken() {
  await prisma.systemConfig.deleteMany({ where: { category: CATEGORY } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // ---- 管理员：签发 / 轮换令牌 ----
    if (action === 'set-token') {
      const session = await requireAdmin();
      const username = String(body.username || '').trim();
      if (!username || !await prisma.user.findFirst({ where: { username, status: 1 }, select: { id: true } })) throw new AppError('请选择启用的目标账号', 400);
      const ttlHours = Math.min(
        MAX_TTL_HOURS,
        Math.max(1, Number(body.ttlHours) || DEFAULT_TTL_HOURS)
      );

      let resetToken = String(body.token || '').trim();
      if (!resetToken) {
        resetToken = crypto.randomBytes(16).toString('hex');
      } else if (resetToken.length < 16) {
        return NextResponse.json({ success: false, error: '令牌不能少于 16 位' }, { status: 400 });
      }

      const hashedToken = await hash(resetToken, 10);
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

      await prisma.$transaction([
        prisma.systemConfig.upsert({
          where: { category_colKey: { category: CATEGORY, colKey: COL_SUBJECT } },
          update: { value: username }, create: { category: CATEGORY, colKey: COL_SUBJECT, value: username },
        }),
        prisma.systemConfig.upsert({
          where: { category_colKey: { category: CATEGORY, colKey: COL_TOKEN } },
          update: { value: hashedToken },
          create: { category: CATEGORY, colKey: COL_TOKEN, value: hashedToken },
        }),
        prisma.systemConfig.upsert({
          where: { category_colKey: { category: CATEGORY, colKey: COL_EXPIRES } },
          update: { value: expiresAt.toISOString() },
          create: { category: CATEGORY, colKey: COL_EXPIRES, value: expiresAt.toISOString() },
        }),
      ]);

      await writeLog({
        module: 'settings',
        action: 'reset_token_set',
        userId: Number((session.user as any).id) || undefined,
        content: '签发全局重置令牌（有效期 ' + ttlHours + ' 小时，一次性）',
        refType: 'system_config',
        ip: getClientIp(),
      });

      return NextResponse.json({
        success: true,
        data: { token: resetToken, expiresAt: expiresAt.toISOString(), ttlHours, username },
        message: '全局重置令牌已签发（' + ttlHours + ' 小时内有效，使用一次即失效）',
      });
    }

    // ---- 管理员：清除令牌（含历史别名，避免前端沿用旧 action 名失效）----
    if (['clear-token', 'clear', 'remove-token', 'disable', 'unset'].includes(action)) {
      const session = await requireAdmin();
      await clearToken();
      await writeLog({
        module: 'settings',
        action: 'reset_token_clear',
        userId: Number((session.user as any).id) || undefined,
        content: '清除全局重置令牌',
        refType: 'system_config',
        ip: getClientIp(),
      });
      return NextResponse.json({ success: true, message: '重置令牌已清除' });
    }

    // ---- 管理员：查询状态 ----
    if (action === 'check-token') {
      await requireAdmin();
      const state = await readTokenRows();
      return NextResponse.json({
        success: true,
        data: {
          hasToken: state.hasToken,
          expired: state.expired,
          expiresAt: state.expiresAt && Number.isFinite(state.expiresAt.getTime()) ? state.expiresAt.toISOString() : null,
          username: state.username,
        },
      });
    }

    // ---- 任何人：用令牌重置密码 ----
    if (action === 'verify') {
      const ip = getClientIp();
      const rl = await hit('reset:verify:' + ip, 10, 15 * 60 * 1000);
      if (!rl.allowed) {
        return NextResponse.json({ success: false, error: '尝试过于频繁，请 15 分钟后再试' }, { status: 429 });
      }

      const username = String(body.username || '').trim();
      const token = String(body.token || '');
      const newPassword = String(body.newPassword || '');

      if (!username || !token || !newPassword) {
        return NextResponse.json({ success: false, error: '参数不完整' }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ success: false, error: '新密码至少 8 位' }, { status: 400 });
      }

      const state = await readTokenRows();
      if (!state.hasToken) {
        return NextResponse.json({ success: false, error: '系统未设置重置令牌，请联系管理员' }, { status: 400 });
      }
      if (state.expired) {
        return NextResponse.json({ success: false, error: '重置令牌已过期，请联系管理员重新签发' }, { status: 400 });
      }

      const user = await prisma.user.findFirst({
        where: { username, status: 1 },
        select: { id: true, username: true },
      });

      // 用户不存在时也跑一次 compare，保持响应时间一致（防用户名枚举）
      const valid = await compare(token, state.tokenHash);
      if (!user || !valid || state.username !== username) {
        return NextResponse.json({ success: false, error: '用户名或重置令牌错误' }, { status: 400 });
      }

      const hashedPassword = await hash(newPassword, 12);
      await prisma.$transaction(async (tx) => {
        // CAS deletion locks the specific issuance. A concurrent redemption loses;
        // a newly rotated issuance is never cleared by a stale verifier.
        const consumed = await tx.systemConfig.deleteMany({ where: { category: CATEGORY, colKey: COL_TOKEN, value: state.tokenHash } });
        if (consumed.count !== 1 || !state.expiresAt || state.expiresAt.getTime() <= Date.now()) throw new AppError('重置令牌已失效', 400);
        const changed = await tx.user.updateMany({
          where: { id: user.id, status: 1 },
          data: { password: hashedPassword, sessionVersion: { increment: 1 }, verifyToken: null, verifyTokenExpires: null },
        });
        if (changed.count !== 1) throw new AppError('账号状态已变更', 400);
      });

      await writeLog({
        module: 'auth',
        action: 'password_reset_by_token',
        userId: Number(user.id),
        content: '账号 ' + user.username + ' 通过全局重置令牌重置密码（令牌已作废）',
        refType: 'user',
        refId: user.id,
        ip,
      });

      return NextResponse.json({
        success: true,
        message: '密码重置成功，请使用新密码登录（重置令牌已作废）',
      });
    }

    return NextResponse.json({ success: false, error: '无效操作' }, { status: 400 });
  } catch (error: any) {
    // F13：未登录/非管理员必须是 401/403，不能是 500
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    await requireAdmin();
    const state = await readTokenRows();
    return NextResponse.json({
      success: true,
      data: {
        hasToken: state.hasToken,
        expired: state.expired,
        expiresAt: state.expiresAt && Number.isFinite(state.expiresAt.getTime()) ? state.expiresAt.toISOString() : null,
          username: state.username,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

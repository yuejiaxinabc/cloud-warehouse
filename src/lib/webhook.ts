import crypto from 'crypto';
import { prisma } from './prisma';

/**
 * Webhook 派发（v1.2.0）
 * - 事件：product.created / inbound.posted / outbound.posted / stock.changed
 * - 签名：x-yc-signature = HMAC-SHA256(secret, `${ts}.${body}`)
 * - 失败不阻塞主流程（fire-and-forget + 3s 超时）
 */
export type WebhookEvent =
  | 'product.created'
  | 'product.updated'
  | 'inbound.posted'
  | 'outbound.posted'
  | 'stock.changed';

export async function emitWebhook(event: WebhookEvent, payload: Record<string, any>): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { status: 1 } });
    const targets = endpoints.filter((e: any) => {
      const list = String(e.events || '').split(',').map((s) => s.trim()).filter(Boolean);
      return list.includes('*') || list.includes(event);
    });
    if (!targets.length) return;

    const body = JSON.stringify({
      event,
      at: new Date().toISOString(),
      data: payload,
    });

    await Promise.all(
      targets.map(async (ep: any) => {
        const ts = Date.now().toString();
        const signature = crypto.createHmac('sha256', ep.secret).update(`${ts}.${body}`).digest('hex');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          const res = await fetch(ep.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-yc-event': event,
              'x-yc-timestamp': ts,
              'x-yc-signature': signature,
            },
            body,
            signal: controller.signal,
          });
          await prisma.webhookEndpoint.update({
            where: { id: ep.id },
            data: { lastStatus: res.status, lastAt: new Date() },
          });
        } catch {
          await prisma.webhookEndpoint.update({
            where: { id: ep.id },
            data: { lastStatus: 0, lastAt: new Date() },
          }).catch(() => {});
        } finally {
          clearTimeout(timer);
        }
      })
    );
  } catch (e) {
    console.error('[webhook] dispatch failed', e);
  }
}

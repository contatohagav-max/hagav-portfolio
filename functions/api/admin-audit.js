import { authenticateRequest, json, stripDangerousText } from '../_utils/admin-auth.js';
import { logAdminRequestEvent } from '../_utils/admin-audit.js';
import { applyRateLimit, rateLimitResponse } from '../_utils/rate-limit.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['operacao', 'comercial', 'admin'],
    allowBearer: true,
    allowCookie: true,
  });
  if (!auth.ok) return json({ ok: false, error: auth.reason || 'unauthorized' }, auth.status || 401);

  const rate = applyRateLimit({
    namespace: 'admin-audit',
    key: auth.actor.id || auth.actor.email || 'anonymous',
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return rateLimitResponse({ ok: false, error: 'rate_limited' }, rate);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  await logAdminRequestEvent(env, request, {
    action: stripDangerousText(String(body?.action || 'client.audit'), 120) || 'client.audit',
    status: stripDangerousText(String(body?.status || 'ok'), 40) || 'ok',
    origin: stripDangerousText(String(body?.origin || 'painel'), 120) || 'painel',
    actorUserId: auth.actor.id,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    resourceType: stripDangerousText(String(body?.resource_type || ''), 80) || null,
    resourceId: stripDangerousText(String(body?.resource_id || ''), 160) || null,
    details: body?.details && typeof body.details === 'object' ? body.details : null,
  });

  return json({ ok: true });
}

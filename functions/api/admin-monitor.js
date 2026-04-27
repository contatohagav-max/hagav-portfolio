import { authenticateRequest, json, stripDangerousText } from '../_utils/admin-auth.js';
import { logAdminRequestEvent } from '../_utils/admin-audit.js';
import { applyRateLimit, rateLimitResponse } from '../_utils/rate-limit.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['viewer', 'operacao', 'comercial', 'admin'],
    allowBearer: true,
    allowCookie: true,
  });
  if (!auth.ok) return json({ ok: false, error: auth.reason || 'unauthorized' }, auth.status || 401);

  const rate = applyRateLimit({
    namespace: 'admin-monitor',
    key: auth.actor.id || auth.actor.email || 'anonymous',
    limit: 80,
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
    action: 'runtime.client_error',
    status: 'error',
    origin: stripDangerousText(String(body?.origin || 'painel'), 120) || 'painel',
    actorUserId: auth.actor.id,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    resourceType: 'runtime',
    resourceId: stripDangerousText(String(body?.path || ''), 200) || null,
    details: {
      message: stripDangerousText(String(body?.message || ''), 600),
      stack: stripDangerousText(String(body?.stack || ''), 1800),
      path: stripDangerousText(String(body?.path || ''), 200),
      context: body?.context && typeof body.context === 'object' ? body.context : null,
    },
  });

  return json({ ok: true });
}

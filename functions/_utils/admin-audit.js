import { getClientIp, getRequestUserAgent, getSupabaseConfig, stripDangerousText } from './admin-auth.js';

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function logAdminEvent(env, event = {}) {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.serviceRoleKey) return { ok: false, reason: 'supabase_not_configured' };

  const payload = {
    actor_user_id: event.actorUserId || null,
    actor_email: stripDangerousText(String(event.actorEmail || ''), 200) || null,
    actor_role: stripDangerousText(String(event.actorRole || ''), 40) || null,
    action: stripDangerousText(String(event.action || 'unknown'), 120) || 'unknown',
    resource_type: stripDangerousText(String(event.resourceType || ''), 80) || null,
    resource_id: stripDangerousText(String(event.resourceId || ''), 160) || null,
    status: stripDangerousText(String(event.status || 'ok'), 40) || 'ok',
    route: stripDangerousText(String(event.route || ''), 200) || null,
    origin: stripDangerousText(String(event.origin || ''), 160) || null,
    ip: stripDangerousText(String(event.ip || ''), 120) || null,
    user_agent: stripDangerousText(String(event.userAgent || ''), 240) || null,
    details: event.details && typeof event.details === 'object' ? event.details : null,
  };

  try {
    const response = await fetch(`${config.url}/rest/v1/admin_audit_logs`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        authorization: `Bearer ${config.serviceRoleKey}`,
        'content-type': 'application/json; charset=utf-8',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const parsed = await parseJsonSafe(response);
      return {
        ok: false,
        reason: String(parsed?.message || parsed?.error_description || `audit_http_${response.status}`),
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || 'audit_write_failed' };
  }
}

export async function logAdminRequestEvent(env, request, event = {}) {
  return logAdminEvent(env, {
    ...event,
    route: event.route || new URL(request.url).pathname,
    ip: event.ip || getClientIp(request),
    userAgent: event.userAgent || getRequestUserAgent(request),
  });
}

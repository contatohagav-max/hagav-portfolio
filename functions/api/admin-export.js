import { authenticateRequest, getSupabaseConfig, json } from '../_utils/admin-auth.js';
import { logAdminRequestEvent } from '../_utils/admin-audit.js';
import { applyRateLimit, rateLimitHeaders, rateLimitResponse } from '../_utils/rate-limit.js';

async function fetchTable(config, table, query = '*') {
  const response = await fetch(`${config.url}/rest/v1/${table}?select=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json; charset=utf-8',
    },
  });
  const text = await response.text();
  let parsed = [];
  try {
    parsed = text ? JSON.parse(text) : [];
  } catch {
    parsed = [];
  }
  if (!response.ok) {
    throw new Error(String(parsed?.message || parsed?.error_description || `${table}_export_${response.status}`));
  }
  return Array.isArray(parsed) ? parsed : [];
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['admin'],
    allowBearer: true,
    allowCookie: true,
  });
  if (!auth.ok) return json({ ok: false, error: auth.reason || 'unauthorized' }, auth.status || 401);

  const rate = applyRateLimit({
    namespace: 'admin-export',
    key: auth.actor.id || auth.actor.email || 'anonymous',
    limit: 3,
    windowMs: 15 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!rate.ok) {
    return rateLimitResponse({ ok: false, error: 'rate_limited', message: 'Aguarde antes de gerar outro backup.' }, rate);
  }

  const config = getSupabaseConfig(env);
  if (!config.url || !config.serviceRoleKey) {
    return json({ ok: false, error: 'supabase_not_configured' }, 503, rateLimitHeaders(rate));
  }

  try {
    const [deals, contatos, configuracoes, adminUsers] = await Promise.all([
      fetchTable(config, 'deals'),
      fetchTable(config, 'contatos'),
      fetchTable(config, 'configuracoes'),
      fetchTable(config, 'admin_users'),
    ]);

    const snapshot = {
      ok: true,
      generated_at: new Date().toISOString(),
      actor: auth.actor,
      tables: {
        deals,
        contatos,
        configuracoes,
        admin_users: adminUsers,
      },
    };

    await logAdminRequestEvent(env, request, {
      action: 'backup.export',
      status: 'ok',
      origin: 'admin-export',
      actorUserId: auth.actor.id,
      actorEmail: auth.actor.email,
      actorRole: auth.actor.role,
      details: {
        counts: {
          deals: deals.length,
          contatos: contatos.length,
          configuracoes: configuracoes.length,
          admin_users: adminUsers.length,
        },
      },
    });

    return new Response(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="hagav-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        ...rateLimitHeaders(rate),
      },
    });
  } catch (error) {
    await logAdminRequestEvent(env, request, {
      action: 'backup.export',
      status: 'error',
      origin: 'admin-export',
      actorUserId: auth.actor.id,
      actorEmail: auth.actor.email,
      actorRole: auth.actor.role,
      details: { error: error?.message || 'backup_failed' },
    });
    return json({ ok: false, error: error?.message || 'backup_failed' }, 502, rateLimitHeaders(rate));
  }
}

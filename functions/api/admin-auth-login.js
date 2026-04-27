import {
  buildPermissionMap,
  buildActorFromUser,
  getClientIp,
  issueAdminSessionCookie,
  json,
  loginWithSupabasePassword,
  stripDangerousText,
} from '../_utils/admin-auth.js';
import { logAdminRequestEvent } from '../_utils/admin-audit.js';
import { applyRateLimit, rateLimitHeaders, rateLimitResponse } from '../_utils/rate-limit.js';

function normalizeLoginError(reason) {
  const raw = String(reason || '').toLowerCase();
  if (raw.includes('invalid login') || raw.includes('invalid credentials') || raw.includes('email not confirmed')) {
    return 'E-mail ou senha incorretos.';
  }
  if (raw.includes('user_inactive')) {
    return 'Seu acesso ao painel esta desativado.';
  }
  if (raw.includes('admin_role_lookup_failed')) {
    return 'Seu usuario ainda nao foi liberado para o painel.';
  }
  return 'Nao foi possivel autenticar agora.';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = getClientIp(request) || 'anonymous';
  const rateState = applyRateLimit({
    namespace: 'admin-login',
    key: ip,
    limit: 5,
    windowMs: 10 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });

  if (!rateState.ok) {
    await logAdminRequestEvent(env, request, {
      action: 'auth.login.rate_limited',
      status: 'blocked',
      origin: 'admin-auth-login',
      details: { retry_after_seconds: rateState.retryAfterSeconds },
    });
    return rateLimitResponse({
      ok: false,
      error: 'rate_limited',
      message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    }, rateState);
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json', message: 'Corpo invalido.' }, 400, rateLimitHeaders(rateState));
  }

  const email = stripDangerousText(String(body?.email || ''), 180).toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) {
    return json({ ok: false, error: 'missing_credentials', message: 'Informe e-mail e senha.' }, 400, rateLimitHeaders(rateState));
  }

  const result = await loginWithSupabasePassword(env, email, password);
  if (!result.ok) {
    await logAdminRequestEvent(env, request, {
      action: 'auth.login.failed',
      status: 'error',
      origin: 'admin-auth-login',
      details: { email, reason: result.reason },
    });
    return json({
      ok: false,
      error: result.reason || 'login_failed',
      message: normalizeLoginError(result.reason),
    }, result.status || 401, rateLimitHeaders(rateState));
  }

  const actor = buildActorFromUser(result.user, result.actor.role);
  const sessionCookie = await issueAdminSessionCookie(env, actor);

  await logAdminRequestEvent(env, request, {
    action: 'auth.login.success',
    status: 'ok',
    origin: 'admin-auth-login',
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
  });

  return json({
    ok: true,
    user: result.user,
    actor,
    role: actor.role,
    permissions: buildPermissionMap(actor.role),
    session: result.session,
  }, 200, {
    ...rateLimitHeaders(rateState),
    'set-cookie': sessionCookie.cookie,
  });
}

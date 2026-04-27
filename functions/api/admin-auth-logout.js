import { authenticateRequest, clearAdminSessionCookie, json } from '../_utils/admin-auth.js';
import { logAdminRequestEvent } from '../_utils/admin-audit.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['viewer', 'operacao', 'comercial', 'admin'],
    allowBearer: true,
    allowCookie: true,
  });

  if (auth.ok) {
    await logAdminRequestEvent(env, request, {
      action: 'auth.logout',
      status: 'ok',
      origin: 'admin-auth-logout',
      actorUserId: auth.actor.id,
      actorEmail: auth.actor.email,
      actorRole: auth.actor.role,
    });
  }

  return json({ ok: true }, 200, {
    'set-cookie': clearAdminSessionCookie(env),
  });
}

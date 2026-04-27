import { authenticateRequest, buildPermissionMap, json } from '../_utils/admin-auth.js';

export async function onRequestGet(context) {
  const auth = await authenticateRequest(context.request, context.env, {
    requiredRoles: ['viewer', 'operacao', 'comercial', 'admin'],
    allowBearer: true,
    allowCookie: true,
  });

  if (!auth.ok) {
    return json({
      ok: false,
      authenticated: false,
      error: auth.reason || 'unauthenticated',
    }, auth.status || 401);
  }

  return json({
    ok: true,
    authenticated: true,
    actor: auth.actor,
    role: auth.actor.role,
    permissions: buildPermissionMap(auth.actor.role),
    auth_mode: auth.authMode,
  });
}

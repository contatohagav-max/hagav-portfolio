import {
  buildPermissionMap,
  parseRequestCookies,
  readAdminSessionFromRequest,
} from '../_utils/admin-auth.js';

const ALLOWED_PUBLIC_PATHS = [
  '/admin/login',
  '/admin/login/',
  '/admin/acesso-negado',
  '/admin/acesso-negado/',
];

function isStaticAsset(pathname) {
  return pathname.startsWith('/admin/_next/')
    || pathname.endsWith('.css')
    || pathname.endsWith('.js')
    || pathname.endsWith('.png')
    || pathname.endsWith('.jpg')
    || pathname.endsWith('.jpeg')
    || pathname.endsWith('.svg')
    || pathname.endsWith('.webp')
    || pathname.endsWith('.ico')
    || pathname.endsWith('.woff')
    || pathname.endsWith('.woff2')
    || pathname.endsWith('.ttf')
    || pathname.endsWith('.txt')
    || pathname.endsWith('.json')
    || pathname.endsWith('.webmanifest');
}

function redirect(url, destination) {
  return Response.redirect(new URL(destination, url), 302);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isStaticAsset(pathname)) return next();

  if (ALLOWED_PUBLIC_PATHS.includes(pathname)) {
    const session = await readAdminSessionFromRequest(request, env);
    if (session.ok && pathname.startsWith('/admin/login')) {
      const nextTarget = url.searchParams.get('next') || '/admin/';
      return redirect(url, nextTarget);
    }
    const response = await next();
    response.headers.set('cache-control', 'no-store');
    return response;
  }

  const session = await readAdminSessionFromRequest(request, env);
  if (!session.ok) {
    const nextPath = pathname + (url.search || '');
    return redirect(url, `/admin/login/?next=${encodeURIComponent(nextPath)}`);
  }

  const permissions = buildPermissionMap(session.actor.role);
  if (pathname.startsWith('/admin/configuracoes') && !permissions.manageSettings) {
    return redirect(url, '/admin/acesso-negado/');
  }

  const response = await next();
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-hagav-admin-role', session.actor.role);
  return response;
}

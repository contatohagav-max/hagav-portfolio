const ADMIN_ROLES = ['viewer', 'operacao', 'comercial', 'admin'];

const ROLE_PERMISSIONS = {
  viewer: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: false,
    manageOrcamentos: false,
    manageClientes: false,
    managePipeline: false,
    manageSettings: false,
    exportData: false,
    generateDocuments: false,
  },
  operacao: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: true,
    manageOrcamentos: true,
    manageClientes: true,
    managePipeline: true,
    manageSettings: false,
    exportData: false,
    generateDocuments: true,
  },
  comercial: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: true,
    manageOrcamentos: true,
    manageClientes: true,
    managePipeline: true,
    manageSettings: false,
    exportData: false,
    generateDocuments: true,
  },
  admin: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: true,
    manageOrcamentos: true,
    manageClientes: true,
    managePipeline: true,
    manageSettings: true,
    exportData: true,
    generateDocuments: true,
  },
};

const DEFAULT_SESSION_AGE = 60 * 60 * 12;
const SESSION_COOKIE_NAME = 'hagav_admin_session';
const COOKIE_LOGIN_NAME = 'hagav_admin_login_hint';
const textEncoder = new TextEncoder();

export function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = String(env?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

export function stripDangerousText(value, maxLen = 240) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function normalizeAdminRole(value, fallback = 'viewer') {
  const normalized = stripDangerousText(String(value || ''), 32)
    .toLowerCase()
    .replace(/[^a-z_]+/g, '');
  if (ADMIN_ROLES.includes(normalized)) return normalized;
  return fallback;
}

export function buildPermissionMap(role) {
  const safeRole = normalizeAdminRole(role, 'viewer');
  return { role: safeRole, ...(ROLE_PERMISSIONS[safeRole] || ROLE_PERMISSIONS.viewer) };
}

export function hasRequiredRole(role, allowedRoles = []) {
  if (!allowedRoles || (Array.isArray(allowedRoles) && allowedRoles.length === 0)) return true;
  const safeRole = normalizeAdminRole(role, 'viewer');
  const normalizedAllowed = Array.isArray(allowedRoles)
    ? allowedRoles.map((entry) => normalizeAdminRole(entry, 'viewer'))
    : [normalizeAdminRole(allowedRoles, 'viewer')];
  return normalizedAllowed.includes(safeRole);
}

export function getSupabaseConfig(env) {
  return {
    url: firstEnvValue(env, ['SUPABASE_URL', 'SUPABASE_PROJECT_URL', 'NEXT_PUBLIC_SUPABASE_URL']).replace(/\/+$/, ''),
    anonKey: firstEnvValue(env, ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLIC_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_KEY']),
    serviceRoleKey: firstEnvValue(env, ['SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']),
  };
}

export function getSessionCookieName(env) {
  return firstEnvValue(env, ['ADMIN_SESSION_COOKIE', 'HAGAV_ADMIN_SESSION_COOKIE']) || SESSION_COOKIE_NAME;
}

export function getSessionSecret(env) {
  return firstEnvValue(env, ['ADMIN_SESSION_SECRET', 'HAGAV_ADMIN_SESSION_SECRET']);
}

export function getSessionMaxAgeSeconds(env) {
  const parsed = Number(firstEnvValue(env, ['ADMIN_SESSION_MAX_AGE_SECONDS', 'HAGAV_ADMIN_SESSION_MAX_AGE_SECONDS']) || DEFAULT_SESSION_AGE);
  if (!Number.isFinite(parsed) || parsed < 900) return DEFAULT_SESSION_AGE;
  return Math.round(parsed);
}

export function getClientIp(request) {
  return stripDangerousText(
    String(
      request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || ''
    ).split(',')[0] || '',
    120
  );
}

export function getRequestUserAgent(request) {
  return stripDangerousText(String(request.headers.get('user-agent') || ''), 240);
}

export function parseRequestCookies(request) {
  const header = String(request.headers.get('cookie') || '');
  return header.split(';').reduce((acc, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return acc;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function createHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signValue(secret, value) {
  const key = await createHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function verifyValue(secret, value, signature) {
  if (!secret || !value || !signature) return false;
  const key = await createHmacKey(secret);
  return crypto.subtle.verify('HMAC', key, base64UrlDecode(signature), textEncoder.encode(value));
}

export function getRoleFromUser(user) {
  const appRole = user?.app_metadata?.hagav_role || user?.app_metadata?.role;
  const userRole = user?.user_metadata?.hagav_role || user?.user_metadata?.role;
  return normalizeAdminRole(appRole || userRole || '', '');
}

export function getDefaultRole(env) {
  return normalizeAdminRole(firstEnvValue(env, ['ADMIN_DEFAULT_ROLE', 'HAGAV_ADMIN_DEFAULT_ROLE']) || 'admin', 'admin');
}

export function buildActorFromUser(user, role) {
  const safeRole = normalizeAdminRole(role || getRoleFromUser(user) || 'viewer', 'viewer');
  return {
    id: String(user?.id || ''),
    email: stripDangerousText(String(user?.email || ''), 200),
    role: safeRole,
    permissions: buildPermissionMap(safeRole),
  };
}

export async function upsertAdminUser(config, user, env) {
  if (!config?.url || !config?.serviceRoleKey || !user?.id) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  const defaultRole = getDefaultRole(env);
  const response = await fetch(`${config.url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,email,role,active`, {
    method: 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json; charset=utf-8',
    },
  });

  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }

  const existing = Array.isArray(rows) ? rows[0] : null;
  if (existing?.active === false) {
    return { ok: false, reason: 'user_inactive', status: 403 };
  }

  const role = normalizeAdminRole(existing?.role || getRoleFromUser(user) || defaultRole, defaultRole);
  const body = {
    user_id: user.id,
    email: stripDangerousText(String(user.email || ''), 200),
    role,
    active: true,
    last_login_at: new Date().toISOString(),
  };

  const upsertResponse = await fetch(`${config.url}/rest/v1/admin_users`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json; charset=utf-8',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  });

  let payload = [];
  try {
    payload = await upsertResponse.json();
  } catch {
    payload = [];
  }

  if (!upsertResponse.ok) {
    return {
      ok: false,
      reason: String(payload?.message || payload?.error_description || `admin_user_upsert_${upsertResponse.status}`),
      status: upsertResponse.status || 500,
    };
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  if (row?.active === false) {
    return { ok: false, reason: 'user_inactive', status: 403 };
  }

  return {
    ok: true,
    role: normalizeAdminRole(row?.role || role, role),
    row,
  };
}

async function fetchAdminUser(config, userId) {
  if (!config?.url || !config?.serviceRoleKey || !userId) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  const response = await fetch(`${config.url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,role,active`, {
    method: 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json; charset=utf-8',
    },
  });

  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: String(rows?.message || rows?.error_description || `admin_user_lookup_${response.status}`),
      status: response.status || 500,
    };
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.user_id) {
    return { ok: false, reason: 'admin_user_not_found', status: 403 };
  }
  if (row.active === false) {
    return { ok: false, reason: 'user_inactive', status: 403 };
  }

  return { ok: true, row };
}

export async function issueAdminSessionCookie(env, actor, extras = {}) {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('admin_session_secret_missing');
  const maxAge = getSessionMaxAgeSeconds(env);
  const issuedAt = Date.now();
  const payload = {
    actor: {
      id: String(actor?.id || ''),
      email: stripDangerousText(String(actor?.email || ''), 200),
      role: normalizeAdminRole(actor?.role || 'viewer', 'viewer'),
    },
    issued_at: issuedAt,
    expires_at: issuedAt + (maxAge * 1000),
    ...extras,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signValue(secret, encodedPayload);
  const cookieValue = `${encodedPayload}.${signature}`;
  const parts = [
    `${getSessionCookieName(env)}=${cookieValue}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ];
  return {
    cookie: parts.join('; '),
    payload,
    value: cookieValue,
  };
}

export function clearAdminSessionCookie(env) {
  return `${getSessionCookieName(env)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export function buildLoginHintCookie() {
  return `${COOKIE_LOGIN_NAME}=1; Path=/; Max-Age=300; SameSite=Lax; Secure`;
}

export function clearLoginHintCookie() {
  return `${COOKIE_LOGIN_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export async function readAdminSessionFromRequest(request, env) {
  const cookies = parseRequestCookies(request);
  const secret = getSessionSecret(env);
  const rawCookie = String(cookies[getSessionCookieName(env)] || '').trim();
  if (!secret || !rawCookie || !rawCookie.includes('.')) return { ok: false, reason: 'missing_session_cookie' };

  const [encodedPayload, signature] = rawCookie.split('.', 2);
  const verified = await verifyValue(secret, encodedPayload, signature);
  if (!verified) return { ok: false, reason: 'invalid_session_signature' };

  let payload = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch {
    return { ok: false, reason: 'invalid_session_payload' };
  }

  const expiresAt = Number(payload?.expires_at || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, reason: 'session_expired' };
  }

  const role = normalizeAdminRole(payload?.actor?.role || 'viewer', 'viewer');
  const actor = {
    id: String(payload?.actor?.id || ''),
    email: stripDangerousText(String(payload?.actor?.email || ''), 200),
    role,
    permissions: buildPermissionMap(role),
  };

  return { ok: true, actor, payload };
}

export function getBearerToken(request) {
  const raw = String(request.headers.get('authorization') || '').trim();
  if (!raw || !/^bearer\s+/i.test(raw)) return '';
  return stripDangerousText(raw.replace(/^bearer\s+/i, ''), 240);
}

export async function fetchSupabaseUser(config, accessToken) {
  const token = stripDangerousText(String(accessToken || ''), 3000);
  if (!token || !config?.url) return { ok: false, reason: 'missing_bearer_token' };
  const apiKey = String(config.anonKey || config.serviceRoleKey || '').trim();
  if (!apiKey) return { ok: false, reason: 'supabase_anon_not_configured' };

  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`,
      },
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok || !parsed?.id) {
      return {
        ok: false,
        reason: String(parsed?.message || parsed?.error_description || `supabase_auth_${response.status}`),
        status: response.status || 401,
      };
    }
    return { ok: true, user: parsed };
  } catch (error) {
    return { ok: false, reason: error?.message || 'supabase_user_lookup_failed', status: 502 };
  }
}

export async function loginWithSupabasePassword(env, email, password) {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.anonKey) {
    return { ok: false, reason: 'supabase_auth_not_configured', status: 503 };
  }

  try {
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${config.anonKey}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        email: stripDangerousText(String(email || ''), 180),
        password: String(password || ''),
      }),
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || !parsed?.access_token || !parsed?.user?.id) {
      return {
        ok: false,
        reason: String(parsed?.error_description || parsed?.msg || parsed?.message || `auth_http_${response.status}`),
        status: response.status || 401,
      };
    }

    const roleUpsert = await upsertAdminUser(config, parsed.user, env);
    if (!roleUpsert.ok) {
      return {
        ok: false,
        reason: roleUpsert.reason || 'admin_role_lookup_failed',
        status: roleUpsert.status || 403,
      };
    }

    const actor = buildActorFromUser(parsed.user, roleUpsert.role);
    return {
      ok: true,
      config,
      actor,
      session: {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_in: parsed.expires_in,
        token_type: parsed.token_type,
      },
      user: parsed.user,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || 'auth_request_failed',
      status: 502,
    };
  }
}

export async function authenticateRequest(request, env, options = {}) {
  const { requiredRoles = [], allowBearer = true, allowCookie = true } = options;
  const config = getSupabaseConfig(env);

  if (allowCookie) {
    const session = await readAdminSessionFromRequest(request, env);
    if (session.ok) {
      const adminUser = await fetchAdminUser(config, session.actor.id);
      if (!adminUser.ok) {
        return { ok: false, reason: adminUser.reason || 'unauthenticated', status: adminUser.status || 401, authMode: 'cookie' };
      }
      const actor = {
        id: session.actor.id,
        email: stripDangerousText(String(adminUser.row?.email || session.actor.email || ''), 200),
        role: normalizeAdminRole(adminUser.row?.role || session.actor.role || 'viewer', 'viewer'),
        permissions: buildPermissionMap(adminUser.row?.role || session.actor.role || 'viewer'),
      };
      if (!hasRequiredRole(actor.role, requiredRoles)) {
        return { ok: false, reason: 'forbidden', status: 403, authMode: 'cookie' };
      }
      return { ok: true, actor, authMode: 'cookie' };
    }
  }

  if (allowBearer) {
    const bearer = getBearerToken(request);
    if (bearer) {
      const userLookup = await fetchSupabaseUser(config, bearer);
      if (!userLookup.ok) {
        return { ok: false, reason: userLookup.reason || 'invalid_bearer', status: userLookup.status || 401 };
      }
      const roleUpsert = await upsertAdminUser(config, userLookup.user, env);
      if (!roleUpsert.ok) {
        return { ok: false, reason: roleUpsert.reason || 'admin_role_lookup_failed', status: roleUpsert.status || 403 };
      }
      const actor = buildActorFromUser(userLookup.user, roleUpsert.role);
      if (!hasRequiredRole(actor.role, requiredRoles)) {
        return { ok: false, reason: 'forbidden', status: 403, authMode: 'bearer' };
      }
      return { ok: true, actor, authMode: 'bearer' };
    }
  }

  return { ok: false, reason: 'unauthenticated', status: 401 };
}

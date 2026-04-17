const SUPABASE_TIMEOUT_MS = 8000;
const PAGE_TO_ORIGIN = {
  home: "H - HOME",
  portfolio: "W - PORTFÓLIO"
};
const STATUS_DEFAULT = "novo";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function sanitize(value, maxLen) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLen);
}

function getSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRole = String(env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anon = String(env.SUPABASE_ANON_KEY || "").trim();
  const writeKey = serviceRole || anon;
  return { url, writeKey };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function saveWhatsappClick(env, payload) {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.writeKey) {
    return { ok: false, reason: "supabase_not_configured" };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort("timeout"), SUPABASE_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${config.url}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        apikey: config.writeKey,
        authorization: `Bearer ${config.writeKey}`,
        prefer: "return=minimal"
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      const parsed = await parseJsonSafe(response);
      return {
        ok: false,
        reason: String(parsed?.message || parsed?.error_description || `supabase_http_${response.status}`)
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "supabase_request_failed" };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const contentType = String(request.headers.get("content-type") || "");
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Invalid content type" }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON invalido" }, 400);
  }

  const pagina = sanitize(String(body?.pagina || ""), 40).toLowerCase();
  const origem = sanitize(String(body?.origem || ""), 80);
  if (!PAGE_TO_ORIGIN[pagina] || PAGE_TO_ORIGIN[pagina] !== origem) {
    return json({ ok: false, error: "Origem invalida" }, 400);
  }

  const observacoes = sanitize(
    `Clique no botão WhatsApp (${origem})`,
    300
  );

  const result = await saveWhatsappClick(env, {
    nome: "",
    whatsapp: "",
    fluxo: "WhatsApp",
    pagina,
    origem,
    status: STATUS_DEFAULT,
    observacoes
  });

  return json({ ok: result.ok, saved: result.ok, reason: result.reason || "" }, result.ok ? 200 : 502);
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}

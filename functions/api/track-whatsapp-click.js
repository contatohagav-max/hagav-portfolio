const SUPABASE_TIMEOUT_MS = 8000;
const PAGE_TO_ORIGIN = {
  home: "H - HOME",
  portfolio: "W - PORTFÓLIO"
};

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

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = String(env?.[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function getSupabaseConfig(env) {
  const url = firstEnvValue(env, [
    "SUPABASE_URL",
    "SUPABASE_PROJECT_URL"
  ]).replace(/\/+$/, "");
  const serviceRole = firstEnvValue(env, [
    "SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SERVICE_ROLE"
  ]);
  const anon = firstEnvValue(env, [
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLIC_ANON_KEY",
    "SUPABASE_KEY"
  ]);
  const writeKey = serviceRole || anon;
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!writeKey) missing.push("SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY");
  return { url, writeKey, missing };
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

async function postSupabaseRow(config, table, payload) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort("timeout"), SUPABASE_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(table)}`, {
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

async function saveWhatsappClick(env, payload) {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.writeKey || config.missing.length > 0) {
    return {
      ok: false,
      reason: `supabase_not_configured:${config.missing.join(", ")}`
    };
  }

  const contatoResult = await postSupabaseRow(config, "contatos", payload.contato);
  if (!contatoResult.ok) return contatoResult;
  const dealResult = await postSupabaseRow(config, "deals", payload.deal);
  if (!dealResult.ok) return dealResult;
  return { ok: true };
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
    contato: {
      nome: "",
      whatsapp: "",
      origem,
      mensagem: observacoes
    },
    deal: {
      fluxo: "WhatsApp",
      pagina,
      origem,
      status: "novo",
      nome: "",
      whatsapp: "",
      servico: "Clique no WhatsApp",
      quantidade: 1,
      material_gravado: null,
      tempo_bruto: "",
      prazo: "",
      referencia: null,
      observacoes,
      score_lead: 18,
      urgencia: "baixa",
      prioridade: "baixa",
      temperatura: "Frio",
      valor_estimado: 0,
      margem_estimada: 0,
      proxima_acao: "",
      responsavel: "",
      ultimo_contato_em: new Date().toISOString(),
      proximo_followup_em: null,
      resumo_orcamento: "WhatsApp | Evento de interesse sem formulario",
      resumo_comercial: `WhatsApp | Origem: ${origem} | Evento de interesse`
    }
  });

  return json({ ok: result.ok, saved: result.ok, reason: result.reason || "" }, result.ok ? 200 : 502);
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}


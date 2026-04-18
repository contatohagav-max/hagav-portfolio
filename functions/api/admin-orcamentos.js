const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function stripDangerousText(value, maxLen) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const withoutTags = normalized.replace(/<[^>]*>/g, "");
  return withoutTags.slice(0, maxLen);
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = String(env?.[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function getSupabaseConfig(env) {
  return {
    url: firstEnvValue(env, ["SUPABASE_URL", "SUPABASE_PROJECT_URL"]).replace(/\/+$/, ""),
    serviceRoleKey: firstEnvValue(env, ["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"])
  };
}

function getAdminKey(env) {
  return firstEnvValue(env, ["ADMIN_DASHBOARD_KEY", "ORCAMENTO_ADMIN_KEY", "HAGAV_ADMIN_KEY"]);
}

function isAuthorized(request, env) {
  const expected = getAdminKey(env);
  if (!expected) return { ok: false, reason: "admin_key_not_configured", status: 503 };
  const provided = stripDangerousText(
    String(request.headers.get("x-admin-key") || request.headers.get("authorization") || ""),
    200
  ).replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
    return { ok: false, reason: "unauthorized", status: 401 };
  }
  return { ok: true };
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

async function fetchSupabase(config, path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const parsed = await parseJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: String(parsed?.message || parsed?.error_description || `supabase_http_${response.status}`)
    };
  }
  return { ok: true, data: parsed };
}

async function listOrcamentos(request, env) {
  const auth = isAuthorized(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.reason }, auth.status);

  const config = getSupabaseConfig(env);
  if (!config.url || !config.serviceRoleKey) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.round(limitRaw)))
    : DEFAULT_LIMIT;
  const status = stripDangerousText(url.searchParams.get("status_orcamento") || "", 60);

  const query = new URLSearchParams();
  query.set(
    "select",
    "id,created_at,fluxo,pagina,origem,status,nome,whatsapp,servico,quantidade,material_gravado,tempo_bruto,prazo,referencia,observacoes,detalhes,resumo_orcamento,resumo_comercial,preco_base,preco_final,valor_estimado,margem_estimada,pacote_sugerido,status_orcamento,urgencia,prioridade,temperatura,score_lead,proxima_acao,ultimo_contato_em,observacoes_internas,link_pdf"
  );
  query.set("order", "created_at.desc");
  query.set("limit", String(limit));
  if (status) query.set("status_orcamento", `eq.${status}`);

  const result = await fetchSupabase(config, `/rest/v1/orcamentos?${query.toString()}`);
  if (!result.ok) return json({ ok: false, error: result.reason }, 502);

  return json({ ok: true, rows: Array.isArray(result.data) ? result.data : [] });
}

async function updateOrcamento(request, env) {
  const auth = isAuthorized(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.reason }, auth.status);

  const config = getSupabaseConfig(env);
  if (!config.url || !config.serviceRoleKey) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "json_invalido" }, 400);
  }

  const id = Number(body?.id || 0);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ ok: false, error: "id_invalido" }, 400);
  }

  const payload = {};

  if (body?.preco_final !== undefined) {
    const precoFinal = Number(body.preco_final);
    if (!Number.isFinite(precoFinal) || precoFinal < 0 || precoFinal > 100000000) {
      return json({ ok: false, error: "preco_final_invalido" }, 400);
    }
    payload.preco_final = Math.round(precoFinal * 100) / 100;
  }

  if (body?.pacote_sugerido !== undefined) {
    payload.pacote_sugerido = stripDangerousText(String(body.pacote_sugerido || ""), 120);
  }

  if (body?.status_orcamento !== undefined) {
    payload.status_orcamento = stripDangerousText(String(body.status_orcamento || ""), 60);
  }
  if (body?.urgencia !== undefined) {
    payload.urgencia = stripDangerousText(String(body.urgencia || ""), 20);
  }

  if (body?.prioridade !== undefined) {
    payload.prioridade = stripDangerousText(String(body.prioridade || ""), 20);
  }

  if (body?.proxima_acao !== undefined) {
    payload.proxima_acao = stripDangerousText(String(body.proxima_acao || ""), 300);
  }

  if (body?.margem_estimada !== undefined) {
    const margem = Number(body.margem_estimada);
    if (!Number.isFinite(margem) || margem < 0 || margem > 100) {
      return json({ ok: false, error: "margem_invalida" }, 400);
    }
    payload.margem_estimada = Math.round(margem * 100) / 100;
  }

  if (body?.observacoes_internas !== undefined) {
    payload.observacoes_internas = stripDangerousText(String(body.observacoes_internas || ""), 2000);
  }

  if (body?.link_pdf !== undefined) {
    payload.link_pdf = stripDangerousText(String(body.link_pdf || ""), 1000);
  }

  if (Object.keys(payload).length === 0) {
    return json({ ok: false, error: "nenhum_campo_para_atualizar" }, 400);
  }

  const result = await fetchSupabase(
    config,
    `/rest/v1/orcamentos?id=eq.${id}&select=id,preco_base,preco_final,valor_estimado,margem_estimada,pacote_sugerido,status_orcamento,urgencia,prioridade,proxima_acao,observacoes_internas,link_pdf`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: payload
    }
  );

  if (!result.ok) return json({ ok: false, error: result.reason }, 502);
  const row = Array.isArray(result.data) ? (result.data[0] || null) : null;
  return json({ ok: true, row });
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "GET") return listOrcamentos(context.request, context.env);
  if (method === "PATCH" || method === "POST") return updateOrcamento(context.request, context.env);
  return json({ ok: false, error: "method_not_allowed" }, 405);
}




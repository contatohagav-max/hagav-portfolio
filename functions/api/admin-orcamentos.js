const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const DEAL_TO_ORC_STATUS = {
  novo: 'orcamento',
  contatado: 'orcamento',
  qualificado: 'orcamento',
  descartado: 'perdido',
  orcamento: 'orcamento',
  proposta_enviada: 'enviado',
  ajustando: 'ajustando',
  aprovado: 'aprovado',
  fechado: 'fechado',
  perdido: 'arquivado',
};

const DEAL_TO_LEAD_STATUS = {
  novo: 'novo',
  contatado: 'contatado',
  qualificado: 'qualificado',
  descartado: 'descartado',
  orcamento: 'orcamento',
  proposta_enviada: 'proposta_enviada',
  ajustando: 'ajustando',
  aprovado: 'aprovado',
  fechado: 'fechado',
  perdido: 'perdido',
};

const ORC_TO_DEAL_STATUS = {
  pendente_revisao: 'orcamento',
  em_revisao: 'orcamento',
  orcamento: 'orcamento',
  enviado: 'proposta_enviada',
  proposta_enviada: 'proposta_enviada',
  ajustando: 'ajustando',
  aprovado: 'aprovado',
  fechado: 'fechado',
  arquivado: 'perdido',
  cancelado: 'perdido',
  perdido: 'perdido',
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

function stripDangerousText(value, maxLen) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const withoutTags = normalized.replace(/<[^>]*>/g, "");
  return withoutTags.slice(0, maxLen);
}

function normalizeStatusKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDealStatus(value, fallback = "orcamento") {
  const key = normalizeStatusKey(value);
  if (!key) return fallback;
  if (["novo", "contatado", "qualificado", "descartado", "orcamento", "proposta_enviada", "ajustando", "aprovado", "fechado", "perdido"].includes(key)) {
    return key;
  }
  return ORC_TO_DEAL_STATUS[key] || fallback;
}

function mapDealToOrcStatus(value) {
  const key = normalizeDealStatus(value, "orcamento");
  return DEAL_TO_ORC_STATUS[key] || "orcamento";
}

function mapDealToLegacyLeadStatus(value) {
  const key = normalizeDealStatus(value, "novo");
  return DEAL_TO_LEAD_STATUS[key] || "novo";
}

function mapOrcStatusToDeal(value) {
  const key = normalizeStatusKey(value);
  return ORC_TO_DEAL_STATUS[key] || normalizeDealStatus(key, "orcamento");
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

function formatBoolLike(value) {
  if (value === true) return "Sim";
  if (value === false) return "Nao";
  return String(value || "");
}

function mapDealRowToLegacy(row) {
  return {
    ...row,
    status: mapDealToLegacyLeadStatus(row?.status),
    status_deal: normalizeDealStatus(row?.status, "orcamento"),
    status_orcamento: mapDealToOrcStatus(row?.status),
    material_gravado: formatBoolLike(row?.material_gravado),
    referencia: formatBoolLike(row?.referencia),
    detalhes: typeof row?.detalhes === "string"
      ? row.detalhes
      : (row?.detalhes ? JSON.stringify(row.detalhes) : "")
  };
}

function sanitizeId(value) {
  const id = stripDangerousText(String(value || ""), 120);
  if (!id) return "";
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return "";
  return id;
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
  const statusOrc = stripDangerousText(url.searchParams.get("status_orcamento") || "", 60);

  const query = new URLSearchParams();
  query.set(
    "select",
    "id,created_at,updated_at,fluxo,pagina,origem,status,nome,whatsapp,servico,quantidade,material_gravado,tempo_bruto,prazo,referencia,observacoes,detalhes,resumo_orcamento,resumo_comercial,preco_base,preco_final,valor_estimado,valor_sugerido,margem_estimada,faixa_sugerida,motivo_calculo,revisao_manual,alerta_capacidade,operacao_especial,complexidade_nivel,multiplicador_complexidade,multiplicador_urgencia,desconto_volume_percent,ajuste_referencia_percent,ajuste_multicamera_percent,pacote_sugerido,urgencia,prioridade,temperatura,score_lead,proxima_acao,responsavel,ultimo_contato_em,proximo_followup_em,observacoes_internas,link_pdf"
  );
  query.set("order", "created_at.desc");
  query.set("limit", String(limit));

  if (statusOrc) {
    query.set("status", `eq.${mapOrcStatusToDeal(statusOrc)}`);
  } else {
    query.set("status", "in.(orcamento,proposta_enviada,ajustando,aprovado,perdido)");
  }

  const result = await fetchSupabase(config, `/rest/v1/deals?${query.toString()}`);
  if (!result.ok) return json({ ok: false, error: result.reason }, 502);

  const rows = Array.isArray(result.data) ? result.data.map(mapDealRowToLegacy) : [];
  return json({ ok: true, rows });
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

  const id = sanitizeId(body?.id);
  if (!id) {
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
    payload.status = mapOrcStatusToDeal(String(body.status_orcamento || ""));
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

  if (body?.responsavel !== undefined) {
    payload.responsavel = stripDangerousText(String(body.responsavel || ""), 120);
  }

  if (body?.proximo_followup_em !== undefined) {
    const followupRaw = String(body.proximo_followup_em || "").trim();
    payload.proximo_followup_em = followupRaw ? followupRaw : null;
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
    `/rest/v1/deals?id=eq.${encodeURIComponent(id)}&select=id,status,preco_base,preco_final,valor_estimado,valor_sugerido,margem_estimada,faixa_sugerida,motivo_calculo,revisao_manual,complexidade_nivel,multiplicador_complexidade,multiplicador_urgencia,desconto_volume_percent,ajuste_referencia_percent,ajuste_multicamera_percent,pacote_sugerido,urgencia,prioridade,proxima_acao,responsavel,proximo_followup_em,observacoes_internas,link_pdf`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: payload
    }
  );

  if (!result.ok) return json({ ok: false, error: result.reason }, 502);
  const row = Array.isArray(result.data) ? (result.data[0] || null) : null;
  return json({ ok: true, row: row ? mapDealRowToLegacy(row) : null });
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "GET") return listOrcamentos(context.request, context.env);
  if (method === "PATCH" || method === "POST") return updateOrcamento(context.request, context.env);
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

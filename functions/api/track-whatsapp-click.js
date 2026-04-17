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

function isMissingLeadsTable(reason) {
  const text = String(reason || "");
  return text.includes("public.leads") && (
    text.includes("Could not find the table") ||
    text.includes("does not exist")
  );
}

function extractMissingColumn(reason, table) {
  const text = String(reason || "");
  const normalizedTable = String(table || "").toLowerCase();
  const patterns = [
    /Could not find the '([^']+)' column of '([^']+)'/i,
    /column ["']?([a-zA-Z0-9_]+)["']? of relation ["']?([a-zA-Z0-9_.]+)["']? does not exist/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const column = String(match[1] || "").trim();
    const tableFromError = String(match[2] || "").trim().toLowerCase();
    const tableShort = tableFromError.split(".").pop();
    if (!column) continue;
    if (!normalizedTable || tableShort === normalizedTable || tableFromError === normalizedTable) {
      return column;
    }
  }
  return "";
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

async function postSupabaseRowWithColumnFallback(config, table, payload) {
  const body = { ...(payload || {}) };
  const adjustedColumns = [];
  const maxAttempts = Math.max(1, Object.keys(body).length + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await postSupabaseRow(config, table, body);
    if (result.ok) return { ok: true, adjustedColumns };
    const missingColumn = extractMissingColumn(result.reason, table);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(body, missingColumn)) {
      return result;
    }
    delete body[missingColumn];
    adjustedColumns.push(missingColumn);
  }

  return { ok: false, reason: "supabase_schema_mismatch" };
}

async function saveWhatsappClick(env, payload) {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.writeKey || config.missing.length > 0) {
    return {
      ok: false,
      reason: `supabase_not_configured:${config.missing.join(", ")}`
    };
  }

  const contatoResult = await postSupabaseRowWithColumnFallback(config, "contatos", payload.contato);
  if (!contatoResult.ok) return contatoResult;
  const leadResult = await postSupabaseRowWithColumnFallback(config, "leads", payload.lead);
  if (!leadResult.ok) {
    if (isMissingLeadsTable(leadResult.reason)) {
      return { ok: true, reason: "leads_table_missing" };
    }
    return leadResult;
  }
  const adjustedNotes = [];
  if (Array.isArray(contatoResult.adjustedColumns) && contatoResult.adjustedColumns.length > 0) {
    adjustedNotes.push(`contatos:${contatoResult.adjustedColumns.join("|")}`);
  }
  if (Array.isArray(leadResult.adjustedColumns) && leadResult.adjustedColumns.length > 0) {
    adjustedNotes.push(`leads:${leadResult.adjustedColumns.join("|")}`);
  }
  return adjustedNotes.length > 0
    ? { ok: true, reason: `supabase_columns_adjusted:${adjustedNotes.join(",")}` }
    : { ok: true };
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
    lead: {
      fluxo: "WhatsApp",
      pagina,
      origem,
      status: "novo",
      nome: "",
      whatsapp: "",
      observacoes
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

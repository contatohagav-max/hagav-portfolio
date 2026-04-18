const DDD_VALIDOS = new Set([
  "11","12","13","14","15","16","17","18","19",
  "21","22","24","27","28",
  "31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49",
  "51","53","54","55",
  "61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99"
]);

const LIMITS = {
  nome: 80,
  instagram: 80,
  empresa: 100,
  extras: 1000,
  referencia: 700,
  outro: 180,
  duration: 32,
  service: 80
};

const SUBMIT_COOLDOWN_MS = 8000;
const lastSubmitByIp = new Map();
const recentSubmissionIds = new Map();
const SUPABASE_TIMEOUT_MS = 12000;
const LEGACY_WEBHOOK_TIMEOUT_MS = 15000;
const LEGACY_WEBHOOK_RETRY_DELAY_MS = 400;
const SUBMISSION_ID_TTL_MS = 1000 * 60 * 30;
const STATUS_PADRAO = "novo";
const STATUS_ORCAMENTO_PADRAO = "pendente_revisao";

const SERVICE_BASE_PRICES = {
  DU: {
    "reels tiktok e shorts": 180,
    "corte estrategico": 150,
    "criativo para ads": 240,
    outro: 190
  },
  DR: {
    "conteudo para redes sociais": 150,
    "criativos para anuncios": 220,
    lancamentos: 260,
    "youtube recorrente": 280,
    outro: 210
  }
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

function hasDangerousScheme(value) {
  return /(javascript:|vbscript:|data:text\/html)/i.test(value);
}

function isSequential(value) {
  const arr = value.split("").map(Number);
  let up = true;
  let down = true;
  for (let i = 1; i < arr.length; i += 1) {
    if (arr[i] !== arr[i - 1] + 1) up = false;
    if (arr[i] !== arr[i - 1] - 1) down = false;
  }
  return up || down;
}

function validateWhatsapp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 11) {
    return { ok: false, error: "WhatsApp invalido" };
  }

  const ddd = digits.slice(0, 2);
  if (!DDD_VALIDOS.has(ddd)) {
    return { ok: false, error: "DDD invalido" };
  }

  if (/^(\d)\1+$/.test(digits) || digits === "12345678910" || isSequential(digits)) {
    return { ok: false, error: "WhatsApp invalido" };
  }

  if (digits.length === 11 && digits.charAt(2) !== "9") {
    return { ok: false, error: "Celular invalido" };
  }

  return { ok: true, value: digits };
}

function validateTipoPayload(body) {
  const tipo = body?.tipo;
  if (tipo !== "unica" && tipo !== "recorrente") {
    return { ok: false, error: "Tipo de formulario invalido" };
  }

  const answers = body?.answers;
  if (!answers || typeof answers !== "object") {
    return { ok: false, error: "Respostas ausentes" };
  }

  const nome = stripDangerousText(answers.nome, LIMITS.nome);
  if (!nome) return { ok: false, error: "Nome invalido" };

  const whatsapp = validateWhatsapp(answers.whatsapp);
  if (!whatsapp.ok) return whatsapp;

  const instagram = stripDangerousText(answers.instagram || "", LIMITS.instagram);
  const empresa = stripDangerousText(answers.empresa || "", LIMITS.empresa);
  const extras = stripDangerousText(answers.extras || "", LIMITS.extras);

  if (hasDangerousScheme(instagram) || hasDangerousScheme(extras) || hasDangerousScheme(empresa)) {
    return { ok: false, error: "Conteudo invalido" };
  }

  if (tipo === "unica") {
    const referencia = stripDangerousText(answers.unica_referencia || "", LIMITS.referencia);
    if (hasDangerousScheme(referencia)) return { ok: false, error: "Referencia invalida" };

    const servicos = answers.unica_servicos;
    if (!servicos || !Array.isArray(servicos.selected) || servicos.selected.length === 0) {
      return { ok: false, error: "Servicos invalidos" };
    }

    if (servicos.selected.includes("Outro")) {
      const outro = stripDangerousText(servicos.outro || "", LIMITS.outro);
      if (!outro) return { ok: false, error: "Outro invalido" };
    }

    const quantidades = answers.unica_quantidades;
    if (!quantidades || typeof quantidades !== "object") {
      return { ok: false, error: "Quantidades invalidas" };
    }

    for (const service of Object.keys(quantidades)) {
      const safeService = stripDangerousText(service, LIMITS.service);
      if (!safeService) return { ok: false, error: "Servico invalido" };
      const qty = Number(quantidades[service]);
      if (!Number.isInteger(qty) || qty < 1 || qty > 10000) {
        return { ok: false, error: "Quantidade invalida" };
      }
    }

    if (!answers.unica_prazo) {
      return { ok: false, error: "Prazo invalido" };
    }

    const tempos = answers.unica_tempo_bruto || {};
    if (tempos && typeof tempos === "object") {
      for (const key of Object.keys(tempos)) {
        const val = stripDangerousText(String(tempos[key] || ""), LIMITS.duration);
        if (!val) return { ok: false, error: "Tempo bruto invalido" };
      }
    }
  }

  if (tipo === "recorrente") {
    const newFlowOps = answers?.rec_operacoes;
    if (newFlowOps && typeof newFlowOps === "object") {
      const selected = Array.isArray(newFlowOps.selected) ? newFlowOps.selected : [];
      if (selected.length === 0) return { ok: false, error: "Campo recorrente invalido" };
      const outroValue = stripDangerousText(newFlowOps.outro || "", LIMITS.outro);
      if (selected.includes("Outro")) {
        if (!outroValue) return { ok: false, error: "Campo recorrente invalido" };
      }
      const normalizedOps = selected.map((operation) => {
        const safeOp = stripDangerousText(String(operation || ""), LIMITS.service);
        if (safeOp !== "Outro") return safeOp;
        return outroValue ? `Outro: ${outroValue}` : "Outro";
      }).filter(Boolean);
      const quantidades = answers?.rec_quantidades;
      if (!quantidades || typeof quantidades !== "object") {
        return { ok: false, error: "Campo recorrente invalido" };
      }
      for (const operation of normalizedOps) {
        const qty = Number(getMapValueByKey(quantidades, operation));
        if (!Number.isInteger(qty) || qty < 1 || qty > 10000) {
          return { ok: false, error: "Campo recorrente invalido" };
        }
      }
      const gravado = answers?.rec_gravado_por_tipo;
      if (!gravado || typeof gravado !== "object") {
        return { ok: false, error: "Campo recorrente invalido" };
      }
      const tempoBruto = answers?.rec_tempo_bruto_por_tipo || {};
      for (const operation of normalizedOps) {
        const stateValue = stripDangerousText(String(getMapValueByKey(gravado, operation) || ""), 8);
        if (stateValue !== "Sim" && stateValue !== "Não") {
          return { ok: false, error: "Campo recorrente invalido" };
        }
        if (stateValue === "Sim") {
          const tempo = stripDangerousText(String(getMapValueByKey(tempoBruto, operation) || ""), LIMITS.duration);
          if (!tempo) return { ok: false, error: "Campo recorrente invalido" };
        }
      }
      const prazo = stripDangerousText(answers.rec_inicio || "", 120);
      if (!prazo || hasDangerousScheme(prazo)) {
        return { ok: false, error: "Campo recorrente invalido" };
      }
    } else {
      const required = ["rec_tipo_operacao", "rec_volume", "rec_objetivo", "rec_gravado", "rec_inicio"];
      for (const field of required) {
        const v = stripDangerousText(answers[field] || "", 120);
        if (!v) return { ok: false, error: "Campo recorrente invalido" };
        if (hasDangerousScheme(v)) return { ok: false, error: "Campo recorrente invalido" };
      }
      const recTempoBruto = stripDangerousText(answers.rec_tempo_bruto || "", LIMITS.duration);
      const recReferencia = stripDangerousText(answers.rec_referencia || "", LIMITS.referencia);
      if (hasDangerousScheme(recTempoBruto) || hasDangerousScheme(recReferencia)) {
        return { ok: false, error: "Campo recorrente invalido" };
      }
    }
  }

  return {
    ok: true,
    sanitized: {
      tipo,
      nome,
      whatsapp: whatsapp.value,
      instagram,
      empresa,
      extras
    }
  };
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
  const serviceRoleKey = firstEnvValue(env, [
    "SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SERVICE_ROLE"
  ]);
  const anonKey = firstEnvValue(env, [
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLIC_ANON_KEY",
    "SUPABASE_KEY"
  ]);
  const writeKey = serviceRoleKey || anonKey;
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!writeKey) missing.push("SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY");
  return {
    url,
    writeKey,
    keyType: serviceRoleKey ? "service" : (anonKey ? "anon" : ""),
    missing
  };
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

function buildOrcamentoDetalhesSerializado(lead, pricing) {
  const row = lead?.row || {};
  const rawAnswers = lead?.raw?.answers || {};
  const payload = {
    fluxo: row.Fluxo || "",
    pagina: row.Pagina || "",
    origem: row.Origem || "",
    status: row.Status || STATUS_PADRAO,
    nome: row.Nome || "",
    whatsapp: row.WhatsApp || "",
    servicoOuOperacao: row.ServicoOuOperacao || "",
    quantidade: row.Quantidade || "",
    materialGravado: row.MaterialGravado || "",
    tempoBruto: row.TempoBruto || "",
    prazo: row.Prazo || "",
    referencia: row.Referencia || "",
    observacoes: row.Observacoes || "",
    calculoAutomatico: {
      precoBase: Number(pricing?.precoBase || 0),
      precoFinal: Number(pricing?.precoFinal || 0),
      pacoteSugerido: pricing?.pacoteSugerido || "",
      statusOrcamento: pricing?.statusOrcamento || STATUS_ORCAMENTO_PADRAO
    },
    respostasCompletas: rawAnswers
  };
  return stripDangerousText(JSON.stringify(payload), 12000);
}

function normalizeServicoCurto(value) {
  return splitPipeValues(value).join(", ");
}

function formatQuantidadeResumo(flow, quantidadeRaw) {
  const quantidade = stripDangerousText(String(quantidadeRaw || ""), 240);
  if (!quantidade) return "-";
  if (quantidade.includes("|")) return quantidade;
  const qtdNum = parsePositiveNumber(quantidade);
  if (!qtdNum) return quantidade;
  return flow === "DR" ? `${qtdNum} por mes` : `${qtdNum} videos`;
}

function summarizeMaterial(raw) {
  const text = stripDangerousText(String(raw || ""), 240);
  if (!text) return "-";
  const lower = text.toLowerCase();
  const hasSim = lower.includes("sim");
  const hasNao = lower.includes("nao") || lower.includes("não");
  if (hasSim && !hasNao) return "sim";
  if (!hasSim && hasNao) return "nao";
  return text;
}

function summarizeTempo(raw) {
  const text = stripDangerousText(String(raw || ""), 240);
  if (!text) return "-";
  const parts = splitPipeValues(text);
  if (parts.length === 1 && parts[0].includes(":")) {
    const idx = parts[0].lastIndexOf(":");
    return stripDangerousText(parts[0].slice(idx + 1), 60) || text;
  }
  return text;
}

function buildResumoOrcamento(row) {
  const fluxo = stripDangerousText(String(row?.Fluxo || ""), 12) || "-";
  const servico = stripDangerousText(normalizeServicoCurto(row?.ServicoOuOperacao), 300) || "-";
  const quantidade = formatQuantidadeResumo(fluxo, row?.Quantidade);
  const materialGravado = summarizeMaterial(row?.MaterialGravado);
  const tempoBruto = summarizeTempo(row?.TempoBruto);
  const prazo = stripDangerousText(String(row?.Prazo || ""), 120) || "-";
  const referencia = stripDangerousText(String(row?.Referencia || ""), LIMITS.referencia);
  const observacoes = stripDangerousText(String(row?.Observacoes || ""), 300);
  const parts = [
    fluxo,
    `Servico: ${servico}`,
    `Quantidade: ${quantidade}`,
    `Material gravado: ${materialGravado}`,
    `Tempo bruto: ${tempoBruto}`,
    `Prazo: ${prazo}`
  ];
  if (referencia) parts.push(`Referencia: ${referencia}`);
  if (observacoes) parts.push(`Observacoes: ${observacoes}`);
  return stripDangerousText(parts.join(" | "), 2000);
}

async function saveLeadToSupabase(env, lead) {
  const config = getSupabaseConfig(env);
  if (!config.url || !config.writeKey || config.missing.length > 0) {
    return {
      ok: false,
      reason: `supabase_not_configured:${config.missing.join(", ")}`
    };
  }

  const row = lead?.row || {};
  const pricing = calculateOrcamentoPricing(row);
  const orcamentoInsert = {
    fluxo: row.Fluxo || "",
    pagina: row.Pagina || "orcamento",
    origem: row.Origem || "hagav.com.br",
    status: row.Status || STATUS_PADRAO,
    nome: row.Nome || "",
    whatsapp: row.WhatsApp || "",
    servico: stripDangerousText(normalizeServicoCurto(row.ServicoOuOperacao || ""), 300),
    quantidade: row.Quantidade || "",
    material_gravado: row.MaterialGravado || "",
    tempo_bruto: row.TempoBruto || "",
    prazo: row.Prazo || "",
    referencia: row.Referencia || "",
    observacoes: row.Observacoes || "",
    detalhes: buildOrcamentoDetalhesSerializado(lead, pricing),
    resumo_orcamento: buildResumoOrcamento(row),
    preco_base: Number(pricing.precoBase || 0),
    preco_final: Number(pricing.precoFinal || 0),
    pacote_sugerido: stripDangerousText(pricing.pacoteSugerido || "", 120),
    status_orcamento: stripDangerousText(pricing.statusOrcamento || STATUS_ORCAMENTO_PADRAO, 60),
    observacoes_internas: stripDangerousText(pricing.observacoesInternas || "", 500),
    link_pdf: stripDangerousText(pricing.linkPdf || "", 500)
  };

  const orcamentoResult = await postSupabaseRowWithColumnFallback(config, "orcamentos", orcamentoInsert);
  if (!orcamentoResult.ok) return orcamentoResult;
  const leadInsert = {
    fluxo: row.Fluxo || "",
    pagina: row.Pagina || "orcamento",
    origem: row.Origem || "hagav.com.br",
    status: row.Status || STATUS_PADRAO,
    nome: row.Nome || "",
    whatsapp: row.WhatsApp || "",
    observacoes: row.Observacoes || ""
  };
  const leadResult = await postSupabaseRowWithColumnFallback(config, "leads", leadInsert);
  if (!leadResult.ok) {
    if (isMissingLeadsTable(leadResult.reason)) {
      return { ok: true, reason: "leads_table_missing" };
    }
    return leadResult;
  }

  const adjustedNotes = [];
  if (Array.isArray(orcamentoResult.adjustedColumns) && orcamentoResult.adjustedColumns.length > 0) {
    adjustedNotes.push(`orcamentos:${orcamentoResult.adjustedColumns.join("|")}`);
  }
  if (Array.isArray(leadResult.adjustedColumns) && leadResult.adjustedColumns.length > 0) {
    adjustedNotes.push(`leads:${leadResult.adjustedColumns.join("|")}`);
  }
  return adjustedNotes.length > 0
    ? { ok: true, reason: `supabase_columns_adjusted:${adjustedNotes.join(",")}` }
    : { ok: true };
}

function getLegacyWebhookConfigByTipo(env, tipo) {
  const isUnica = tipo === "unica";
  const webhookUrl = String(
    isUnica
      ? (env.GOOGLE_SHEETS_WEBHOOK_URL_DU || "")
      : (env.GOOGLE_SHEETS_WEBHOOK_URL_DR || "")
  ).trim();
  const secret = String(env.GOOGLE_SHEETS_WEBHOOK_SECRET || "").trim();
  return { webhookUrl, secret };
}

async function saveLeadToLegacyWebhook(env, lead) {
  const { webhookUrl, secret } = getLegacyWebhookConfigByTipo(env, lead?.raw?.tipo);
  if (!webhookUrl) {
    return { ok: false, reason: "legacy_not_configured" };
  }

  const row = lead?.row || {};
  const rawAnswers = lead?.raw?.answers || {};
  const answersForWebhook = { ...rawAnswers };
  if (lead?.raw?.tipo === "unica") {
    answersForWebhook.unica_servicos = row.ServicoOuOperacao || "";
    answersForWebhook.unica_quantidades = row.Quantidade || "";
    answersForWebhook.unica_gravado = row.MaterialGravado || "";
    answersForWebhook.unica_tempo_bruto = row.TempoBruto || "";
  } else if (lead?.raw?.tipo === "recorrente") {
    answersForWebhook.rec_tipo_operacao = row.ServicoOuOperacao || "";
    answersForWebhook.rec_volume = row.Quantidade || "";
    answersForWebhook.rec_gravado = row.MaterialGravado || "";
    answersForWebhook.rec_tempo_bruto = row.TempoBruto || "";
    answersForWebhook.rec_inicio = row.Prazo || "";
    answersForWebhook.rec_referencia = row.Referencia || "";
    answersForWebhook.rec_objetivo = row.Objetivo || "";
  }
  const valuesByHeader = {
    DataHora: row.DataHora || "",
    TipoFluxo: row.TipoFluxo || "",
    Nome: row.Nome || "",
    WhatsApp: row.WhatsApp || "",
    Instagram: row.Instagram || "",
    Empresa: row.Empresa || "",
    ServicoOuOperacao: row.ServicoOuOperacao || "",
    Quantidade: row.Quantidade || "",
    MaterialGravado: row.MaterialGravado || "",
    TempoBruto: row.TempoBruto || "",
    Prazo: row.Prazo || "",
    Referencia: row.Referencia || "",
    Objetivo: row.Objetivo || "",
    Observacoes: row.Observacoes || "",
    Origem: row.Origem || ""
  };
  const webhookBody = {
    ...row,
    rowData: row,
    valuesByHeader,
    answers: answersForWebhook,
    rawAnswers,
    tipo: lead?.raw?.tipo || "",
    nome: row.Nome || "",
    whatsapp: row.WhatsApp || "",
    instagram: row.Instagram || "",
    empresa: row.Empresa || "",
    servicoOuOperacao: row.ServicoOuOperacao || "",
    servico: row.ServicoOuOperacao || "",
    quantidade: row.Quantidade || "",
    materialGravado: row.MaterialGravado || "",
    tempoBruto: row.TempoBruto || "",
    prazo: row.Prazo || "",
    referencia: row.Referencia || "",
    objetivo: row.Objetivo || "",
    observacoes: row.Observacoes || "",
    origem: row.Origem || "",
    values: [
      row.DataHora || "",
      row.TipoFluxo || "",
      row.Nome || "",
      row.WhatsApp || "",
      row.Instagram || "",
      row.Empresa || "",
      row.ServicoOuOperacao || "",
      row.Quantidade || "",
      row.MaterialGravado || "",
      row.TempoBruto || "",
      row.Prazo || "",
      row.Referencia || "",
      row.Objetivo || "",
      row.Observacoes || "",
      row.Origem || ""
    ],
    secret: secret || "",
    auth: { secret: secret || "" }
  };

  async function runWebhookPost() {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort("timeout"), LEGACY_WEBHOOK_TIMEOUT_MS)
      : null;
    try {
      const headers = { "content-type": "application/json; charset=utf-8" };
      if (secret) headers["x-webhook-secret"] = secret;
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(webhookBody),
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) {
        return { ok: false, reason: `legacy_http_${response.status}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "legacy_request_failed" };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const firstTry = await runWebhookPost();
  if (firstTry.ok) return firstTry;
  await new Promise((resolve) => setTimeout(resolve, LEGACY_WEBHOOK_RETRY_DELAY_MS));
  const secondTry = await runWebhookPost();
  return secondTry.ok ? secondTry : firstTry;
}

async function saveLead(env, lead) {
  const supabaseResult = await saveLeadToSupabase(env, lead);
  if (supabaseResult.ok) return supabaseResult;

  const legacyResult = await saveLeadToLegacyWebhook(env, lead);
  if (legacyResult.ok) return { ok: true, reason: "legacy_fallback_used" };

  if (supabaseResult.reason) return supabaseResult;
  return legacyResult;
}

function toFlatMap(value, keyLimit, valLimit) {
  if (!value || typeof value !== "object") return "";
  const entries = [];
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = stripDangerousText(String(rawKey || ""), keyLimit);
    const val = stripDangerousText(String(rawVal || ""), valLimit);
    if (!key) continue;
    entries.push(`${key}: ${val || "-"}`);
  }
  return entries.join(" | ");
}

function getMapValueByKey(value, targetKey, keyLimit = LIMITS.service) {
  if (!value || typeof value !== "object") return undefined;
  const safeTarget = stripDangerousText(String(targetKey || ""), keyLimit);
  if (!safeTarget) return undefined;
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const safeKey = stripDangerousText(String(rawKey || ""), keyLimit);
    if (safeKey === safeTarget) return rawVal;
  }
  return undefined;
}

function composeWithOutro(baseValue, outroValue, limit = 180) {
  const base = stripDangerousText(String(baseValue || ""), limit);
  const outro = stripDangerousText(String(outroValue || ""), LIMITS.outro);
  if (base !== "Outro") return base;
  return outro ? `Outro: ${outro}` : "Outro";
}

function splitPipeValues(value) {
  return String(value || "")
    .split("|")
    .map((part) => stripDangerousText(String(part || ""), 240))
    .filter(Boolean);
}

function normalizeServiceKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePositiveNumber(raw) {
  const match = String(raw || "").match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return 0;
  const num = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function parseHours(raw) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return 0;
  const hhmm = text.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    return hours + (minutes / 60);
  }
  const value = parsePositiveNumber(text);
  if (!value) return 0;
  if (text.includes("min")) return value / 60;
  if (text.includes("hora") || text.includes("h")) return value;
  if (value > 20) return value / 60;
  return value;
}

function parseLabeledMap(value, keyLimit = 120, valLimit = 120) {
  const map = {};
  for (const entry of splitPipeValues(value)) {
    const idx = entry.lastIndexOf(":");
    if (idx === -1) continue;
    const key = stripDangerousText(entry.slice(0, idx), keyLimit);
    const val = stripDangerousText(entry.slice(idx + 1), valLimit);
    if (!key) continue;
    map[normalizeServiceKey(key)] = val || "-";
  }
  return map;
}

function getMaterialMultiplier(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return 1;
  if (text.includes("nao") || text.includes("não")) return 1.35;
  return 1;
}

function getDeadlineMultiplier(rawPrazo) {
  const prazo = String(rawPrazo || "").toLowerCase();
  if (!prazo) return 1;
  if (prazo.includes("24h") || prazo.includes("imediato")) return 1.3;
  if (prazo.includes("3 dia")) return 1.18;
  if (prazo.includes("essa semana")) return 1.1;
  return 1;
}

function getUnitPrice(flow, service) {
  const table = SERVICE_BASE_PRICES[flow] || SERVICE_BASE_PRICES.DU;
  const normalized = normalizeServiceKey(service);
  if (table[normalized]) return table[normalized];
  if (normalized.startsWith("outro")) return table.outro || 190;
  return flow === "DR" ? 170 : 190;
}

function getRecurringVolumeMultiplier(totalQty) {
  if (!Number.isFinite(totalQty) || totalQty <= 0) return 1;
  if (totalQty >= 40) return 0.88;
  if (totalQty >= 20) return 0.92;
  if (totalQty >= 10) return 0.95;
  return 1;
}

function suggestPackage(flow, totalQty, precoBase) {
  if (flow === "DR") {
    if (totalQty >= 40 || precoBase >= 8000) return "Pacote Escala";
    if (totalQty >= 20 || precoBase >= 4500) return "Pacote Crescimento";
    return "Pacote Essencial";
  }
  if (totalQty >= 20 || precoBase >= 5000) return "Lote Intensivo";
  if (totalQty >= 8 || precoBase >= 2200) return "Projeto Plus";
  return "Projeto Pontual";
}

function roundCurrency(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function calculateOrcamentoPricing(row) {
  const flow = row?.Fluxo === "DR" ? "DR" : "DU";
  const services = splitPipeValues(row?.ServicoOuOperacao);
  const qtyParts = splitPipeValues(row?.Quantidade);
  const materialMap = parseLabeledMap(row?.MaterialGravado, 180, 40);
  const tempoMap = parseLabeledMap(row?.TempoBruto, 180, 40);

  let subtotal = 0;
  let totalQty = 0;

  for (let idx = 0; idx < services.length; idx += 1) {
    const service = services[idx];
    const qtyRaw = qtyParts[idx] || "";
    const qty = Math.max(1, Math.round(parsePositiveNumber(qtyRaw) || 1));
    const key = normalizeServiceKey(service);
    const material = materialMap[key] || "";
    const tempoRaw = tempoMap[key] || "";
    const tempoHours = parseHours(tempoRaw);

    let itemTotal = qty * getUnitPrice(flow, service);
    itemTotal *= getMaterialMultiplier(material);

    if (tempoHours > 2) {
      const extraHours = tempoHours - 2;
      itemTotal *= (1 + Math.min(0.35, extraHours * 0.08));
    }

    subtotal += itemTotal;
    totalQty += qty;
  }

  if (!subtotal) {
    const fallbackQty = Math.max(1, Math.round(parsePositiveNumber(row?.Quantidade) || 1));
    subtotal = fallbackQty * (flow === "DR" ? 170 : 190);
    totalQty = fallbackQty;
  }

  const prazoMultiplier = getDeadlineMultiplier(row?.Prazo);
  const volumeMultiplier = flow === "DR" ? getRecurringVolumeMultiplier(totalQty) : 1;
  const precoBase = Math.max(150, roundCurrency(subtotal * prazoMultiplier * volumeMultiplier));
  const precoFinal = precoBase;

  return {
    precoBase,
    precoFinal,
    pacoteSugerido: suggestPackage(flow, totalQty, precoBase),
    statusOrcamento: STATUS_ORCAMENTO_PADRAO,
    observacoesInternas: "",
    linkPdf: ""
  };
}

function buildLeadRow(body, request, ip, nowIso) {
  const answers = body?.answers || {};
  const fluxo = body?.tipo === "unica" ? "DU" : "DR";
  const tipo = body?.tipo === "unica" ? "Demanda Única" : "Demanda Recorrente";
  const origem = "hagav.com.br";

  let servicoOuOperacao = "";
  let quantidade = "";
  let materialGravado = "";
  let tempoBruto = "";
  let prazo = "";
  let referencia = "";
  let objetivo = "";

  if (body?.tipo === "unica") {
    const selected = Array.isArray(answers?.unica_servicos?.selected)
      ? answers.unica_servicos.selected
      : [];
    const outro = stripDangerousText(String(answers?.unica_servicos?.outro || ""), LIMITS.outro);
    const services = selected.map((item) => {
      const safe = stripDangerousText(String(item || ""), LIMITS.service);
      if (safe !== "Outro") return safe;
      return outro ? `Outro: ${outro}` : "Outro";
    }).filter(Boolean);

    servicoOuOperacao = services.join(" | ");
    const qtyMap = answers?.unica_quantidades && typeof answers.unica_quantidades === "object"
      ? answers.unica_quantidades
      : {};
    const qtyByService = services.map((service) => {
      const qtyRaw = getMapValueByKey(qtyMap, service);
      const qtyValue = stripDangerousText(String(qtyRaw ?? ""), 16);
      return qtyValue || "-";
    });
    quantidade = qtyByService.join(" | ");
    materialGravado = toFlatMap(answers?.unica_gravado, LIMITS.service, 16);
    tempoBruto = toFlatMap(answers?.unica_tempo_bruto, LIMITS.service, LIMITS.duration);
    prazo = stripDangerousText(String(answers?.unica_prazo || ""), 60);
    referencia = stripDangerousText(String(answers?.unica_referencia || ""), LIMITS.referencia);
  } else {
    const recOpsRaw = answers?.rec_operacoes;
    if (recOpsRaw && typeof recOpsRaw === "object") {
      const selected = Array.isArray(recOpsRaw.selected) ? recOpsRaw.selected : [];
      const outro = stripDangerousText(String(recOpsRaw.outro || ""), LIMITS.outro);
      const operations = selected.map((item) => {
        const safe = stripDangerousText(String(item || ""), LIMITS.service);
        if (safe !== "Outro") return safe;
        return outro ? `Outro: ${outro}` : "Outro";
      }).filter(Boolean);
      servicoOuOperacao = operations.join(" | ");
      const qtyMap = answers?.rec_quantidades && typeof answers.rec_quantidades === "object"
        ? answers.rec_quantidades
        : {};
      const qtyByOperation = operations.map((operation) => {
        const qtyRaw = getMapValueByKey(qtyMap, operation);
        const qtyValue = stripDangerousText(String(qtyRaw ?? ""), 16);
        return qtyValue || "-";
      });
      quantidade = qtyByOperation.join(" | ");
      materialGravado = toFlatMap(answers?.rec_gravado_por_tipo, LIMITS.service, 16);
      tempoBruto = toFlatMap(answers?.rec_tempo_bruto_por_tipo, LIMITS.service, LIMITS.duration);
      prazo = stripDangerousText(String(answers?.rec_inicio || ""), 60);
      referencia = stripDangerousText(String(answers?.rec_referencia || ""), LIMITS.referencia);
      objetivo = stripDangerousText(String(answers?.rec_objetivo || ""), 120);
    } else {
      servicoOuOperacao = composeWithOutro(
        answers?.rec_tipo_operacao,
        answers?.rec_tipo_operacao_outro,
        120
      );
      quantidade = stripDangerousText(String(answers?.rec_volume || ""), 60);
      materialGravado = stripDangerousText(String(answers?.rec_gravado || ""), 40);
      tempoBruto = stripDangerousText(String(answers?.rec_tempo_bruto || ""), LIMITS.duration);
      prazo = stripDangerousText(String(answers?.rec_inicio || ""), 60);
      referencia = stripDangerousText(String(answers?.rec_referencia || ""), LIMITS.referencia);
      objetivo = composeWithOutro(
        answers?.rec_objetivo,
        answers?.rec_objetivo_outro,
        120
      );
    }
  }

  return {
    DataHora: nowIso,
    Fluxo: fluxo,
    TipoFluxo: tipo,
    Pagina: "orcamento",
    Nome: stripDangerousText(String(answers?.nome || ""), LIMITS.nome),
    WhatsApp: stripDangerousText(String(answers?.whatsapp || ""), 16),
    Instagram: stripDangerousText(String(answers?.instagram || ""), LIMITS.instagram),
    Empresa: stripDangerousText(String(answers?.empresa || ""), LIMITS.empresa),
    ServicoOuOperacao: stripDangerousText(servicoOuOperacao, 600),
    Quantidade: stripDangerousText(quantidade, 600),
    MaterialGravado: stripDangerousText(materialGravado, 600),
    TempoBruto: stripDangerousText(tempoBruto, 600),
    Prazo: stripDangerousText(prazo, 120),
    Referencia: stripDangerousText(referencia, LIMITS.referencia),
    Objetivo: stripDangerousText(objetivo, 300),
    Observacoes: stripDangerousText(String(answers?.extras || ""), LIMITS.extras),
    Origem: stripDangerousText(origem, 180),
    Status: STATUS_PADRAO,
    Ip: stripDangerousText(ip, 64)
  };
}

export async function onRequestPost(context) {
  const { request } = context;

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Invalid content type" }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON invalido" }, 400);
  }

  const honeypot = stripDangerousText(body?.honeypot || "", 120);
  if (honeypot) {
    return json({ ok: false, error: "Spam detectado" }, 403);
  }

  const elapsedMs = Number(body?.meta?.elapsedMs || 0);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 3500) {
    return json({ ok: false, error: "Envio muito rapido" }, 429);
  }
  const submissionId = stripDangerousText(String(body?.meta?.submissionId || ""), 90);
  if (submissionId) {
    const nowCheck = Date.now();
    const lockedSubmissionUntil = Number(recentSubmissionIds.get(submissionId) || 0);
    if (lockedSubmissionUntil > nowCheck) {
      return json({ ok: true, saved: true, duplicate: true, saveReason: "" });
    }
  }

  const ip = String(request.headers.get("CF-Connecting-IP") || "unknown");
  const now = Date.now();
  const lockedUntil = Number(lastSubmitByIp.get(ip) || 0);
  if (now < lockedUntil) {
    return json({ ok: false, error: "Cooldown ativo" }, 429);
  }

  const payloadValidation = validateTipoPayload(body);
  if (!payloadValidation.ok) {
    return json({ ok: false, error: payloadValidation.error }, 400);
  }

  const nowIso = new Date(now).toISOString();
  const leadPayload = {
    row: buildLeadRow(body, request, ip, nowIso),
    raw: {
      tipo: body.tipo,
      answers: body.answers || {},
      meta: {
        elapsedMs,
        ip,
        userAgent: String(request.headers.get("user-agent") || ""),
        host: String(request.headers.get("host") || "")
      }
    },
    destination: {
      spreadsheetName: String(context.env.GOOGLE_SHEETS_SPREADSHEET_NAME || "").trim(),
      sheetName: String(context.env.GOOGLE_SHEETS_SHEET_NAME || "").trim()
    }
  };
  const saveResult = await saveLead(context.env, leadPayload);
  if (submissionId && saveResult.ok) {
    recentSubmissionIds.set(submissionId, now + SUBMISSION_ID_TTL_MS);
    if (recentSubmissionIds.size > 5000) {
      for (const [key, value] of recentSubmissionIds.entries()) {
        if (Number(value) <= now) recentSubmissionIds.delete(key);
      }
    }
  }

  lastSubmitByIp.set(ip, now + SUBMIT_COOLDOWN_MS);
  if (lastSubmitByIp.size > 5000) {
    for (const [key, value] of lastSubmitByIp.entries()) {
      if (Number(value) <= now) lastSubmitByIp.delete(key);
    }
  }

  return json({ ok: saveResult.ok, saved: saveResult.ok, saveReason: saveResult.reason || "" }, saveResult.ok ? 200 : 502);
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}


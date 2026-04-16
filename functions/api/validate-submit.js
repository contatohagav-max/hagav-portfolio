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
const LEAD_SAVE_TIMEOUT_MS = 15000;
const DEFAULT_WEBHOOK_URL_DU = "https://script.google.com/macros/s/AKfycbwQumlm5voxZrUcrw9S9nir8PcNs6lcFoIH_UGcjGYmRMryOexvqFyLpI2wnTNd9pMk/exec";
const DEFAULT_WEBHOOK_URL_DR = "https://script.google.com/macros/s/AKfycbwmA4ikYQkYZj_4mt8001BxpC-3ihy92X3xO5FtPg-UP_wUqdLu7PfteuLT1hraAbzTsA/exec";
const DEFAULT_WEBHOOK_SECRET = "hagav-2026-leads-secreto-8472";
const SUBMISSION_ID_TTL_MS = 1000 * 60 * 30;

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
    const required = ["rec_tipo_operacao", "rec_volume", "rec_objetivo", "rec_gravado", "rec_inicio"];
    for (const field of required) {
      const v = stripDangerousText(answers[field] || "", 120);
      if (!v) return { ok: false, error: "Campo recorrente invalido" };
      if (hasDangerousScheme(v)) return { ok: false, error: "Campo recorrente invalido" };
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

function getWebhookConfigByTipo(env, tipo) {
  const isUnica = tipo === "unica";
  const webhookUrl = String(
    isUnica
      ? (env.GOOGLE_SHEETS_WEBHOOK_URL_DU || DEFAULT_WEBHOOK_URL_DU)
      : (env.GOOGLE_SHEETS_WEBHOOK_URL_DR || DEFAULT_WEBHOOK_URL_DR)
  ).trim();
  const secret = String(env.GOOGLE_SHEETS_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET).trim();
  return { webhookUrl, secret };
}

async function saveLeadToSheets(env, lead) {
  const { webhookUrl, secret } = getWebhookConfigByTipo(env, lead?.raw?.tipo);
  if (!webhookUrl) {
    return { ok: false, reason: "not_configured" };
  }

  async function runWebhookPost() {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort("timeout"), LEAD_SAVE_TIMEOUT_MS)
      : null;
    const headers = { "content-type": "application/json; charset=utf-8" };
    if (secret) headers["x-webhook-secret"] = secret;
    const row = lead?.row || {};
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
      ...lead,
      ...row,
      valuesByHeader,
      // Aliases para diferentes scripts (camelCase/snake-ish/acentuados).
      dataHora: row.DataHora || "",
      tipoFluxo: row.TipoFluxo || "",
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
      ip: row.Ip || "",
      "Tipo de Fluxo": row.TipoFluxo || "",
      "Serviço": row.ServicoOuOperacao || "",
      "Referência": row.Referencia || "",
      "Observações": row.Observacoes || "",
      // Estrutura por ordem de colunas para scripts que gravam por índice.
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
      rowData: row,
      answers: lead?.raw?.answers || {},
      tipo: lead?.raw?.tipo || "",
      secret: secret || "",
      auth: { secret: secret || "" }
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(webhookBody),
      signal: controller ? controller.signal : undefined
    });

    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }
    const rawResponse = await response.text();
    if (!rawResponse) {
      return { ok: true };
    }
    try {
      const parsed = JSON.parse(rawResponse);
      if (parsed?.ok === false || parsed?.success === false) {
        return { ok: false, reason: String(parsed?.error || parsed?.message || "webhook_rejected") };
      }
      return { ok: true };
    } catch {
      return { ok: true };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const firstTry = await runWebhookPost().catch(() => ({ ok: false, reason: "request_failed" }));
  if (firstTry.ok) return firstTry;
  await new Promise((resolve) => setTimeout(resolve, 400));
  const secondTry = await runWebhookPost().catch(() => ({ ok: false, reason: "request_failed" }));
  return secondTry.ok ? secondTry : firstTry;
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

function composeWithOutro(baseValue, outroValue, limit = 180) {
  const base = stripDangerousText(String(baseValue || ""), limit);
  const outro = stripDangerousText(String(outroValue || ""), LIMITS.outro);
  if (base !== "Outro") return base;
  return outro ? `Outro: ${outro}` : "Outro";
}

function buildLeadRow(body, request, ip, nowIso) {
  const answers = body?.answers || {};
  const tipo = body?.tipo === "unica" ? "Demanda Única" : "Demanda Recorrente";
  const origemMeta = stripDangerousText(String(body?.meta?.origin || ""), 180);
  const origemHost = stripDangerousText(String(request.headers.get("host") || ""), 120);
  const origem = origemMeta || origemHost || "hagav.com.br";

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
      const qtyRaw = qtyMap[service];
      const qtyValue = stripDangerousText(String(qtyRaw ?? ""), 16);
      return qtyValue || "-";
    });
    quantidade = qtyByService.join(" | ");
    materialGravado = toFlatMap(answers?.unica_gravado, LIMITS.service, 16);
    tempoBruto = toFlatMap(answers?.unica_tempo_bruto, LIMITS.service, LIMITS.duration);
    prazo = stripDangerousText(String(answers?.unica_prazo || ""), 60);
    referencia = stripDangerousText(String(answers?.unica_referencia || ""), LIMITS.referencia);
  } else {
    servicoOuOperacao = composeWithOutro(
      answers?.rec_tipo_operacao,
      answers?.rec_tipo_operacao_outro,
      120
    );
    quantidade = stripDangerousText(String(answers?.rec_volume || ""), 60);
    materialGravado = stripDangerousText(String(answers?.rec_gravado || ""), 40);
    prazo = stripDangerousText(String(answers?.rec_inicio || ""), 60);
    objetivo = composeWithOutro(
      answers?.rec_objetivo,
      answers?.rec_objetivo_outro,
      120
    );
  }

  return {
    DataHora: nowIso,
    TipoFluxo: tipo,
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
  const saveResult = await saveLeadToSheets(context.env, leadPayload);
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

  return json({ ok: true, saved: saveResult.ok, saveReason: saveResult.reason || "" });
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}


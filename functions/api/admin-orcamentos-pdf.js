function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function createRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // no-op
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function logPdf(requestId, stage, message, extra = {}) {
  const payload = {
    request_id: requestId,
    stage,
    ...extra,
  };
  console.log(`[HAGAV][PDF][PROPOSTA] ${message}`, payload);
}

function fail(requestId, stage, error, status, extra = {}) {
  logPdf(requestId, stage, "Falha no fluxo de proposta PDF", {
    error,
    status,
    ...extra,
  });
  return json({
    ok: false,
    error,
    stage,
    request_id: requestId,
    ...extra,
  }, status);
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
    serviceRoleKey: firstEnvValue(env, ["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]),
    anonKey: firstEnvValue(env, ["SUPABASE_ANON_KEY", "SUPABASE_PUBLIC_ANON_KEY", "SUPABASE_KEY"])
  };
}

function getAdminKey(env) {
  return firstEnvValue(env, ["ADMIN_DASHBOARD_KEY", "ORCAMENTO_ADMIN_KEY", "HAGAV_ADMIN_KEY"]);
}

function getBearerToken(request) {
  const raw = String(request.headers.get("authorization") || "").trim();
  if (!raw || !/^bearer\s+/i.test(raw)) return "";
  return stripDangerousText(raw.replace(/^bearer\s+/i, ""), 240);
}

async function hasAuthenticatedSession(config, request) {
  const token = getBearerToken(request);
  if (!token || !config?.url) return false;
  const apiKey = String(config.anonKey || config.serviceRoleKey || "").trim();
  if (!apiKey) return false;

  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) return false;
    const parsed = await parseJsonSafe(response);
    return Boolean(parsed?.id);
  } catch {
    return false;
  }
}

async function isAuthorized(request, env, config) {
  const expected = getAdminKey(env);
  const providedAdminKey = stripDangerousText(
    String(request.headers.get("x-admin-key") || ""),
    200
  );
  if (expected && providedAdminKey && providedAdminKey === expected) {
    return { ok: true };
  }

  const hasSession = await hasAuthenticatedSession(config, request);
  if (hasSession) return { ok: true };

  if (expected && providedAdminKey !== expected) {
    return { ok: false, reason: "unauthorized", status: 401 };
  }
  if (!expected) {
    return { ok: false, reason: "admin_key_not_configured_or_session_missing", status: 401 };
  }
  return { ok: false, reason: "unauthorized", status: 401 };
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

function normalizePdfText(value, limit = 200) {
  return stripDangerousText(String(value || ""), limit)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
}

function formatDateBr(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16) || 32));
}

function htmlToPdfLines(html) {
  const normalized = String(html || "")
    .replace(/\r/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|section|article|header|footer|li|tr|table|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(normalized)
    .split(/\n+/)
    .map((line) => normalizePdfText(line, 220).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 260);
}

function applyTemplatePlaceholders(templateHtml, values) {
  let output = String(templateHtml || "");
  const replacements = values && typeof values === "object" ? values : {};

  for (const [keyRaw, valueRaw] of Object.entries(replacements)) {
    const key = String(keyRaw || "").trim();
    if (!key) continue;
    const safeValue = stripDangerousText(String(valueRaw ?? "-"), 1200) || "-";
    const escaped = escapeRegExp(key);
    const patterns = [
      new RegExp(`{{\\s*${escaped}\\s*}}`, "gi"),
      new RegExp(`\\[\\[\\s*${escaped}\\s*\\]\\]`, "gi"),
      new RegExp(`%%\\s*${escaped}\\s*%%`, "gi"),
      new RegExp(`__\\s*${escaped}\\s*__`, "gi"),
    ];
    for (const pattern of patterns) {
      output = output.replace(pattern, safeValue);
    }
  }

  return output
    .replace(/{{\s*[^{}]+\s*}}/g, "-")
    .replace(/\[\[\s*[^[\]]+\s*\]\]/g, "-")
    .replace(/%%\s*[^%]+\s*%%/g, "-")
    .replace(/__\s*[A-Za-z0-9_.-]+\s*__/g, "-");
}

function createPdfFromLines(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
  if (safeLines.length === 0) {
    safeLines.push("HAGAV Studio");
    safeLines.push("Documento sem conteudo para gerar PDF.");
  }
  let y = 800;
  const textCommands = [];
  for (const raw of safeLines) {
    if (y < 60) break;
    const line = normalizePdfText(raw, 130);
    textCommands.push(`1 0 0 1 46 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= 16;
  }

  const content = `BT\n/F1 11 Tf\n${textCommands.join("\n")}\nET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function readDetalhes(row) {
  if (row?.detalhes && typeof row.detalhes === "object" && !Array.isArray(row.detalhes)) {
    return row.detalhes;
  }
  try {
    const parsed = JSON.parse(String(row?.detalhes || "{}"));
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  return {};
}

function buildTemplateValues(row) {
  const detalhes = readDetalhes(row);
  const dataHojeIso = new Date().toISOString();
  const servico = normalizePdfText(row?.servico || detalhes?.servicoOuOperacao || "-", 180);
  const quantidade = normalizePdfText(detalhes?.quantidade || "-", 120);
  const material = normalizePdfText(detalhes?.materialGravado || row?.material_gravado || "-", 120);
  const tempo = normalizePdfText(detalhes?.tempoBruto || row?.tempo_bruto || "-", 120);
  const prazo = normalizePdfText(detalhes?.prazo || row?.prazo || "-", 120);
  const referencia = normalizePdfText(detalhes?.referencia || row?.referencia || "-", 220);
  const observacoesCliente = normalizePdfText(detalhes?.observacoes || row?.observacoes || "-", 300);
  const observacoesInternas = normalizePdfText(row?.observacoes_internas || "-", 300);
  const precoBase = Number(row?.preco_base || 0);
  const precoFinal = Number(row?.preco_final || row?.valor_sugerido || row?.preco_base || 0);
  const valorSugerido = Number(row?.valor_sugerido || row?.preco_final || row?.preco_base || 0);
  const origem = normalizePdfText(row?.origem || "-", 180);
  const fluxo = normalizePdfText(detalhes?.fluxo || row?.fluxo || "-", 80);
  const escopo = normalizePdfText(row?.resumo_orcamento || "-", 360);
  const pacote = normalizePdfText(row?.pacote_sugerido || "-", 120);
  const clienteNome = normalizePdfText(row?.nome || "-", 120);
  const whatsapp = normalizePdfText(row?.whatsapp || "-", 40);
  const propostaNumero = normalizePdfText(`PROP-${row?.id || "-"}`, 80);

  const base = {
    id: normalizePdfText(row?.id || "-", 80),
    proposta_numero: propostaNumero,
    numero_proposta: propostaNumero,
    data_emissao: formatDateBr(dataHojeIso),
    data_hoje: formatDateBr(dataHojeIso),
    data_criacao: formatDateBr(row?.created_at || dataHojeIso),
    cliente_nome: clienteNome,
    nome: clienteNome,
    whatsapp,
    fluxo,
    origem,
    servico,
    servico_plano: servico,
    plano_servico: servico,
    escopo,
    resumo_orcamento: escopo,
    quantidade,
    material_gravado: material,
    tempo_bruto: tempo,
    prazo,
    referencia,
    preco_base: formatMoney(precoBase),
    valor_base: formatMoney(precoBase),
    preco_final: formatMoney(precoFinal),
    valor_final: formatMoney(precoFinal),
    valor_sugerido: formatMoney(valorSugerido),
    pacote_sugerido: pacote,
    observacoes_cliente: observacoesCliente,
    observacoes: observacoesCliente,
    observacoes_internas: observacoesInternas,
    validade_dias: "7",
  };

  const expanded = {};
  for (const [key, value] of Object.entries(base)) {
    expanded[key] = value;
    expanded[key.toUpperCase()] = value;
  }
  return expanded;
}

const PROPOSTA_TEMPLATE_PATH = "/templates/proposta-hagav-template.html";

async function loadOfficialPropostaTemplate(request, env) {
  const templateUrl = new URL(PROPOSTA_TEMPLATE_PATH, request.url).toString();
  const readErrors = [];

  if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
    try {
      const response = await env.ASSETS.fetch(new Request(templateUrl, { method: "GET" }));
      if (response?.ok) {
        const html = await response.text();
        if (String(html || "").trim()) {
          return { html, source: "assets", templatePath: PROPOSTA_TEMPLATE_PATH };
        }
      }
      readErrors.push(`assets_http_${response?.status || 0}`);
    } catch (err) {
      readErrors.push(`assets_fetch_${stripDangerousText(String(err?.message || "erro_desconhecido"), 120)}`);
    }
  }

  try {
    const response = await fetch(templateUrl, { method: "GET" });
    if (response?.ok) {
      const html = await response.text();
      if (String(html || "").trim()) {
        return { html, source: "http", templatePath: PROPOSTA_TEMPLATE_PATH };
      }
    }
    readErrors.push(`http_${response?.status || 0}`);
  } catch (err) {
    readErrors.push(`http_fetch_${stripDangerousText(String(err?.message || "erro_desconhecido"), 120)}`);
  }

  const error = new Error(`template_not_found:${PROPOSTA_TEMPLATE_PATH}:${readErrors.join("|")}`);
  error.code = "template_not_found";
  error.templatePath = PROPOSTA_TEMPLATE_PATH;
  throw error;
}

async function renderPropostaTemplateToLines(row, request, env) {
  const templateInfo = await loadOfficialPropostaTemplate(request, env);
  const values = buildTemplateValues(row);
  const renderedHtml = applyTemplatePlaceholders(templateInfo.html, values);
  const lines = htmlToPdfLines(renderedHtml);
  const firstCharsRendered = renderedHtml.slice(0, 120).replace(/\s+/g, " ").trim();

  return {
    lines,
    templateSource: templateInfo.source,
    templatePath: templateInfo.templatePath,
    firstCharsRendered,
  };
}

async function uploadPdfIfPossible(config, env, pdfContent, fileName) {
  const bucket = firstEnvValue(env, ["SUPABASE_PDF_BUCKET", "SUPABASE_STORAGE_BUCKET"]);
  if (!bucket) return { ok: false, reason: "pdf_bucket_not_configured" };

  const filePath = `orcamentos/${fileName}`;
  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, "/");
  const response = await fetch(`${config.url}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/pdf",
      "x-upsert": "true"
    },
    body: pdfContent
  });

  if (!response.ok) {
    const parsed = await parseJsonSafe(response);
    return {
      ok: false,
      reason: String(parsed?.message || parsed?.error || `storage_http_${response.status}`)
    };
  }

  return {
    ok: true,
    link: `${config.url}/storage/v1/object/public/${bucket}/${filePath}`
  };
}

async function updatePdfLink(config, row, linkPdf) {
  const detalhes = readDetalhes(row);
  const comercial = (detalhes?.comercial && typeof detalhes.comercial === "object")
    ? detalhes.comercial
    : {};
  const nowIso = new Date().toISOString();

  return fetchSupabase(
    config,
    `/rest/v1/deals?id=eq.${encodeURIComponent(row.id)}&select=id,link_pdf,proposta_gerada_em,detalhes,status`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: {
        link_pdf: linkPdf || "",
        proposta_gerada_em: nowIso,
        detalhes: {
          ...detalhes,
          comercial: {
            ...comercial,
            proposta_link: linkPdf || "",
            proposta_gerada_em: nowIso,
            atualizado_em: nowIso,
          },
        },
      }
    }
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestId = createRequestId();
  const config = getSupabaseConfig(env);
  const hasAdminKey = Boolean(getAdminKey(env));
  logPdf(requestId, "start", "Inicio da geracao de proposta PDF", {
    has_supabase_url: Boolean(config.url),
    has_service_role: Boolean(config.serviceRoleKey),
    has_anon_key: Boolean(config.anonKey),
    has_admin_key_env: hasAdminKey,
    has_x_admin_key_header: Boolean(String(request.headers.get("x-admin-key") || "").trim()),
    has_bearer_header: Boolean(String(request.headers.get("authorization") || "").trim()),
  });

  if (!config.url || !config.serviceRoleKey) {
    return fail(requestId, "env", "supabase_not_configured", 503);
  }

  const auth = await isAuthorized(request, env, config);
  if (!auth.ok) {
    return fail(requestId, "auth", auth.reason, auth.status || 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(requestId, "request", "json_invalido", 400);
  }

  const id = stripDangerousText(String(body?.id || ""), 120);
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return fail(requestId, "request", "id_invalido", 400);
  }

  const getResult = await fetchSupabase(
    config,
    `/rest/v1/deals?id=eq.${encodeURIComponent(id)}&select=id,created_at,nome,whatsapp,servico,resumo_orcamento,preco_base,preco_final,pacote_sugerido,status,observacoes_internas,link_pdf,detalhes,origem&limit=1`
  );
  if (!getResult.ok) {
    return fail(requestId, "fetch_deal", getResult.reason || "deal_fetch_failed", 502);
  }
  const row = Array.isArray(getResult.data) ? (getResult.data[0] || null) : null;
  if (!row) {
    return fail(requestId, "fetch_deal", "orcamento_nao_encontrado", 404);
  }

  let rendered;
  try {
    rendered = await renderPropostaTemplateToLines(row, request, env);
  } catch (err) {
    const reason = String(err?.code || "").toLowerCase() === "template_not_found"
      || String(err?.message || "").includes("template_not_found")
      ? "template_not_found"
      : "template_render_failed";
    return fail(requestId, "template_render", reason, 500, {
      detail: stripDangerousText(String(err?.message || ""), 200),
      template_path: PROPOSTA_TEMPLATE_PATH,
    });
  }
  const { lines, templateSource, templatePath, firstCharsRendered } = rendered;
  logPdf(requestId, "template_render", "Template renderizado para proposta", {
    template_source: templateSource,
    template_path: templatePath,
    lines_count: Array.isArray(lines) ? lines.length : 0,
    first_120_chars: firstCharsRendered,
  });

  const pdfContent = createPdfFromLines(lines);
  const fileName = `orcamento-${id}-${Date.now()}.pdf`;
  const uploadResult = await uploadPdfIfPossible(config, env, pdfContent, fileName);
  if (!uploadResult.ok) {
    return fail(requestId, "upload", "pdf_upload_failed", 502, {
      upload_reason: stripDangerousText(String(uploadResult.reason || "upload_failed"), 180),
      file_name: fileName,
      template_source: templateSource,
      template_path: templatePath,
    });
  }

  let linkPdf = "";
  linkPdf = stripDangerousText(uploadResult.link || "", 1000);
  const updateResult = await updatePdfLink(config, row, linkPdf);
  if (!updateResult.ok) {
    return fail(requestId, "persist_link", "deal_link_update_failed", 502, {
      detail: stripDangerousText(String(updateResult.reason || "deal_update_failed"), 180),
      file_name: fileName,
      link_pdf: linkPdf,
      template_source: templateSource,
      template_path: templatePath,
    });
  }
  logPdf(requestId, "persist_link", "Link da proposta salvo no deal", {
    deal_id: id,
    file_name: fileName,
    template_source: templateSource,
    template_path: templatePath,
  });

  return json({
    ok: true,
    id,
    fileName,
    link_pdf: linkPdf,
    uploaded: uploadResult.ok,
    upload_reason: uploadResult.ok ? "" : uploadResult.reason,
    template_source: templateSource,
    template_path: templatePath,
    first_120_chars_rendered: firstCharsRendered,
    request_id: requestId,
    pdf_base64: typeof btoa === "function" ? btoa(pdfContent) : ""
  });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

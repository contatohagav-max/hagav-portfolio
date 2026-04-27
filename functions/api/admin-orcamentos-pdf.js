import { authenticateRequest, getClientIp } from '../_utils/admin-auth.js';
import { applyRateLimit } from '../_utils/rate-limit.js';

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

function normalizeTemplateText(value, maxLen = 400, { allowEmpty = false } = {}) {
  const base = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
  if (!base) return allowEmpty ? "" : "-";
  return base;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value, { withCurrency = true } = {}) {
  const num = Number(value || 0);
  const safeNum = Number.isFinite(num) ? num : 0;
  try {
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(safeNum);
    return withCurrency ? `R$ ${formatted}` : formatted;
  } catch {
    const fallback = safeNum.toFixed(2).replace(".", ",");
    return withCurrency ? `R$ ${fallback}` : fallback;
  }
}

function formatDateBr(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatDatePlusDaysBr(value, days = 7) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return formatDateBr(Date.now() + days * 86400000);
  date.setDate(date.getDate() + Number(days || 0));
  return formatDateBr(date.toISOString());
}

function firstNonEmptyValue(...values) {
  for (const value of values) {
    const normalized = normalizeTemplateText(value, 500, { allowEmpty: true });
    if (normalized) return normalized;
  }
  return "";
}

function formatWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function normalizePlaceholderKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  const template = String(templateHtml || "");
  const replacements = values && typeof values === "object" ? values : {};
  const lookup = new Map();
  for (const [rawKey, rawValue] of Object.entries(replacements)) {
    const key = normalizePlaceholderKey(rawKey);
    if (!key) continue;
    const safeValue = normalizeTemplateText(rawValue, 1600, { allowEmpty: true });
    lookup.set(key, escapeHtml(safeValue));
  }

  const totalMatches = template.match(/{{\s*[^{}]+\s*}}/g) || [];
  const unresolvedKeys = [];
  let replacedCount = 0;

  let output = template.replace(/{{\s*([^{}]+)\s*}}/g, (fullMatch, placeholderRaw) => {
    const key = normalizePlaceholderKey(placeholderRaw);
    if (!key) return "";
    if (!lookup.has(key)) {
      unresolvedKeys.push(key);
      return fullMatch;
    }
    replacedCount += 1;
    return lookup.get(key);
  });

  output = output
    .replace(/\[\[\s*([^[\]]+)\s*\]\]/g, (_, placeholderRaw) => {
      const key = normalizePlaceholderKey(placeholderRaw);
      if (!key || !lookup.has(key)) return "";
      return lookup.get(key);
    })
    .replace(/%%\s*([^%]+)\s*%%/g, (_, placeholderRaw) => {
      const key = normalizePlaceholderKey(placeholderRaw);
      if (!key || !lookup.has(key)) return "";
      return lookup.get(key);
    })
    .replace(/__\s*([A-Za-z0-9_.-]+)\s*__/g, (_, placeholderRaw) => {
      const key = normalizePlaceholderKey(placeholderRaw);
      if (!key || !lookup.has(key)) return "";
      return lookup.get(key);
    });

  const unresolvedCountByOccurrence = (output.match(/{{\s*[^{}]+\s*}}/g) || []).length;
  const unresolvedUnique = Array.from(new Set(unresolvedKeys));

  output = output
    .replace(/{{\s*[^{}]+\s*}}/g, "")
    .replace(/<li>\s*<\/li>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "");

  const remainingAfterCleanup = Array.from(new Set(
    (output.match(/{{\s*([^{}]+)\s*}}/g) || [])
      .map((item) => normalizePlaceholderKey(item.replace(/[{}]/g, "")))
      .filter(Boolean)
  ));

  return {
    html: output,
    placeholdersTotal: totalMatches.length,
    placeholdersSubstituidos: replacedCount,
    placeholdersRestantes: unresolvedCountByOccurrence > 0 ? unresolvedUnique : remainingAfterCleanup,
  };
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

function ensureHtmlDocument(html) {
  const base = String(html || "").trim();
  if (!base) return "<!DOCTYPE html><html><head><meta charset=\"utf-8\" /></head><body></body></html>";
  const withDoctype = /<!doctype html>/i.test(base) ? base : `<!DOCTYPE html>\n${base}`;
  if (/<html[\s>]/i.test(withDoctype)) return withDoctype;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${withDoctype}</body></html>`;
}

function inspectRenderedHtml(html) {
  const source = String(html || "");
  return {
    htmlHasStyleTag: /<style[\s>]/i.test(source),
    htmlHasHeaderClass: /class=["'][^"']*\bheader\b[^"']*["']/i.test(source),
    htmlHasDoctype: /<!doctype html>/i.test(source),
    htmlHasHtmlTag: /<html[\s>]/i.test(source),
    htmlHasHeadTag: /<head[\s>]/i.test(source),
    htmlHasBodyTag: /<body[\s>]/i.test(source),
    htmlPreviewFirst300Chars: source.slice(0, 300).replace(/\s+/g, " ").trim(),
  };
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bytesToBase64(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || []);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function previewRawResponse(value, maxLen = 320) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function decodeBytesPreview(bytes, maxBytes = 900) {
  try {
    const slice = bytes instanceof Uint8Array
      ? bytes.subarray(0, Math.min(bytes.length, maxBytes))
      : new Uint8Array(0);
    return previewRawResponse(new TextDecoder("utf-8").decode(slice), 320);
  } catch {
    return "";
  }
}

function normalizePdfshiftEndpoint(rawEndpoint) {
  const fallback = "https://api.pdfshift.io/v3/convert/pdf";
  const raw = String(rawEndpoint || "").trim();
  if (!raw) return fallback;

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    const host = String(url.hostname || "").toLowerCase();
    const path = String(url.pathname || "").replace(/\/+$/, "");
    const query = String(url.search || "");

    if (host === "api.pdfshift.io") {
      const normalizedPath = path || "/v3/convert/pdf";
      return `https://api.pdfshift.io${normalizedPath}${query}`;
    }

    if (host.endsWith("pdfshift.io") || host.endsWith("pdfshift.com")) {
      const normalizedPath = path.includes("/convert/pdf") ? path : "/v3/convert/pdf";
      return `https://api.pdfshift.io${normalizedPath}${query}`;
    }

    return url.toString();
  } catch {
    return fallback;
  }
}

function getPdfRenderConfig(env) {
  const forcedEngine = firstEnvValue(env, ["PDF_ENGINE", "PDF_RENDER_ENGINE", "PDF_PROVIDER"]).toLowerCase();
  const pdfshiftKey = firstEnvValue(env, ["PDFSHIFT_API_KEY", "PDFSHIFT_KEY"]);
  const browserlessToken = firstEnvValue(env, ["BROWSERLESS_TOKEN", "BROWSERLESS_API_KEY", "PDF_BROWSERLESS_TOKEN"]);
  const allowNativeFallbackRaw = firstEnvValue(env, ["PDF_NATIVE_FALLBACK", "PDF_ALLOW_NATIVE_FALLBACK"]);
  const allowNativeFallback = allowNativeFallbackRaw
    ? !/^(0|false|no)$/i.test(allowNativeFallbackRaw)
    : true;

  const autoEngine = browserlessToken ? "browserless" : (pdfshiftKey ? "pdfshift" : "native_text");
  const normalizedForced = forcedEngine && forcedEngine !== "auto" ? forcedEngine : "";
  const engine = normalizedForced || autoEngine;
  const pdfshiftEndpointRaw = firstEnvValue(env, ["PDFSHIFT_ENDPOINT", "PDFSHIFT_URL"]) || "https://api.pdfshift.io/v3/convert/pdf";
  const pdfshiftEndpoint = normalizePdfshiftEndpoint(pdfshiftEndpointRaw);

  return {
    engine,
    renderMode: engine === "native_text" ? "native_text_fallback" : "remote_html_to_pdf",
    allowNativeFallback,
    pdfshift: {
      apiKey: pdfshiftKey,
      endpoint: pdfshiftEndpoint,
      endpointRaw: pdfshiftEndpointRaw,
      authMode: "x_api_key",
    },
    browserless: {
      token: browserlessToken,
      endpoint: (firstEnvValue(env, ["BROWSERLESS_ENDPOINT", "BROWSERLESS_URL", "PDF_BROWSERLESS_ENDPOINT"]) || "https://chrome.browserless.io").replace(/\/+$/, ""),
    },
  };
}

function renderPdfViaNativeText(html) {
  const lines = htmlToPdfLines(html);
  const pdfText = createPdfFromLines(lines);
  const pdfBytes = new TextEncoder().encode(pdfText);
  return {
    ok: true,
    pdfBytes,
    renderMode: "native_text_fallback",
    pdfEngine: "native_text",
  };
}

async function renderPdfViaPdfshift(html, config) {
  if (!config?.apiKey) {
    return {
      ok: false,
      reason: "pdf_engine_not_configured",
      status: 503,
      detail: "PDFSHIFT_API_KEY ausente",
      renderMode: "remote_html_to_pdf",
      pdfEngine: "pdfshift",
      providerEndpoint: String(config?.endpoint || ""),
      providerAuthMode: "x_api_key",
    };
  }

  const payload = {
    source: html,
    use_print: true,
    format: "A4",
    margin: "0",
  };

  let response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-api-key": String(config.apiKey || ""),
        accept: "application/pdf, application/json;q=0.9, text/plain;q=0.8, */*;q=0.5",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "pdf_render_failed",
      status: 502,
      detail: `pdfshift_fetch_error:${stripDangerousText(String(err?.message || "erro_desconhecido"), 220)}`,
      renderMode: "remote_html_to_pdf",
      pdfEngine: "pdfshift",
      providerEndpoint: String(config.endpoint || ""),
      providerAuthMode: "x_api_key",
    };
  }

  const providerStatus = Number(response.status || 0);
  const providerContentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const bodyPreview = previewRawResponse(text, 320);
    return {
      ok: false,
      reason: "pdf_render_failed",
      status: 502,
      detail: `pdfshift_http_${providerStatus}:${bodyPreview || "sem_corpo"}`,
      renderMode: "remote_html_to_pdf",
      pdfEngine: "pdfshift",
      providerStatus,
      providerContentType,
      providerBodyPreview: bodyPreview,
      providerEndpoint: String(config.endpoint || ""),
      providerAuthMode: "x_api_key",
    };
  }

  const buffer = await response.arrayBuffer();
  const pdfBytes = new Uint8Array(buffer);
  const firstBytesText = decodeBytesPreview(pdfBytes, 40);
  const headerLooksPdf = String(firstBytesText || "").includes("%PDF-");
  const contentTypeLooksPdf = (
    providerContentType.includes("application/pdf")
    || providerContentType.includes("application/octet-stream")
  );

  if (!headerLooksPdf && !contentTypeLooksPdf) {
    const bodyPreview = decodeBytesPreview(pdfBytes, 900);
    return {
      ok: false,
      reason: "pdf_render_failed",
      status: 502,
      detail: `pdfshift_unexpected_response:${bodyPreview || "resposta_nao_pdf"}`,
      renderMode: "remote_html_to_pdf",
      pdfEngine: "pdfshift",
      providerStatus,
      providerContentType,
      providerBodyPreview: bodyPreview,
      providerEndpoint: String(config.endpoint || ""),
      providerAuthMode: "x_api_key",
    };
  }

  return {
    ok: true,
    pdfBytes,
    renderMode: "remote_html_to_pdf",
    pdfEngine: "pdfshift",
    providerStatus,
    providerContentType,
    providerEndpoint: String(config.endpoint || ""),
    providerAuthMode: "x_api_key",
  };
}

async function renderPdfViaBrowserless(html, config) {
  if (!config?.token) {
    return {
      ok: false,
      reason: "pdf_engine_not_configured",
      status: 503,
      detail: "BROWSERLESS_TOKEN ausente",
      renderMode: "remote_html_to_pdf",
      pdfEngine: "browserless",
    };
  }

  const endpoint = `${config.endpoint}/pdf?token=${encodeURIComponent(config.token)}`;
  const commonOptions = {
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0.2in", right: "0.2in", bottom: "0.2in", left: "0.2in" },
  };
  const attempts = [
    {
      label: "html_payload",
      payload: {
        html,
        waitUntil: "networkidle0",
        options: commonOptions,
      },
    },
    {
      label: "data_url",
      payload: {
        url: `data:text/html;base64,${utf8ToBase64(html)}`,
        waitUntil: "networkidle0",
        options: commonOptions,
      },
    },
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(attempt.payload),
      });
      if (!response.ok) {
        const text = stripDangerousText(await response.text().catch(() => ""), 240);
        errors.push(`${attempt.label}:${text || `http_${response.status}`}`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      return {
        ok: true,
        pdfBytes: new Uint8Array(buffer),
        renderMode: "remote_html_to_pdf",
        pdfEngine: "browserless",
      };
    } catch (err) {
      errors.push(`${attempt.label}:${stripDangerousText(String(err?.message || "erro_desconhecido"), 180)}`);
    }
  }

  return {
    ok: false,
    reason: "pdf_render_failed",
    status: 502,
    detail: errors.join("|").slice(0, 500),
    renderMode: "remote_html_to_pdf",
    pdfEngine: "browserless",
  };
}

async function renderHtmlToPdf(html, env) {
  const config = getPdfRenderConfig(env);
  if (config.engine === "native_text") {
    return renderPdfViaNativeText(html);
  }

  let primaryResult = null;
  if (config.engine === "pdfshift") {
    primaryResult = await renderPdfViaPdfshift(html, config.pdfshift);
  } else if (config.engine === "browserless") {
    primaryResult = await renderPdfViaBrowserless(html, config.browserless);
  } else {
    primaryResult = {
      ok: false,
      reason: "pdf_engine_not_supported",
      status: 400,
      detail: `Engine nao suportada: ${config.engine}`,
      renderMode: config.renderMode,
      pdfEngine: config.engine,
    };
  }

  if (primaryResult?.ok) return primaryResult;

  if (config.allowNativeFallback) {
    const fallback = renderPdfViaNativeText(html);
    return {
      ...fallback,
      fallbackFrom: String(primaryResult?.pdfEngine || config.engine || "unknown"),
      fallbackReason: String(primaryResult?.reason || "pdf_render_failed"),
      fallbackDetail: stripDangerousText(String(primaryResult?.detail || ""), 240),
    };
  }

  return primaryResult;
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

function parseQuantityNumber(value) {
  if (Number.isFinite(Number(value))) {
    const parsed = Math.round(Number(value));
    return parsed > 0 ? parsed : 0;
  }
  const match = String(value || "").match(/(\d{1,5})/);
  if (!match || !match[1]) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeServiceName(value) {
  const cleaned = normalizeTemplateText(value, 120, { allowEmpty: true });
  if (!cleaned) return "";
  const key = cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/reels?|shorts?|tiktok/.test(key)) return "Reels, TikTok e Shorts";
  if (/criativo/.test(key) && /(ads|trafego)/.test(key)) return "Criativo para Ads";
  if (/corte/.test(key) && /podcast/.test(key)) return "Corte Podcast / Clipe";
  if (/youtube/.test(key)) return "YouTube";
  if (/vsl/.test(key) && /(15|ate|curta)/.test(key)) return "VSL ate 15 min";
  if (/vsl/.test(key) && /(longa|30|min)/.test(key)) return "VSL longa (15-30 min)";
  if (/videoaula|modulo/.test(key)) return "Videoaula / Modulo";
  if (/depoimento/.test(key)) return "Depoimento";
  if (/motion|vinheta/.test(key)) return "Motion / Vinheta";
  if (/conteudo.*rede/.test(key)) return "Conteudo para redes sociais";
  return cleaned;
}

function parseItemsFromArray(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const servico = normalizeServiceName(
        item?.servico
        ?? item?.tipo
        ?? item?.operacao
        ?? item?.nome
        ?? ""
      );
      const quantidade = parseQuantityNumber(
        item?.quantidade
        ?? item?.qtd
        ?? item?.volume
        ?? item?.valor
        ?? 0
      );
      if (!servico || quantidade <= 0) return null;
      return { servico, quantidade };
    })
    .filter(Boolean);
}

function parseItemsFromMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return [];
  return Object.entries(rawMap)
    .map(([serviceRaw, qtyRaw]) => {
      const servico = normalizeServiceName(serviceRaw);
      const quantidade = parseQuantityNumber(qtyRaw);
      if (!servico || quantidade <= 0) return null;
      return { servico, quantidade };
    })
    .filter(Boolean);
}

function parseItemsFromQuantityText(rawText) {
  const text = normalizeTemplateText(rawText, 600, { allowEmpty: true });
  if (!text) return [];
  return text
    .split(/\||;|\n/)
    .map((segment) => normalizeTemplateText(segment, 220, { allowEmpty: true }))
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^(.+?)\s*[:=-]\s*(\d{1,5})/);
      if (!match) return null;
      const servico = normalizeServiceName(match[1]);
      const quantidade = parseQuantityNumber(match[2]);
      if (!servico || quantidade <= 0) return null;
      return { servico, quantidade };
    })
    .filter(Boolean);
}

function mergeServiceItems(items, fallbackService = "Conteudo audiovisual", fallbackQty = 1) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const servico = normalizeServiceName(item?.servico || "");
    const quantidade = parseQuantityNumber(item?.quantidade);
    if (!servico || quantidade <= 0) return;
    map.set(servico, (map.get(servico) || 0) + quantidade);
  });

  const merged = Array.from(map.entries()).map(([servico, quantidade]) => ({ servico, quantidade }));
  if (merged.length > 0) return merged;

  const safeService = normalizeServiceName(fallbackService) || "Conteudo audiovisual";
  const safeQty = Math.max(1, parseQuantityNumber(fallbackQty) || 1);
  return [{ servico: safeService, quantidade: safeQty }];
}

function extractServiceItems(row, detalhes) {
  const calculo = (
    detalhes?.calculoAutomatico
    && typeof detalhes.calculoAutomatico === "object"
    && !Array.isArray(detalhes.calculoAutomatico)
  ) ? detalhes.calculoAutomatico : {};
  const answers = (
    detalhes?.respostasCompletas
    && typeof detalhes.respostasCompletas === "object"
    && !Array.isArray(detalhes.respostasCompletas)
  ) ? detalhes.respostasCompletas : {};

  const fromCalcArray = parseItemsFromArray(calculo?.itensServico);
  const fromArray = parseItemsFromArray(detalhes?.itensServico);
  const fromMaps = [
    parseItemsFromMap(answers?.flow_quantidades),
    parseItemsFromMap(answers?.unica_quantidades),
    parseItemsFromMap(answers?.rec_quantidades),
    parseItemsFromMap(detalhes?.quantidade_por_servico),
    parseItemsFromMap(detalhes?.quantidades_por_servico),
  ].flat();
  const fromText = parseItemsFromQuantityText(
    firstNonEmptyValue(
      detalhes?.quantidade,
      detalhes?.quantidade_texto,
      row?.quantidade
    )
  );

  const fallbackService = firstNonEmptyValue(
    detalhes?.servicoOuOperacao,
    detalhes?.servico,
    row?.servico,
    row?.pacote_sugerido,
    "Conteudo audiovisual"
  );
  const fallbackQty = firstNonEmptyValue(
    row?.quantidade,
    detalhes?.quantidade,
    "1"
  );

  return mergeServiceItems(
    [...fromCalcArray, ...fromArray, ...fromMaps, ...fromText],
    fallbackService,
    fallbackQty
  ).slice(0, 8);
}

function inferUnitByService(serviceLabel, quantity) {
  const key = String(serviceLabel || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/motion|vinheta/.test(key)) return quantity === 1 ? "projeto" : "projetos";
  if (/videoaula|modulo/.test(key)) return quantity === 1 ? "modulo" : "modulos";
  return quantity === 1 ? "video" : "videos";
}

function buildQuantitySummary(items) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const total = safeItems.reduce((sum, item) => sum + parseQuantityNumber(item?.quantidade), 0) || 1;
  if (safeItems.length <= 1) {
    const unit = inferUnitByService(safeItems[0]?.servico || "", total);
    return {
      total,
      quantityLabel: `${total} ${unit}`,
      breakdown: `${total} ${safeItems[0]?.servico || "conteudo audiovisual"}`,
    };
  }
  const compactBreakdown = safeItems
    .slice(0, 4)
    .map((item) => `${item.quantidade} ${item.servico}`)
    .join(" + ");
  return {
    total,
    quantityLabel: `${total} itens`,
    breakdown: compactBreakdown,
  };
}

function isLikelyInternalText(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    key.includes("du |")
    || key.includes("dr |")
    || key.includes("material gravado")
    || key.includes("tempo bruto")
    || key.includes("origem")
    || key.includes("respostascompletas")
  );
}

function normalizeReferenceText(referenceRaw) {
  const raw = normalizeTemplateText(referenceRaw, 450, { allowEmpty: true });
  if (!raw) return { show: false, text: "" };
  const shortUrlMatch = raw.match(/https?:\/\/[^\s]+/i);
  if (shortUrlMatch && shortUrlMatch[0] && shortUrlMatch[0].length <= 120) {
    return { show: true, text: `Referencia: ${shortUrlMatch[0]}` };
  }
  return { show: true, text: "Referencia enviada pelo cliente sera considerada no briefing." };
}

function normalizeObservationForClient(rawValue) {
  const text = normalizeTemplateText(rawValue, 320, { allowEmpty: true });
  if (!text) return { show: false, text: "" };
  if (text.length < 8 || text.length > 260) return { show: false, text: "" };
  if (isLikelyInternalText(text)) return { show: false, text: "" };
  const separators = (text.match(/\|/g) || []).length;
  if (separators >= 2) return { show: false, text: "" };
  return { show: true, text };
}

function normalizeRevisoesText(rawValue) {
  const text = normalizeTemplateText(rawValue, 80, { allowEmpty: true });
  if (!text) return "1 rodada de ajustes inclusa.";
  const qty = parseQuantityNumber(text);
  if (qty <= 1) return "1 rodada de ajustes inclusa.";
  return `${qty} rodadas de ajustes inclusas.`;
}

function buildCommercialScope({
  serviceItems,
  quantitySummary,
  revisoesText,
}) {
  const safeItems = Array.isArray(serviceItems) ? serviceItems : [];
  if (safeItems.length <= 1) {
    const single = safeItems[0] || { servico: "conteudo audiovisual", quantidade: 1 };
    const unit = inferUnitByService(single.servico, single.quantidade);
    return [
      `Edicao e finalizacao de ${single.quantidade} ${unit} de ${single.servico} conforme briefing aprovado.`,
      "Inclui organizacao do material, cortes, ritmo, acabamento visual e exportacao final em MP4.",
      `O projeto contempla ${revisoesText.toLowerCase()}`,
    ].join(" ");
  }

  const compactServices = safeItems
    .slice(0, 4)
    .map((item) => `${item.quantidade} ${item.servico}`)
    .join(" + ");

  return [
    `Edicao e finalizacao de ${quantitySummary.total} itens (${compactServices}) conforme briefing aprovado.`,
    "Inclui organizacao do material, cortes, ritmo, acabamento visual e exportacao final em MP4.",
    `O projeto contempla ${revisoesText.toLowerCase()}`,
  ].join(" ");
}

function parseDetalhesAnswers(detalhes = {}) {
  const raw = detalhes?.respostasCompletas || detalhes?.answers || detalhes?.respostas || null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

function parseMoneyNumber(value, fallback = 0) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const normalized = raw
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatComparativeOptions(qtyBase, totalBase) {
  const safeQty = Math.max(1, Math.round(Number(qtyBase || 0) || 1));
  const safeTotal = Number(totalBase || 0) > 0 ? Number(totalBase) : (safeQty * 170);
  const unitBase = safeTotal / safeQty;
  const qty2 = Math.max(safeQty + 1, Math.round(safeQty * 1.5));
  const qty3 = Math.max(30, Math.round(safeQty * 3));
  const discount2 = qty2 >= 30 ? 12 : (qty2 >= 20 ? 8 : (qty2 >= 10 ? 5 : (qty2 >= 5 ? 3 : 0)));
  const discount3 = qty3 >= 30 ? 12 : (qty3 >= 20 ? 8 : (qty3 >= 10 ? 5 : (qty3 >= 5 ? 3 : 0)));
  const unit2 = unitBase * (1 - (discount2 / 100));
  const unit3 = unitBase * (1 - (discount3 / 100));
  const total2 = qty2 * unit2;
  const total3 = qty3 * unit3;

  return {
    opcao1_titulo: "Pedido atual",
    opcao1_qtd: `${safeQty} videos`,
    opcao1_preco: formatMoney(safeTotal),
    opcao1_unitario: `${formatMoney(unitBase)} por video`,
    opcao1_desc: "Sem desconto aplicado",
    opcao1_desconto: "",
    opcao2_titulo: "Mais volume",
    opcao2_qtd: `${qty2} videos`,
    opcao2_preco: formatMoney(total2),
    opcao2_unitario: `${formatMoney(unit2)} por video`,
    opcao2_desc: discount2 > 0 ? `Desconto aplicado: ${discount2}%` : "Sem desconto aplicado",
    opcao2_desconto: discount2 > 0 ? `-${discount2}%` : "",
    opcao3_titulo: "Melhor custo-beneficio",
    opcao3_qtd: `${qty3} videos`,
    opcao3_preco: formatMoney(total3),
    opcao3_unitario: `${formatMoney(unit3)} por video`,
    opcao3_desc: discount3 > 0 ? `Desconto aplicado: ${discount3}%` : "Sem desconto aplicado",
    opcao3_desconto: discount3 > 0 ? `-${discount3}%` : "",
    texto_comparativo: "",
  };
}

function splitCondicoesText(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => normalizeTemplateText(line, 260, { allowEmpty: true }))
    .filter(Boolean);
}

function getOfficialWhatsapp(env, detalhes) {
  const envValue = firstEnvValue(env, [
    "WHATSAPP_HAGAV",
    "HAGAV_WHATSAPP",
    "HAGAV_WHATSAPP_OFICIAL",
    "NEXT_PUBLIC_WHATSAPP_HAGAV",
    "NEXT_PUBLIC_HAGAV_WHATSAPP",
  ]);
  const fromDetalhes = firstNonEmptyValue(
    detalhes?.comercial?.whatsapp_hagav,
    detalhes?.whatsapp_hagav
  );
  return formatWhatsapp(envValue || fromDetalhes || "5573982284382");
}

const PROPOSAL_MODES = new Set(["direta", "opcoes", "mensal", "personalizada"]);
const TEMPLATE_OVERRIDE_ALLOWLIST = new Set([
  "cliente_nome",
  "nome_cliente",
  "whatsapp",
  "empresa",
  "instagram",
  "email_cliente",
  "email",
  "servico_principal",
  "quantidade",
  "quantidade_mensal",
  "prazo",
  "formato_entrega",
  "escopo_comercial",
  "escopo_mensal",
  "condicoes_comerciais",
  "valor_total_moeda",
  "valor_mensal_moeda",
  "valor_personalizado_moeda",
  "pacote_sugerido",
  "economia_total_moeda",
  "forma_pagamento",
  "data_validade",
  "data_emissao",
  "duracao_contrato_meses",
  "investimento_label",
  "referencia_texto",
  "observacao_adicional",
  "cta_aprovacao",
  "numero_proposta",
  "opcao1_titulo",
  "opcao1_qtd",
  "opcao1_preco",
  "opcao1_unitario",
  "opcao1_desc",
  "opcao1_desconto",
  "opcao2_titulo",
  "opcao2_qtd",
  "opcao2_preco",
  "opcao2_unitario",
  "opcao2_desc",
  "opcao2_desconto",
  "opcao3_titulo",
  "opcao3_qtd",
  "opcao3_preco",
  "opcao3_unitario",
  "opcao3_desc",
  "opcao3_desconto",
  "texto_comparativo",
]);

function normalizeProposalMode(rawValue) {
  const key = normalizeTemplateText(rawValue, 40, { allowEmpty: true })
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!key) return "";
  if (key.includes("direta")) return "direta";
  if (key.includes("opcao")) return "opcoes";
  if (key.includes("mensal") || key.includes("recorrente")) return "mensal";
  if (key.includes("personalizada") || key.includes("custom")) return "personalizada";
  return PROPOSAL_MODES.has(key) ? key : "";
}

function sanitizeTemplateOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizePlaceholderKey(rawKey);
    if (!key || !TEMPLATE_OVERRIDE_ALLOWLIST.has(key)) continue;
    const value = normalizeTemplateText(rawValue, 1600, { allowEmpty: true });
    if (!value) continue;
    output[key] = value;
  }
  return output;
}

function proposalModeLabel(mode) {
  if (mode === "opcoes") return "Com opcoes";
  if (mode === "mensal") return "Mensal";
  if (mode === "personalizada") return "Personalizada";
  return "Direta";
}

function isTruthyFlag(value) {
  if (value === true) return true;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim";
}

function buildTemplateValues(row, env, options = {}) {
  const requestedMode = normalizeProposalMode(options?.proposalMode);
  const templateOverrides = sanitizeTemplateOverrides(options?.templateOverrides);
  const detalhes = readDetalhes(row);
  const comercial = (detalhes?.comercial && typeof detalhes.comercial === "object")
    ? detalhes.comercial
    : {};
  const calculo = (detalhes?.calculoAutomatico && typeof detalhes.calculoAutomatico === "object")
    ? detalhes.calculoAutomatico
    : {};
  const respostas = parseDetalhesAnswers(detalhes);
  const flowHintMode = String(row?.fluxo || "").toUpperCase() === "DR" ? "mensal" : "direta";
  const savedMode = normalizeProposalMode(firstNonEmptyValue(comercial?.proposta_modo, comercial?.proposal_mode));
  const proposalMode = requestedMode || savedMode || flowHintMode || "direta";

  const dataHojeIso = new Date().toISOString();
  const serviceItems = extractServiceItems(row, detalhes);
  const quantitySummary = buildQuantitySummary(serviceItems);
  const qtyTotal = Math.max(1, Number(quantitySummary?.total || 1));
  const primaryService = serviceItems.length > 1
    ? `Multiplos servicos (${serviceItems.length})`
    : (serviceItems[0]?.servico || "Conteudo audiovisual");
  const quantidade = serviceItems.length > 1
    ? `${quantitySummary.quantityLabel} (${quantitySummary.breakdown})`
    : quantitySummary.quantityLabel;

  const empresa = firstNonEmptyValue(
    comercial?.empresa,
    detalhes?.empresa,
    respostas?.empresa,
    row?.empresa
  );
  const instagram = firstNonEmptyValue(
    comercial?.instagram,
    detalhes?.instagram,
    respostas?.instagram,
    row?.instagram
  );
  const emailCliente = firstNonEmptyValue(
    comercial?.email_cliente,
    comercial?.email,
    detalhes?.email_cliente,
    detalhes?.email,
    respostas?.email_cliente,
    respostas?.email,
    row?.email
  );

  const prazo = firstNonEmptyValue(
    comercial?.prazo,
    detalhes?.prazo,
    row?.prazo,
    respostas?.flow_prazo,
    respostas?.unica_prazo,
    respostas?.rec_inicio,
    "A combinar"
  );
  const referenciaRaw = firstNonEmptyValue(
    templateOverrides?.referencia_texto,
    comercial?.referencia_texto,
    comercial?.referencia_publica,
    detalhes?.referencia,
    row?.referencia,
    respostas?.flow_referencia,
    respostas?.unica_referencia,
    respostas?.rec_referencia,
    ""
  );
  const referenciaCliente = normalizeReferenceText(referenciaRaw);
  const observacaoManual = normalizeObservationForClient(
    firstNonEmptyValue(
      templateOverrides?.observacao_adicional,
      comercial?.observacao_adicional,
      detalhes?.observacao_adicional,
      respostas?.extras,
      ""
    )
  );
  const precoBaseNum = Number(calculo?.precoBase ?? row?.preco_base ?? 0);
  const precoFinalNum = Number(
    comercial?.preco_final
    ?? row?.preco_final
    ?? calculo?.precoFinal
    ?? row?.valor_sugerido
    ?? row?.preco_base
    ?? 0
  );
  const valorSugeridoNum = Number(
    calculo?.valorSugerido
    ?? row?.valor_sugerido
    ?? row?.preco_final
    ?? row?.preco_base
    ?? comercial?.preco_final
    ?? 0
  );
  const valorTotalNum = Number(
    comercial?.valor_total
    ?? row?.preco_final
    ?? calculo?.precoFinal
    ?? row?.valor_sugerido
    ?? row?.preco_base
    ?? 0
  );
  const baseUnitValue = qtyTotal > 0
    ? Number((precoBaseNum || valorSugeridoNum || precoFinalNum || 0) / qtyTotal)
    : 0;
  const economiaTotalNum = Number(calculo?.economiaTotal ?? row?.economia_total ?? 0);
  const discountPercent = Number(calculo?.descontoVolumePercent ?? row?.desconto_volume_percent ?? 0);
  const subtotalReference = Math.max(precoBaseNum, baseUnitValue * qtyTotal);
  const totalReferenceWithDiscount = Math.max(precoFinalNum, subtotalReference - economiaTotalNum);
  const pacoteSugerido = firstNonEmptyValue(
    templateOverrides?.pacote_sugerido,
    comercial?.pacote_sugerido,
    row?.pacote_sugerido,
    calculo?.pacoteSugerido,
    primaryService
  );
  const escopo = firstNonEmptyValue(
    templateOverrides?.escopo_comercial,
    comercial?.descricao_escopo,
    comercial?.escopo_comercial,
    buildCommercialScope({
      serviceItems,
      quantitySummary,
      revisoesText: normalizeRevisoesText(
        firstNonEmptyValue(comercial?.revisoes_inclusas, detalhes?.revisoes_inclusas, "1 rodada")
      ),
    })
  );
  const clienteNome = firstNonEmptyValue(
    templateOverrides?.cliente_nome,
    templateOverrides?.nome_cliente,
    comercial?.cliente_nome,
    row?.nome,
    detalhes?.nome,
    "-"
  );
  const whatsappCliente = formatWhatsapp(firstNonEmptyValue(
    templateOverrides?.whatsapp,
    comercial?.whatsapp,
    row?.whatsapp,
    detalhes?.whatsapp,
    ""
  ));
  const propostaNumero = normalizeTemplateText(
    firstNonEmptyValue(templateOverrides?.numero_proposta, comercial?.numero_proposta, `PROP-${row?.id || "-"}`),
    80
  );
  const dataEmissao = firstNonEmptyValue(
    templateOverrides?.data_emissao,
    comercial?.data_emissao,
    formatDateBr(dataHojeIso)
  );
  const formaPagamento = firstNonEmptyValue(
    templateOverrides?.forma_pagamento,
    comercial?.forma_pagamento,
    detalhes?.forma_pagamento,
    "PIX / Transferencia / A combinar"
  );
  const condicaoPagamento = firstNonEmptyValue(
    comercial?.condicao_pagamento,
    detalhes?.condicao_pagamento,
    "A vista / Conforme combinado"
  );
  const revisoesInclusas = firstNonEmptyValue(
    comercial?.revisoes_inclusas,
    detalhes?.revisoes_inclusas,
    "1 rodada"
  );
  const formatoEntrega = firstNonEmptyValue(
    comercial?.formato_entrega,
    detalhes?.formato_entrega,
    "Arquivo final pronto para publicacao em MP4."
  );
  const dataValidadeInput = firstNonEmptyValue(
    templateOverrides?.data_validade,
    comercial?.data_validade,
    row?.validade_ate
  );
  const dataValidadeFormatted = dataValidadeInput ? formatDateBr(dataValidadeInput) : "";
  const dataValidade = (dataValidadeFormatted && dataValidadeFormatted !== "-")
    ? dataValidadeFormatted
    : formatDatePlusDaysBr(dataHojeIso, 7);
  const condicoesDefault = [
    `Forma de pagamento: ${formaPagamento}.`,
    `Proposta valida ate ${dataValidade}.`,
    "O projeto inicia apos aprovacao e envio dos materiais.",
    "Inclui 1 rodada de ajustes por entrega. Alteracoes de estrutura, roteiro, estilo ou escopo podem gerar novo orcamento.",
  ];
  const condicoesComerciais = firstNonEmptyValue(
    templateOverrides?.condicoes_comerciais,
    comercial?.condicoes_comerciais,
    condicoesDefault.join("\n")
  );
  const condicoesLinhas = splitCondicoesText(condicoesComerciais);

  const valorTotalBase = Number(
    parseMoneyNumber(templateOverrides?.valor_total_moeda, 0)
    || parseMoneyNumber(comercial?.valor_total_moeda, 0)
    || valorTotalNum
  );
  const valorMensal = firstNonEmptyValue(
    templateOverrides?.valor_mensal_moeda,
    comercial?.valor_mensal_moeda
  );
  const valorPersonalizado = firstNonEmptyValue(
    templateOverrides?.valor_personalizado_moeda,
    comercial?.valor_personalizado_moeda
  );
  let valorTotalMoeda = firstNonEmptyValue(
    templateOverrides?.valor_total_moeda,
    comercial?.valor_total_moeda,
    formatMoney(valorTotalBase, { withCurrency: true })
  );
  if (proposalMode === "mensal") {
    const mensalDisplay = firstNonEmptyValue(valorMensal, valorTotalMoeda);
    if (mensalDisplay) {
      valorTotalMoeda = /\/m[eÃª]s/i.test(mensalDisplay)
        ? mensalDisplay
        : `${mensalDisplay}/mÃªs`;
    }
  }
  if (proposalMode === "personalizada") {
    valorTotalMoeda = firstNonEmptyValue(valorPersonalizado, valorTotalMoeda);
  }

  const qtyForOptions = parseQuantityNumber(firstNonEmptyValue(templateOverrides?.quantidade, comercial?.quantidade, quantidade));
  const optionsDefaults = formatComparativeOptions(qtyForOptions, parseMoneyNumber(valorTotalMoeda, valorTotalBase));

  const opcao1Titulo = firstNonEmptyValue(templateOverrides?.opcao1_titulo, comercial?.opcao1_titulo, optionsDefaults.opcao1_titulo);
  const opcao1Qtd = firstNonEmptyValue(templateOverrides?.opcao1_qtd, comercial?.opcao1_qtd, optionsDefaults.opcao1_qtd);
  const opcao1Preco = firstNonEmptyValue(templateOverrides?.opcao1_preco, comercial?.opcao1_preco, optionsDefaults.opcao1_preco);
  const opcao1Unitario = firstNonEmptyValue(templateOverrides?.opcao1_unitario, comercial?.opcao1_unitario, optionsDefaults.opcao1_unitario);
  const opcao1Desc = firstNonEmptyValue(templateOverrides?.opcao1_desc, comercial?.opcao1_desc, optionsDefaults.opcao1_desc);
  const opcao1Desconto = firstNonEmptyValue(templateOverrides?.opcao1_desconto, comercial?.opcao1_desconto, optionsDefaults.opcao1_desconto);

  const opcao2Titulo = firstNonEmptyValue(templateOverrides?.opcao2_titulo, comercial?.opcao2_titulo, optionsDefaults.opcao2_titulo);
  const opcao2Qtd = firstNonEmptyValue(templateOverrides?.opcao2_qtd, comercial?.opcao2_qtd, optionsDefaults.opcao2_qtd);
  const opcao2Preco = firstNonEmptyValue(templateOverrides?.opcao2_preco, comercial?.opcao2_preco, optionsDefaults.opcao2_preco);
  const opcao2Unitario = firstNonEmptyValue(templateOverrides?.opcao2_unitario, comercial?.opcao2_unitario, optionsDefaults.opcao2_unitario);
  const opcao2Desc = firstNonEmptyValue(templateOverrides?.opcao2_desc, comercial?.opcao2_desc, optionsDefaults.opcao2_desc);
  const opcao2Desconto = firstNonEmptyValue(templateOverrides?.opcao2_desconto, comercial?.opcao2_desconto, optionsDefaults.opcao2_desconto);

  const opcao3Titulo = firstNonEmptyValue(templateOverrides?.opcao3_titulo, comercial?.opcao3_titulo, optionsDefaults.opcao3_titulo);
  const opcao3Qtd = firstNonEmptyValue(templateOverrides?.opcao3_qtd, comercial?.opcao3_qtd, optionsDefaults.opcao3_qtd);
  const opcao3Preco = firstNonEmptyValue(templateOverrides?.opcao3_preco, comercial?.opcao3_preco, optionsDefaults.opcao3_preco);
  const opcao3Unitario = firstNonEmptyValue(templateOverrides?.opcao3_unitario, comercial?.opcao3_unitario, optionsDefaults.opcao3_unitario);
  const opcao3Desc = firstNonEmptyValue(templateOverrides?.opcao3_desc, comercial?.opcao3_desc, optionsDefaults.opcao3_desc);
  const opcao3Desconto = firstNonEmptyValue(templateOverrides?.opcao3_desconto, comercial?.opcao3_desconto, optionsDefaults.opcao3_desconto);
  const textoComparativo = firstNonEmptyValue(
    templateOverrides?.texto_comparativo,
    comercial?.texto_comparativo,
    optionsDefaults.texto_comparativo
  );

  const quantidadeMensal = firstNonEmptyValue(
    templateOverrides?.quantidade_mensal,
    comercial?.quantidade_mensal,
    proposalMode === "mensal" ? quantidade : ""
  );
  const duracaoMensal = firstNonEmptyValue(
    templateOverrides?.duracao_contrato_meses,
    comercial?.duracao_contrato_meses,
    proposalMode === "mensal" ? "3" : ""
  );
  const escopoMensal = firstNonEmptyValue(
    templateOverrides?.escopo_mensal,
    comercial?.escopo_mensal,
    proposalMode === "mensal" ? escopo : ""
  );
  const valorMensalFinal = firstNonEmptyValue(valorMensal, proposalMode === "mensal" ? valorTotalMoeda : "");
  const investimentoLabel = firstNonEmptyValue(
    templateOverrides?.investimento_label,
    proposalMode === "mensal" ? "Valor mensal" : "Valor total"
  );
  const unitLabel = inferUnitByService(primaryService, 1);
  const economiaTotalTexto = economiaTotalNum > 0
    ? formatMoney(economiaTotalNum)
    : "Sem economia por escala";
  const descontoAplicadoTexto = discountPercent > 0 || economiaTotalNum > 0
    ? `Faixa aplicada: ${discountPercent > 0 ? `${Math.round(discountPercent)}%` : "ajuste protegido"} com economia de ${formatMoney(economiaTotalNum)}.`
    : "Nesta proposta, nao foi aplicado desconto progressivo por volume.";

  const revisoesTexto = normalizeRevisoesText(revisoesInclusas);
  const whatsappHagav = getOfficialWhatsapp(env, detalhes);
  const logoUrl = firstNonEmptyValue(
    comercial?.logo_url,
    detalhes?.logo_url,
    firstEnvValue(env, ["PROPOSTA_LOGO_URL", "HAGAV_LOGO_URL", "NEXT_PUBLIC_HAGAV_LOGO_URL"]),
    "https://hagav.com.br/assets/hagav-master-horizontal-transparente-4000.png"
  );

  const base = {
    id: normalizeTemplateText(row?.id || "-", 80),
    proposta_numero: propostaNumero,
    numero_proposta: propostaNumero,
    data_emissao: dataEmissao,
    data_hoje: formatDateBr(dataHojeIso),
    data_criacao: formatDateBr(row?.created_at || dataHojeIso),
    data_validade: dataValidade,
    validade_dias: "7",
    validade_comercial: dataValidade,
    logo_url: logoUrl,
    cliente_nome: clienteNome,
    nome_cliente: clienteNome,
    nome: clienteNome,
    empresa,
    instagram,
    email_cliente: emailCliente,
    whatsapp: whatsappCliente || "-",
    whatsapp_cliente: whatsappCliente || "-",
    whatsapp_hagav: whatsappHagav || "-",
    servico: primaryService,
    servico_plano: primaryService,
    plano_servico: primaryService,
    servico_principal: primaryService,
    formato_entrega: formatoEntrega,
    formato_entrega_curto: "MP4 pronto para publicacao",
    escopo,
    escopo_comercial: escopo,
    escopo_mensal: escopoMensal,
    descricao_escopo: escopo,
    resumo_orcamento: escopo,
    quantidade,
    quantidade_mensal: quantidadeMensal,
    prazo,
    preco_base: formatMoney(precoBaseNum),
    valor_base: formatMoney(precoBaseNum),
    preco_final: formatMoney(precoFinalNum),
    valor_final: formatMoney(precoFinalNum),
    valor_sugerido: formatMoney(valorSugeridoNum),
    valor_total: formatMoney(valorTotalNum, { withCurrency: false }),
    valor_total_moeda: valorTotalMoeda,
    valor_mensal_moeda: valorMensalFinal,
    valor_personalizado_moeda: valorPersonalizado,
    investimento_label: investimentoLabel,
    valor_unitario_referencia: `${formatMoney(baseUnitValue)} por ${unitLabel}`,
    desconto_tabela_15: pacoteSugerido || "-",
    desconto_tabela_30: economiaTotalTexto,
    desconto_aplicado_texto: descontoAplicadoTexto,
    subtotal_referencia_moeda: formatMoney(subtotalReference),
    total_referencia_com_desconto_moeda: formatMoney(totalReferenceWithDiscount),
    pacote_sugerido: pacoteSugerido,
    economia_total_moeda: economiaTotalTexto,
    condicao_pagamento: condicaoPagamento,
    forma_pagamento: formaPagamento,
    condicoes_comerciais: condicoesComerciais,
    condicao_linha_1: condicoesLinhas[0] || "",
    condicao_linha_2: condicoesLinhas[1] || "",
    condicao_linha_3: condicoesLinhas[2] || "",
    condicao_linha_4: condicoesLinhas[3] || "",
    condicao_linha_1_style: condicoesLinhas[0] ? "display:block;" : "display:none;",
    condicao_linha_2_style: condicoesLinhas[1] ? "display:block;" : "display:none;",
    condicao_linha_3_style: condicoesLinhas[2] ? "display:block;" : "display:none;",
    condicao_linha_4_style: condicoesLinhas[3] ? "display:block;" : "display:none;",
    revisoes_inclusas: revisoesTexto,
    revisoes_inclusas_texto: revisoesTexto,
    inicio_producao_texto: "O projeto inicia apos aprovacao e envio dos materiais.",
    ajustes_texto: "Inclui 1 rodada de ajustes. Alteracoes adicionais ou mudancas de escopo podem gerar novo orcamento.",
    cta_aprovacao: "Aprovar proposta no WhatsApp",
    observacao_adicional: observacaoManual.text,
    observacoes_bloco_style: observacaoManual.show ? "display:block;" : "display:none;",
    referencia_texto: referenciaCliente.text,
    referencia_bloco_style: referenciaCliente.show ? "display:block;" : "display:none;",
    resumo_quantidade_breakdown: quantitySummary.breakdown,
    modo_proposta: proposalMode,
    modo_proposta_label: proposalModeLabel(proposalMode),
    opcoes_bloco_style: proposalMode === "opcoes" ? "display:block;" : "display:none;",
    investimento_bloco_style: proposalMode === "opcoes" ? "display:none;" : "display:block;",
    mensal_bloco_style: proposalMode === "mensal" ? "display:block;" : "display:none;",
    personalizada_bloco_style: proposalMode === "personalizada" ? "display:block;" : "display:none;",
    empresa_bloco_style: empresa ? "display:block;" : "display:none;",
    instagram_bloco_style: instagram ? "display:block;" : "display:none;",
    email_bloco_style: emailCliente ? "display:block;" : "display:none;",
    duracao_contrato_meses: duracaoMensal,
    opcao1_titulo: opcao1Titulo,
    opcao1_qtd: opcao1Qtd,
    opcao1_preco: opcao1Preco,
    opcao1_unitario: opcao1Unitario,
    opcao1_desc: opcao1Desc,
    opcao1_desconto: opcao1Desconto,
    opcao1_desconto_style: opcao1Desconto ? "display:flex;" : "display:none;",
    opcao2_titulo: opcao2Titulo,
    opcao2_qtd: opcao2Qtd,
    opcao2_preco: opcao2Preco,
    opcao2_unitario: opcao2Unitario,
    opcao2_desc: opcao2Desc,
    opcao2_desconto: opcao2Desconto,
    opcao2_desconto_style: opcao2Desconto ? "display:flex;" : "display:none;",
    opcao3_titulo: opcao3Titulo,
    opcao3_qtd: opcao3Qtd,
    opcao3_preco: opcao3Preco,
    opcao3_unitario: opcao3Unitario,
    opcao3_desc: opcao3Desc,
    opcao3_desconto: opcao3Desconto,
    opcao3_desconto_style: opcao3Desconto ? "display:flex;" : "display:none;",
    texto_comparativo: textoComparativo,
    texto_comparativo_style: textoComparativo ? "display:block;" : "display:none;",
  };

  Object.assign(base, templateOverrides);
  if (base.cliente_nome || base.nome_cliente) {
    const nome = firstNonEmptyValue(base.cliente_nome, base.nome_cliente);
    base.cliente_nome = nome;
    base.nome_cliente = nome;
    base.nome = nome;
  }
  if (base.whatsapp) {
    base.whatsapp_cliente = base.whatsapp;
  }
  if (base.servico_principal) {
    base.servico = base.servico_principal;
    base.servico_plano = base.servico_principal;
    base.plano_servico = base.servico_principal;
  }
  if (base.escopo_comercial) {
    base.escopo = base.escopo_comercial;
    base.descricao_escopo = base.escopo_comercial;
    base.resumo_orcamento = base.escopo_comercial;
  }
  if (String(base.modo_proposta || "") === "mensal" && base.valor_mensal_moeda) {
    base.valor_total_moeda = base.valor_mensal_moeda;
  }
  if (String(base.modo_proposta || "") === "personalizada" && base.valor_personalizado_moeda) {
    base.valor_total_moeda = base.valor_personalizado_moeda;
  }

  const expanded = {};
  for (const [key, value] of Object.entries(base)) {
    const normalized = normalizeTemplateText(value, 1600, { allowEmpty: true });
    expanded[key] = normalized;
    expanded[key.toUpperCase()] = normalized;
  }
  return expanded;
}

const PROPOSTA_TEMPLATE_PATH = "/templates/proposta-hagav-template.html";

async function loadOfficialPropostaTemplate(request, env, templatePath = PROPOSTA_TEMPLATE_PATH) {
  const safeTemplatePath = normalizeTemplateText(templatePath, 240, { allowEmpty: true }) || PROPOSTA_TEMPLATE_PATH;
  const templateUrl = new URL(safeTemplatePath, request.url).toString();
  const readErrors = [];

  if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
    try {
      const response = await env.ASSETS.fetch(new Request(templateUrl, { method: "GET" }));
      if (response?.ok) {
        const html = await response.text();
        if (String(html || "").trim()) {
          return { html, source: "assets", templatePath: safeTemplatePath };
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
        return { html, source: "http", templatePath: safeTemplatePath };
      }
    }
    readErrors.push(`http_${response?.status || 0}`);
  } catch (err) {
    readErrors.push(`http_fetch_${stripDangerousText(String(err?.message || "erro_desconhecido"), 120)}`);
  }

  const error = new Error(`template_not_found:${safeTemplatePath}:${readErrors.join("|")}`);
  error.code = "template_not_found";
  error.templatePath = safeTemplatePath;
  throw error;
}

async function renderPropostaTemplateToLines(row, request, env, options = {}) {
  const templateInfo = await loadOfficialPropostaTemplate(request, env, options?.templatePath);
  const values = buildTemplateValues(row, env, {
    proposalMode: options?.proposalMode,
    templateOverrides: options?.templateOverrides,
  });
  const rendered = applyTemplatePlaceholders(templateInfo.html, values);
  const renderedHtml = ensureHtmlDocument(rendered.html);
  const htmlDiagnostics = inspectRenderedHtml(renderedHtml);

  return {
    renderedHtml,
    htmlDiagnostics,
    placeholdersTotal: rendered.placeholdersTotal,
    placeholdersSubstituidos: rendered.placeholdersSubstituidos,
    placeholdersRestantes: rendered.placeholdersRestantes,
    templateSource: templateInfo.source,
    templatePath: templateInfo.templatePath,
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

async function updatePdfLink(config, row, linkPdf, pdfMeta = {}) {
  const detalhes = readDetalhes(row);
  const comercial = (detalhes?.comercial && typeof detalhes.comercial === "object")
    ? detalhes.comercial
    : {};
  const nowIso = new Date().toISOString();
  const renderMode = stripDangerousText(String(pdfMeta?.render_mode || ""), 80);
  const pdfEngine = stripDangerousText(String(pdfMeta?.pdf_engine || ""), 80);
  const pdfFallbackUsed = Boolean(pdfMeta?.pdf_fallback_used);
  const pdfFallbackFrom = stripDangerousText(String(pdfMeta?.pdf_fallback_from || ""), 80);
  const pdfFallbackReason = stripDangerousText(String(pdfMeta?.pdf_fallback_reason || ""), 120);
  const proposalMode = normalizeProposalMode(pdfMeta?.proposal_mode);
  const pdfComercialLiberado = Boolean(
    linkPdf
    && pdfEngine
    && renderMode
    && renderMode !== "native_text_fallback"
    && pdfEngine !== "native_text"
    && !pdfFallbackUsed
  );

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
            proposta_pdf_render_mode: renderMode,
            proposta_pdf_engine: pdfEngine,
            proposta_pdf_fallback_used: pdfFallbackUsed,
            proposta_pdf_fallback_from: pdfFallbackFrom,
            proposta_pdf_fallback_reason: pdfFallbackReason,
            proposta_pdf_comercial_liberado: pdfComercialLiberado,
            proposta_modo: proposalMode || comercial?.proposta_modo || "direta",
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

  const rateState = applyRateLimit({
    namespace: 'admin-proposta-pdf',
    key: getClientIp(request) || 'anonymous',
    limit: 20,
    windowMs: 60 * 1000,
    blockMs: 60 * 1000,
  });
  if (!rateState.ok) {
    return fail(requestId, 'rate_limit', 'rate_limited', 429, { retry_after_seconds: rateState.retryAfterSeconds });
  }

  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['operacao', 'comercial', 'admin'],
    allowBearer: true,
    allowCookie: true,
  });
  if (!auth.ok) {
    return fail(requestId, 'auth', auth.reason, auth.status || 401);
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
  const proposalMode = normalizeProposalMode(
    firstNonEmptyValue(
      body?.proposal_mode,
      body?.modo_proposta,
      body?.modo,
      body?.mode
    )
  );
  const templateOverrides = {
    ...sanitizeTemplateOverrides(body),
    ...sanitizeTemplateOverrides(body?.template_overrides),
  };
  const testMode = isTruthyFlag(body?.test_mode) || isTruthyFlag(body?.modo_teste) || isTruthyFlag(body?.preview_mode);

  const getResult = await fetchSupabase(
    config,
    `/rest/v1/deals?id=eq.${encodeURIComponent(id)}&select=id,created_at,nome,whatsapp,servico,quantidade,material_gravado,tempo_bruto,prazo,referencia,resumo_orcamento,preco_base,preco_final,valor_sugerido,pacote_sugerido,status,observacoes,observacoes_internas,validade_ate,link_pdf,detalhes,origem,fluxo&limit=1`
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
    rendered = await renderPropostaTemplateToLines(row, request, env, {
      proposalMode,
      templateOverrides,
    });
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
  const {
    renderedHtml,
    htmlDiagnostics,
    placeholdersTotal,
    placeholdersSubstituidos,
    placeholdersRestantes,
    templateSource,
    templatePath
  } = rendered;
  const {
    htmlHasStyleTag,
    htmlHasHeaderClass,
    htmlPreviewFirst300Chars,
    htmlHasDoctype,
    htmlHasHtmlTag,
    htmlHasHeadTag,
    htmlHasBodyTag,
  } = htmlDiagnostics || {};
  logPdf(requestId, "template_render", "Template renderizado para proposta", {
    template_source: templateSource,
    template_path: templatePath,
    proposal_mode: proposalMode || "direta",
    test_mode: testMode,
    template_overrides_count: Object.keys(templateOverrides || {}).length,
    placeholders_total: Number(placeholdersTotal || 0),
    placeholders_substituidos: Number(placeholdersSubstituidos || 0),
    placeholders_restantes: Array.isArray(placeholdersRestantes) ? placeholdersRestantes : [],
    html_has_style_tag: Boolean(htmlHasStyleTag),
    html_has_header_class: Boolean(htmlHasHeaderClass),
    html_has_doctype: Boolean(htmlHasDoctype),
    html_has_html_tag: Boolean(htmlHasHtmlTag),
    html_has_head_tag: Boolean(htmlHasHeadTag),
    html_has_body_tag: Boolean(htmlHasBodyTag),
    html_preview_first_300_chars: String(htmlPreviewFirst300Chars || ""),
  });
  if (Array.isArray(placeholdersRestantes) && placeholdersRestantes.length > 0) {
    return fail(requestId, "template_placeholder", "template_placeholders_missing", 422, {
      template_source: templateSource,
      template_path: templatePath,
      placeholders_total: Number(placeholdersTotal || 0),
      placeholders_substituidos: Number(placeholdersSubstituidos || 0),
      placeholders_restantes: placeholdersRestantes,
      html_has_style_tag: Boolean(htmlHasStyleTag),
      html_has_header_class: Boolean(htmlHasHeaderClass),
      html_preview_first_300_chars: String(htmlPreviewFirst300Chars || ""),
    });
  }

  const pdfRender = await renderHtmlToPdf(renderedHtml, env);
  if (!pdfRender.ok) {
    return fail(requestId, "pdf_render", pdfRender.reason || "pdf_render_failed", pdfRender.status || 502, {
      detail: previewRawResponse(String(pdfRender.detail || "html_to_pdf_render_failed"), 320),
      template_source: templateSource,
      template_path: templatePath,
      render_mode: String(pdfRender.renderMode || "remote_html_to_pdf"),
      pdf_engine: String(pdfRender.pdfEngine || "unknown"),
      provider_status: Number(pdfRender.providerStatus || 0) || undefined,
      provider_content_type: String(pdfRender.providerContentType || ""),
      provider_body_preview: String(pdfRender.providerBodyPreview || ""),
      provider_endpoint: String(pdfRender.providerEndpoint || ""),
      provider_auth_mode: String(pdfRender.providerAuthMode || ""),
      html_has_style_tag: Boolean(htmlHasStyleTag),
      html_has_header_class: Boolean(htmlHasHeaderClass),
      html_preview_first_300_chars: String(htmlPreviewFirst300Chars || ""),
    });
  }
  const pdfContent = pdfRender.pdfBytes;
  const pdfBytes = Number(pdfContent?.byteLength || 0);
  const renderMode = String(pdfRender.renderMode || "remote_html_to_pdf");
  const pdfEngine = String(pdfRender.pdfEngine || "unknown");
  const fallbackUsed = Boolean(pdfRender?.fallbackFrom);
  logPdf(requestId, "pdf_render", "PDF gerado a partir do HTML renderizado", {
    render_mode: renderMode,
    pdf_engine: pdfEngine,
    pdf_bytes: pdfBytes,
    fallback_used: fallbackUsed,
    fallback_from: String(pdfRender?.fallbackFrom || ""),
    fallback_reason: String(pdfRender?.fallbackReason || ""),
    provider_status: Number(pdfRender.providerStatus || 0) || undefined,
    provider_content_type: String(pdfRender.providerContentType || ""),
    provider_endpoint: String(pdfRender.providerEndpoint || ""),
    provider_auth_mode: String(pdfRender.providerAuthMode || ""),
    proposal_mode: proposalMode || "direta",
    test_mode: testMode,
    html_has_style_tag: Boolean(htmlHasStyleTag),
    html_has_header_class: Boolean(htmlHasHeaderClass),
  });

  const fileName = `orcamento-${id}-${Date.now()}.pdf`;
  const uploadResult = await uploadPdfIfPossible(config, env, pdfContent, fileName);
  if (!uploadResult.ok) {
    return fail(requestId, "upload", "pdf_upload_failed", 502, {
      upload_reason: stripDangerousText(String(uploadResult.reason || "upload_failed"), 180),
      file_name: fileName,
      template_source: templateSource,
      template_path: templatePath,
      render_mode: renderMode,
      pdf_engine: pdfEngine,
      pdf_fallback_used: fallbackUsed,
      pdf_fallback_from: String(pdfRender?.fallbackFrom || ""),
      pdf_fallback_reason: String(pdfRender?.fallbackReason || ""),
      provider_status: Number(pdfRender.providerStatus || 0) || undefined,
      provider_content_type: String(pdfRender.providerContentType || ""),
      provider_body_preview: String(pdfRender.providerBodyPreview || ""),
      provider_endpoint: String(pdfRender.providerEndpoint || ""),
      provider_auth_mode: String(pdfRender.providerAuthMode || ""),
      html_has_style_tag: Boolean(htmlHasStyleTag),
      html_has_header_class: Boolean(htmlHasHeaderClass),
      html_preview_first_300_chars: String(htmlPreviewFirst300Chars || ""),
    });
  }

  let linkPdf = "";
  linkPdf = stripDangerousText(uploadResult.link || "", 1000);
  const updateResult = await updatePdfLink(config, row, linkPdf, {
    render_mode: renderMode,
    pdf_engine: pdfEngine,
    pdf_fallback_used: fallbackUsed,
    pdf_fallback_from: String(pdfRender?.fallbackFrom || ""),
    pdf_fallback_reason: String(pdfRender?.fallbackReason || ""),
    proposal_mode: proposalMode,
  });
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
    render_mode: renderMode,
    pdf_engine: pdfEngine,
    pdf_fallback_used: fallbackUsed,
    pdf_fallback_from: String(pdfRender?.fallbackFrom || ""),
    pdf_fallback_reason: String(pdfRender?.fallbackReason || ""),
    provider_status: Number(pdfRender.providerStatus || 0) || undefined,
    provider_content_type: String(pdfRender.providerContentType || ""),
    provider_body_preview: String(pdfRender.providerBodyPreview || ""),
    provider_endpoint: String(pdfRender.providerEndpoint || ""),
    provider_auth_mode: String(pdfRender.providerAuthMode || ""),
    html_has_style_tag: Boolean(htmlHasStyleTag),
    html_has_header_class: Boolean(htmlHasHeaderClass),
    html_preview_first_300_chars: String(htmlPreviewFirst300Chars || ""),
    html_rendered_preview: String(htmlPreviewFirst300Chars || ""),
    placeholders_total: Number(placeholdersTotal || 0),
    placeholders_substituidos: Number(placeholdersSubstituidos || 0),
    placeholders_restantes: Array.isArray(placeholdersRestantes) ? placeholdersRestantes : [],
    pdf_bytes: pdfBytes,
    request_id: requestId,
    pdf_base64: bytesToBase64(pdfContent)
  });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}



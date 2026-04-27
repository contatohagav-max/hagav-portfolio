import { authenticateRequest, getClientIp } from '../_utils/admin-auth.js';
import { applyRateLimit } from '../_utils/rate-limit.js';
import { normalizePrazoLabel } from '../../shared/pricing-engine.js';

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
  console.log(`[HAGAV][PDF][CONTRATO] ${message}`, payload);
}

function fail(requestId, stage, error, status, extra = {}) {
  logPdf(requestId, stage, "Falha no fluxo de contrato PDF", {
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

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
    .replace(/{{\s*[^{}]+\s*}}/g, "-")
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

function formatDateIfPresent(value, fallback = "-") {
  const normalized = normalizeTemplateText(value, 40, { allowEmpty: true });
  if (!normalized) return fallback;
  const asDate = formatDateBr(normalized);
  return asDate === "-" ? fallback : asDate;
}

function addMonthsAndFormat(value, months, fallback = "-") {
  const baseDate = new Date(value || "");
  if (Number.isNaN(baseDate.getTime())) return fallback;
  const safeMonths = Number.isFinite(Number(months)) ? Math.max(0, Math.round(Number(months))) : 0;
  baseDate.setMonth(baseDate.getMonth() + safeMonths);
  return formatDateBr(baseDate.toISOString());
}

function toIsoDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(value, months, fallback = "") {
  const baseDate = new Date(`${toIsoDate(value)}T12:00:00`);
  if (Number.isNaN(baseDate.getTime())) return fallback;
  const safeMonths = Number.isFinite(Number(months)) ? Math.max(0, Math.round(Number(months))) : 0;
  baseDate.setMonth(baseDate.getMonth() + safeMonths);
  return baseDate.toISOString().slice(0, 10);
}

function parseContractVersionValue(value) {
  if (Number.isFinite(Number(value))) {
    const parsed = Math.round(Number(value));
    return parsed > 0 ? parsed : 0;
  }
  const raw = String(value || "").trim();
  if (!/^\d{1,4}$/.test(raw)) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatContractVersion(version) {
  const safe = Math.max(1, Math.round(Number(version) || 1));
  return String(safe).padStart(2, "0");
}

function sanitizeContractInput(rawInput = {}) {
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
    ? rawInput
    : {};
  const numericDuracao = Math.max(1, Math.round(Number(input?.duracao_meses || 0) || 0));
  const numericValor = Number(input?.valor_total ?? input?.valor_final ?? input?.preco_final ?? NaN);

  const out = {
    nome_cliente: normalizeTemplateText(input?.nome_cliente ?? input?.cliente_nome, 180, { allowEmpty: true }),
    cpf_cnpj_cliente: normalizeTemplateText(input?.cpf_cnpj ?? input?.cpf_cnpj_cliente, 60, { allowEmpty: true }),
    email_cliente: normalizeTemplateText(input?.email_cliente, 140, { allowEmpty: true }),
    forma_pagamento: normalizeTemplateText(input?.forma_pagamento, 120, { allowEmpty: true }),
    pix: normalizeTemplateText(input?.pix ?? input?.chave_pix, 220, { allowEmpty: true }),
    resumo_servico: normalizeTemplateText(input?.resumo_servico, 1000, { allowEmpty: true }),
    responsavel: normalizeTemplateText(input?.responsavel, 120, { allowEmpty: true }),
    observacoes: normalizeTemplateText(input?.observacoes, 1200, { allowEmpty: true }),
    status: normalizeTemplateText(input?.status, 40, { allowEmpty: true }),
    recorrente: typeof input?.recorrente === "boolean" ? input.recorrente : undefined,
    duracao_meses: numericDuracao || undefined,
    valor_total: Number.isFinite(numericValor) ? numericValor : undefined,
  };

  return out;
}

function buildContractRuntimeData(row, contractInput = {}) {
  const detalhes = readDetalhes(row);
  const contratoAtual = (detalhes?.contrato && typeof detalhes.contrato === "object")
    ? detalhes.contrato
    : {};
  const nowIso = new Date().toISOString();
  const startIso = toIsoDate(nowIso) || toIsoDate(row?.created_at) || toIsoDate(Date.now());
  const duracaoMeses = Math.max(
    1,
    Math.round(
      Number(contractInput?.duracao_meses ?? contratoAtual?.duracao_meses ?? 12) || 12
    )
  );
  const endIso = addMonthsIso(startIso, duracaoMeses, startIso);
  const previousVersion = Math.max(
    parseContractVersionValue(contratoAtual?.numero_geracao),
    parseContractVersionValue(contratoAtual?.contractVersion),
    parseContractVersionValue(contratoAtual?.numeroGeracao),
    parseContractVersionValue(contratoAtual?.numero_contrato),
    parseContractVersionValue(contratoAtual?.contrato_numero)
  );
  const nextVersion = previousVersion + 1;
  const numeroContrato = formatContractVersion(nextVersion);
  const valorTotal = Number(
    contractInput?.valor_total
      ?? contratoAtual?.valor_total
      ?? contratoAtual?.valor_final
      ?? row?.valor_fechado
      ?? row?.preco_final
      ?? row?.valor_sugerido
      ?? 0
  );

  return {
    nowIso,
    startIso,
    endIso,
    duracaoMeses,
    previousVersion,
    nextVersion,
    numeroContrato,
    valorTotal: Number.isFinite(valorTotal) ? valorTotal : 0,
    contractOverride: {
      ...contractInput,
      numero_contrato: numeroContrato,
      contrato_numero: numeroContrato,
      numero_geracao: nextVersion,
      contractVersion: nextVersion,
      numeroGeracao: nextVersion,
      data_emissao: nowIso,
      data_inicio: startIso,
      data_fim: endIso,
      data_termino: endIso,
      vencimento: endIso,
      duracao_meses: duracaoMeses,
      valor_total: Number.isFinite(valorTotal) ? valorTotal : undefined,
      valor_final: Number.isFinite(valorTotal) ? valorTotal : undefined,
      preco_final: Number.isFinite(valorTotal) ? valorTotal : undefined,
      atualizado_em: nowIso,
    },
  };
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
    detalhes?.contrato?.whatsapp_hagav,
    detalhes?.comercial?.whatsapp_hagav,
    detalhes?.whatsapp_hagav,
  );
  return formatWhatsapp(envValue || fromDetalhes || "5573982284382");
}

function buildTemplateValues(row, env, runtime = {}) {
  const detalhes = readDetalhes(row);
  const contratoAtual = (detalhes?.contrato && typeof detalhes.contrato === "object") ? detalhes.contrato : {};
  const runtimeContract = (runtime?.contractOverride && typeof runtime.contractOverride === "object")
    ? runtime.contractOverride
    : {};
  const contrato = { ...contratoAtual, ...runtimeContract };
  const comercial = (detalhes?.comercial && typeof detalhes.comercial === "object") ? detalhes.comercial : {};
  const dataHojeIso = String(runtime?.nowIso || new Date().toISOString());

  const contratoNumero = normalizeTemplateText(
    firstNonEmptyValue(
      runtime?.numeroContrato,
      contrato?.numero_contrato,
      contrato?.contrato_numero,
      formatContractVersion(1)
    ),
    80
  );

  const clienteNome = firstNonEmptyValue(contrato?.nome_cliente, row?.nome, detalhes?.nome, "-");
  const empresaCliente = firstNonEmptyValue(
    contrato?.empresa_cliente,
    detalhes?.empresa_cliente,
    detalhes?.empresa,
    "Nao informado"
  );
  const cpfCnpjCliente = firstNonEmptyValue(
    contrato?.cpf_cnpj_cliente,
    detalhes?.cpf_cnpj_cliente,
    detalhes?.cpf_cnpj,
    "Nao informado"
  );
  const emailCliente = firstNonEmptyValue(
    contrato?.email_cliente,
    detalhes?.email_cliente,
    detalhes?.email,
    "Nao informado"
  );
  const enderecoCliente = firstNonEmptyValue(
    contrato?.endereco_cliente,
    detalhes?.endereco_cliente,
    detalhes?.endereco,
    "Nao informado"
  );
  const whatsappCliente = formatWhatsapp(
    firstNonEmptyValue(row?.whatsapp, contrato?.whatsapp_cliente, detalhes?.whatsapp, "")
  );

  const servico = firstNonEmptyValue(
    contrato?.servico,
    row?.servico,
    row?.pacote_sugerido,
    detalhes?.servico,
    "Servico audiovisual"
  );
  const quantidade = firstNonEmptyValue(
    contrato?.quantidade,
    detalhes?.quantidade,
    detalhes?.comercial?.quantidade,
    "1"
  );
  const descricaoServico = firstNonEmptyValue(
    contrato?.descricao_servico,
    contrato?.resumo_servico,
    detalhes?.descricao_servico,
    detalhes?.resumo_servico,
    row?.resumo_orcamento,
    detalhes?.resumo_orcamento,
    `Prestacao de servicos de ${servico} conforme escopo aprovado.`
  );
  const resumoServico = firstNonEmptyValue(
    contrato?.resumo_servico,
    contrato?.descricao_servico,
    row?.resumo_orcamento,
    detalhes?.resumo_orcamento,
    descricaoServico,
    servico
  );

  const valorTotalNum = Number(
    contrato?.valor_total
    ?? contrato?.valor_final
    ?? row?.valor_fechado
    ?? row?.preco_final
    ?? row?.valor_sugerido
    ?? 0
  );

  const formaPagamento = firstNonEmptyValue(
    contrato?.forma_pagamento,
    comercial?.forma_pagamento,
    detalhes?.forma_pagamento,
    "A combinar"
  );
  const pix = firstNonEmptyValue(
    contrato?.pix,
    contrato?.chave_pix,
    detalhes?.pix,
    detalhes?.chave_pix,
    "-"
  );
  const condicaoPagamento = firstNonEmptyValue(
    contrato?.condicao_pagamento,
    comercial?.condicao_pagamento,
    detalhes?.condicao_pagamento,
    "Conforme combinado"
  );

  const dataInicioRaw = firstNonEmptyValue(
    runtime?.startIso,
    contrato?.data_inicio,
    detalhes?.data_inicio,
    row?.created_at
  );
  const vencimentoRaw = firstNonEmptyValue(
    runtime?.endIso,
    contrato?.data_fim,
    contrato?.vencimento,
    row?.validade_ate,
    contrato?.data_termino
  );
  const duracaoMeses = Math.max(
    1,
    Math.round(Number(runtime?.duracaoMeses ?? contrato?.duracao_meses ?? 12) || 12)
  );
  const dataEmissao = formatDateIfPresent(contrato?.data_emissao, formatDateBr(dataHojeIso));
  const dataInicio = formatDateIfPresent(dataInicioRaw, formatDateBr(dataHojeIso));
  const vencimento = formatDateIfPresent(vencimentoRaw, formatDatePlusDaysBr(dataHojeIso, 30));
  const dataTermino = formatDateIfPresent(
    firstNonEmptyValue(contrato?.data_fim, contrato?.data_termino, vencimentoRaw),
    addMonthsAndFormat(dataInicioRaw, duracaoMeses, vencimento)
  );
  const dataAssinatura = formatDateIfPresent(contrato?.data_assinatura, formatDateBr(dataHojeIso));

  const tipoProjeto = firstNonEmptyValue(
    contrato?.tipo_projeto,
    contrato?.recorrente === false ? "Pontual" : "Recorrente"
  );
  const prazoResumo = normalizePrazoLabel(firstNonEmptyValue(
    contrato?.prazo_resumo,
    comercial?.prazo_resumo,
    detalhes?.prazo_resumo,
    detalhes?.prazo,
    row?.prazo,
    "Sem prazo definido"
  ), "Sem prazo definido");
  const renovacao = firstNonEmptyValue(
    contrato?.renovacao,
    contrato?.recorrente === false
      ? "Sem renovacao automatica."
      : "Renovacao mediante alinhamento comercial entre as partes."
  );

  const observacoes = normalizeTemplateText(
    firstNonEmptyValue(
      contrato?.observacoes,
      row?.observacoes_internas,
      detalhes?.observacoes
    ),
    1200,
    { allowEmpty: true }
  );

  const cidadeForo = firstNonEmptyValue(
    contrato?.cidade_foro,
    detalhes?.cidade_foro,
    firstEnvValue(env, ["HAGAV_CIDADE_FORO", "CIDADE_FORO_CONTRATO"]),
    "Salvador/BA"
  );
  const representanteHagav = firstNonEmptyValue(
    contrato?.representante_hagav,
    detalhes?.representante_hagav,
    firstEnvValue(env, ["HAGAV_REPRESENTANTE", "HAGAV_SIGNATORY"]),
    "HAGAV Studio"
  );
  const cnpjHagav = firstNonEmptyValue(
    contrato?.cnpj_hagav,
    detalhes?.cnpj_hagav,
    firstEnvValue(env, ["HAGAV_CNPJ", "CNPJ_HAGAV"]),
    "00.000.000/0000-00"
  );
  const emailHagav = firstNonEmptyValue(
    contrato?.email_hagav,
    detalhes?.email_hagav,
    firstEnvValue(env, ["HAGAV_EMAIL", "EMAIL_HAGAV", "NEXT_PUBLIC_HAGAV_EMAIL"]),
    "contato@hagav.com.br"
  );
  const enderecoHagav = firstNonEmptyValue(
    contrato?.endereco_hagav,
    detalhes?.endereco_hagav,
    firstEnvValue(env, ["HAGAV_ENDERECO", "ENDERECO_HAGAV"]),
    "A combinar"
  );
  const whatsappHagav = getOfficialWhatsapp(env, detalhes);

  const base = {
    id: normalizeTemplateText(row?.id || "-", 80),
    numero_contrato: contratoNumero,
    contrato_numero: contratoNumero,
    numero_geracao: String(runtime?.nextVersion || contrato?.numero_geracao || contrato?.contractVersion || contrato?.numeroGeracao || "1"),
    contractVersion: String(runtime?.nextVersion || contrato?.numero_geracao || contrato?.contractVersion || contrato?.numeroGeracao || "1"),
    data_emissao: dataEmissao,
    data_hoje: formatDateBr(dataHojeIso),
    data_assinatura: dataAssinatura,
    data_inicio: dataInicio,
    inicio: dataInicio,
    data_termino: dataTermino,
    data_fim: dataTermino,
    vencimento,
    duracao_meses: String(duracaoMeses),
    duracao: `${duracaoMeses} meses`,
    renovacao,
    tipo_projeto: tipoProjeto,
    prazo_resumo: prazoResumo,
    status_contrato: normalizeTemplateText(contrato?.status || row?.status_contrato || "aguardando_contrato", 40),

    nome_cliente: clienteNome,
    cliente_nome: clienteNome,
    nome: clienteNome,
    empresa_cliente: empresaCliente,
    cpf_cnpj: cpfCnpjCliente,
    cpf_cnpj_cliente: cpfCnpjCliente,
    email_cliente: emailCliente,
    endereco_cliente: enderecoCliente,
    whatsapp_cliente: whatsappCliente || "-",
    whatsapp: whatsappCliente || "-",

    servico,
    servico_plano: servico,
    plano_servico: servico,
    quantidade,
    resumo_servico: resumoServico,
    descricao_servico: descricaoServico,

    valor_total: formatMoney(valorTotalNum, { withCurrency: false }),
    valor_contrato: formatMoney(valorTotalNum, { withCurrency: true }),
    valor_final: formatMoney(valorTotalNum, { withCurrency: true }),
    preco_final: formatMoney(valorTotalNum, { withCurrency: true }),
    forma_pagamento: formaPagamento,
    pix,
    chave_pix: pix,
    condicao_pagamento: condicaoPagamento,

    observacoes: observacoes || "Sem observacoes adicionais.",
    observacoes_contrato: observacoes || "Sem observacoes adicionais.",

    cidade_foro: cidadeForo,
    representante_hagav: representanteHagav,
    cnpj_hagav: cnpjHagav,
    email_hagav: emailHagav,
    endereco_hagav: enderecoHagav,
    whatsapp_hagav: whatsappHagav || "-",

    responsavel: firstNonEmptyValue(contrato?.responsavel, row?.responsavel, "Time HAGAV"),
    recorrente: contrato?.recorrente === false ? "Nao" : "Sim",
  };

  const expanded = {};
  for (const [key, value] of Object.entries(base)) {
    const normalized = normalizeTemplateText(value, 1600, { allowEmpty: true });
    expanded[key] = normalized;
    expanded[key.toUpperCase()] = normalized;
  }
  return expanded;
}

const CONTRATO_TEMPLATE_PATH = "/templates/contrato-hagav-template.html";

async function loadOfficialContratoTemplate(request, env) {
  const templateUrl = new URL(CONTRATO_TEMPLATE_PATH, request.url).toString();
  const readErrors = [];

  if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
    try {
      const response = await env.ASSETS.fetch(new Request(templateUrl, { method: "GET" }));
      if (response?.ok) {
        const html = await response.text();
        if (String(html || "").trim()) {
          return { html, source: "assets", templatePath: CONTRATO_TEMPLATE_PATH };
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
        return { html, source: "http", templatePath: CONTRATO_TEMPLATE_PATH };
      }
    }
    readErrors.push(`http_${response?.status || 0}`);
  } catch (err) {
    readErrors.push(`http_fetch_${stripDangerousText(String(err?.message || "erro_desconhecido"), 120)}`);
  }

  const error = new Error(`template_not_found:${CONTRATO_TEMPLATE_PATH}:${readErrors.join("|")}`);
  error.code = "template_not_found";
  error.templatePath = CONTRATO_TEMPLATE_PATH;
  throw error;
}

async function renderContratoTemplateToLines(row, request, env, runtime = {}) {
  const templateInfo = await loadOfficialContratoTemplate(request, env);
  const values = buildTemplateValues(row, env, runtime);
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

  const filePath = `contratos/${fileName}`;
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

async function updateContractLink(config, row, linkPdf, pdfMeta = {}, runtime = {}) {
  const detalhes = readDetalhes(row);
  const contratoAtual = (detalhes?.contrato && typeof detalhes.contrato === "object") ? detalhes.contrato : {};
  const nowIso = new Date().toISOString();
  const contractOverride = (runtime?.contractOverride && typeof runtime.contractOverride === "object")
    ? runtime.contractOverride
    : {};
  const numeroGeracao = Math.max(
    parseContractVersionValue(contractOverride?.numero_geracao),
    parseContractVersionValue(runtime?.nextVersion),
    parseContractVersionValue(contratoAtual?.numero_geracao)
  ) || 1;
  const numeroContrato = formatContractVersion(numeroGeracao);
  const valorTotalPersist = Number(
    runtime?.valorTotal
      ?? contractOverride?.valor_total
      ?? contractOverride?.valor_final
      ?? contractOverride?.preco_final
      ?? row?.valor_fechado
      ?? row?.preco_final
      ?? row?.valor_sugerido
      ?? 0
  );
  const valorTotalSafe = Number.isFinite(valorTotalPersist) ? valorTotalPersist : 0;
  const renderMode = stripDangerousText(String(pdfMeta?.render_mode || ""), 80);
  const pdfEngine = stripDangerousText(String(pdfMeta?.pdf_engine || ""), 80);
  const pdfFallbackUsed = Boolean(pdfMeta?.pdf_fallback_used);
  const pdfFallbackFrom = stripDangerousText(String(pdfMeta?.pdf_fallback_from || ""), 80);
  const pdfFallbackReason = stripDangerousText(String(pdfMeta?.pdf_fallback_reason || ""), 120);
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
    `/rest/v1/deals?id=eq.${encodeURIComponent(row.id)}&select=id,detalhes,status`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: {
        preco_final: valorTotalSafe,
        valor_fechado: valorTotalSafe,
        validade_ate: runtime?.endIso || contractOverride?.data_fim || contractOverride?.vencimento || row?.validade_ate || null,
        detalhes: {
          ...detalhes,
          contrato: {
            ...contratoAtual,
            ...contractOverride,
            numero_contrato: numeroContrato,
            contrato_numero: numeroContrato,
            numero_geracao: numeroGeracao,
            contractVersion: numeroGeracao,
            numeroGeracao: numeroGeracao,
            data_emissao: runtime?.nowIso || contractOverride?.data_emissao || nowIso,
            data_inicio: runtime?.startIso || contractOverride?.data_inicio || contratoAtual?.data_inicio || null,
            data_fim: runtime?.endIso || contractOverride?.data_fim || contractOverride?.vencimento || contratoAtual?.data_fim || contratoAtual?.vencimento || null,
            data_termino: runtime?.endIso || contractOverride?.data_termino || contractOverride?.data_fim || contractOverride?.vencimento || contratoAtual?.data_termino || null,
            vencimento: runtime?.endIso || contractOverride?.vencimento || contractOverride?.data_fim || contratoAtual?.vencimento || null,
            duracao_meses: runtime?.duracaoMeses || contractOverride?.duracao_meses || contratoAtual?.duracao_meses || 12,
            valor_total: valorTotalSafe,
            valor_final: valorTotalSafe,
            preco_final: valorTotalSafe,
            pix: firstNonEmptyValue(contractOverride?.pix, contractOverride?.chave_pix, contratoAtual?.pix, contratoAtual?.chave_pix, ""),
            chave_pix: firstNonEmptyValue(contractOverride?.pix, contractOverride?.chave_pix, contratoAtual?.pix, contratoAtual?.chave_pix, ""),
            link_pdf: linkPdf || "",
            contrato_gerado_em: nowIso,
            pdf_render_mode: renderMode,
            pdf_engine: pdfEngine,
            pdf_fallback_used: pdfFallbackUsed,
            pdf_fallback_from: pdfFallbackFrom,
            pdf_fallback_reason: pdfFallbackReason,
            pdf_comercial_liberado: pdfComercialLiberado,
            atualizado_em: nowIso
          }
        }
      }
    }
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestId = createRequestId();
  const config = getSupabaseConfig(env);
  const hasAdminKey = Boolean(getAdminKey(env));
  logPdf(requestId, "start", "Inicio da geracao de contrato PDF", {
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
    namespace: 'admin-contrato-pdf',
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

  const contractInput = sanitizeContractInput(body?.contrato || body?.contract);

  const id = stripDangerousText(String(body?.id || ""), 120);
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return fail(requestId, "request", "id_invalido", 400);
  }

  const getResult = await fetchSupabase(
    config,
    `/rest/v1/deals?id=eq.${encodeURIComponent(id)}&select=id,nome,whatsapp,servico,pacote_sugerido,valor_fechado,preco_final,valor_sugerido,responsavel,validade_ate,observacoes_internas,detalhes,status&limit=1`
  );
  if (!getResult.ok) {
    return fail(requestId, "fetch_deal", getResult.reason || "deal_fetch_failed", 502);
  }
  const row = Array.isArray(getResult.data) ? (getResult.data[0] || null) : null;
  if (!row) {
    return fail(requestId, "fetch_deal", "deal_nao_encontrado", 404);
  }
  const runtimeData = buildContractRuntimeData(row, contractInput);

  let rendered;
  try {
    rendered = await renderContratoTemplateToLines(row, request, env, runtimeData);
  } catch (err) {
    const reason = String(err?.code || "").toLowerCase() === "template_not_found"
      || String(err?.message || "").includes("template_not_found")
      ? "template_not_found"
      : "template_render_failed";
    return fail(requestId, "template_render", reason, 500, {
      detail: stripDangerousText(String(err?.message || ""), 200),
      template_path: CONTRATO_TEMPLATE_PATH,
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
  logPdf(requestId, "template_render", "Template renderizado para contrato", {
    template_source: templateSource,
    template_path: templatePath,
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
  const pdfFallbackUsed = Boolean(pdfRender?.fallbackFrom);
  const pdfFallbackFrom = String(pdfRender?.fallbackFrom || "");
  const pdfFallbackReason = String(pdfRender?.fallbackReason || "");
  logPdf(requestId, "pdf_render", "PDF do contrato gerado a partir do HTML renderizado", {
    render_mode: renderMode,
    pdf_engine: pdfEngine,
    pdf_bytes: pdfBytes,
    fallback_used: pdfFallbackUsed,
    fallback_from: pdfFallbackFrom,
    fallback_reason: pdfFallbackReason,
    provider_status: Number(pdfRender.providerStatus || 0) || undefined,
    provider_content_type: String(pdfRender.providerContentType || ""),
    provider_endpoint: String(pdfRender.providerEndpoint || ""),
    provider_auth_mode: String(pdfRender.providerAuthMode || ""),
    html_has_style_tag: Boolean(htmlHasStyleTag),
    html_has_header_class: Boolean(htmlHasHeaderClass),
  });

  const fileName = `contrato-${id}-${Date.now()}.pdf`;
  const uploadResult = await uploadPdfIfPossible(config, env, pdfContent, fileName);
  if (!uploadResult.ok) {
    return fail(requestId, "upload", "pdf_upload_failed", 502, {
      upload_reason: stripDangerousText(String(uploadResult.reason || "upload_failed"), 180),
      file_name: fileName,
      template_source: templateSource,
      template_path: templatePath,
      render_mode: renderMode,
      pdf_engine: pdfEngine,
      pdf_fallback_used: pdfFallbackUsed,
      pdf_fallback_from: pdfFallbackFrom,
      pdf_fallback_reason: pdfFallbackReason,
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
  const updateResult = await updateContractLink(config, row, linkPdf, {
    render_mode: renderMode,
    pdf_engine: pdfEngine,
    pdf_fallback_used: pdfFallbackUsed,
    pdf_fallback_from: pdfFallbackFrom,
    pdf_fallback_reason: pdfFallbackReason,
  }, runtimeData);
  if (!updateResult.ok) {
    return fail(requestId, "persist_link", "deal_link_update_failed", 502, {
      detail: stripDangerousText(String(updateResult.reason || "deal_update_failed"), 180),
      file_name: fileName,
      link_pdf: linkPdf,
      template_source: templateSource,
      template_path: templatePath,
      render_mode: renderMode,
      pdf_engine: pdfEngine,
      pdf_fallback_used: pdfFallbackUsed,
      pdf_fallback_from: pdfFallbackFrom,
      pdf_fallback_reason: pdfFallbackReason,
    });
  }
  logPdf(requestId, "persist_link", "Link do contrato salvo no deal", {
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
    numero_contrato: String(runtimeData?.numeroContrato || ""),
    numero_geracao: Number(runtimeData?.nextVersion || 0) || 1,
    data_inicio_iso: String(runtimeData?.startIso || ""),
    data_fim_iso: String(runtimeData?.endIso || ""),
    data_emissao: formatDateBr(runtimeData?.nowIso || new Date().toISOString()),
    duracao_meses: Number(runtimeData?.duracaoMeses || 0) || undefined,
    uploaded: uploadResult.ok,
    upload_reason: uploadResult.ok ? "" : uploadResult.reason,
    template_source: templateSource,
    template_path: templatePath,
    render_mode: renderMode,
    pdf_engine: pdfEngine,
    pdf_fallback_used: pdfFallbackUsed,
    pdf_fallback_from: pdfFallbackFrom,
    pdf_fallback_reason: pdfFallbackReason,
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



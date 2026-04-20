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

function createPdfFromLines(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
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

function buildPdfLines(row) {
  const detalhes = readDetalhes(row);
  const fluxo = normalizePdfText(detalhes?.fluxo || "-");
  const servico = normalizePdfText(row?.servico || detalhes?.servicoOuOperacao || "-");
  const quantidade = normalizePdfText(detalhes?.quantidade || "-");
  const material = normalizePdfText(detalhes?.materialGravado || "-");
  const tempo = normalizePdfText(detalhes?.tempoBruto || "-");
  const prazo = normalizePdfText(detalhes?.prazo || "-");
  const referencia = normalizePdfText(detalhes?.referencia || "-", 160);
  const obs = normalizePdfText(detalhes?.observacoes || "-", 200);
  const investimento = formatMoney(row?.preco_final || row?.preco_base);
  const base = formatMoney(row?.preco_base || 0);
  const dataHoje = new Date().toISOString().slice(0, 10);

  return [
    "HAGAV Studio de Edicao",
    "Proposta de Orcamento - Rascunho Interno",
    `Data: ${dataHoje}`,
    "----------------------------------------------",
    `Cliente: ${normalizePdfText(row?.nome || "-", 80)}`,
    `WhatsApp: ${normalizePdfText(row?.whatsapp || "-", 30)}`,
    `Fluxo: ${fluxo}`,
    `Servico: ${servico}`,
    `Escopo: ${normalizePdfText(row?.resumo_orcamento || "-", 250)}`,
    `Quantidade: ${quantidade}`,
    `Material gravado: ${material}`,
    `Tempo bruto: ${tempo}`,
    `Prazo: ${prazo}`,
    `Referencia: ${referencia}`,
    "----------------------------------------------",
    `Investimento base: ${base}`,
    `Investimento final sugerido: ${investimento}`,
    `Pacote sugerido: ${normalizePdfText(row?.pacote_sugerido || "-", 80)}`,
    "Observacoes internas:",
    normalizePdfText(row?.observacoes_internas || "-", 220),
    "Observacoes do cliente:",
    obs,
    "----------------------------------------------",
    "Condicoes:",
    "- Proposta interna para revisao antes do envio ao cliente.",
    "- Validade comercial sugerida: 7 dias.",
    "- Ajustes finais dependem de aprovacao da equipe HAGAV."
  ];
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

async function updatePdfLink(config, id, linkPdf) {
  return fetchSupabase(
    config,
    `/rest/v1/deals?id=eq.${encodeURIComponent(id)}&select=id,link_pdf,status`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: { link_pdf: linkPdf || "" }
    }
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;
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

  const id = stripDangerousText(String(body?.id || ""), 120);
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    return json({ ok: false, error: "id_invalido" }, 400);
  }

  const getResult = await fetchSupabase(
    config,
    `/rest/v1/deals?id=eq.${encodeURIComponent(id)}&select=id,created_at,nome,whatsapp,servico,resumo_orcamento,preco_base,preco_final,pacote_sugerido,status,observacoes_internas,link_pdf,detalhes,origem&limit=1`
  );
  if (!getResult.ok) return json({ ok: false, error: getResult.reason }, 502);
  const row = Array.isArray(getResult.data) ? (getResult.data[0] || null) : null;
  if (!row) return json({ ok: false, error: "orcamento_nao_encontrado" }, 404);

  const lines = buildPdfLines(row);
  const pdfContent = createPdfFromLines(lines);
  const fileName = `orcamento-${id}-${Date.now()}.pdf`;
  const uploadResult = await uploadPdfIfPossible(config, env, pdfContent, fileName);

  let linkPdf = "";
  if (uploadResult.ok) {
    linkPdf = stripDangerousText(uploadResult.link || "", 1000);
    await updatePdfLink(config, id, linkPdf);
  }

  return json({
    ok: true,
    id,
    fileName,
    link_pdf: linkPdf,
    uploaded: uploadResult.ok,
    upload_reason: uploadResult.ok ? "" : uploadResult.reason,
    pdf_base64: typeof btoa === "function" ? btoa(pdfContent) : ""
  });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

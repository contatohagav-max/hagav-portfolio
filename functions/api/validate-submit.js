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
const SUBMISSION_ID_TTL_MS = 1000 * 60 * 30;
const STATUS_PADRAO = "novo";
const STATUS_ORCAMENTO_PADRAO = "pendente_revisao";
const DEFAULT_SCORE_WEIGHTS = {
  urgenciaAlta: 18,
  fluxoRecorrente: 20,
  referenciaVisual: 8,
  materialGravado: 10,
  servicoAltoValor: 12,
  semPressa: -6
};

const DEFAULT_PRICING_RULES = {
  serviceBase: {
    reels_shorts_tiktok: 170,
    criativo_trafego_pago: 204,
    corte_podcast: 123,
    video_medio: 264,
    depoimento: 220,
    videoaula_modulo: 396,
    youtube: 607,
    vsl_15: 880,
    vsl_longa: 2000,
    motion_min: 900,
    motion_max: 2500,
    default_du: 190,
    default_dr: 210
  },
  volumeDiscounts: [
    { min: 1, max: 4, percent: 0 },
    { min: 5, max: 9, percent: 3 },
    { min: 10, max: 19, percent: 6 },
    { min: 20, max: 29, percent: 10 },
    { min: 30, max: 99999, percent: 10 }
  ],
  complexidade: {
    N1: 0.7,
    N2: 1.0,
    N3: 1.5,
    n1MaxMin: 30,
    n2MaxMin: 120
  },
  urgencia: {
    DU: {
      "24h": 1.3,
      "3 dias": 1.15,
      "essa semana": 1.0,
      "sem pressa": 1.0
    },
    DR: {
      imediato: 1.2,
      "essa semana": 1.0,
      "esse mês": 1.0,
      "estou analisando": 1.0
    },
    VSL: {
      "3 dias": 1.4
    }
  },
  ajustes: {
    semReferencia: 10,
    multicamera: 15
  },
  margem: {
    choHora: 41.67,
    minimaSegura: 60,
    saudavelMin: 65,
    saudavelMax: 75,
    excelente: 75,
    recusaAbaixo: 55,
    repasseEditorMin: 30,
    repasseEditorMax: 35
  },
  pacotes: {
    sugerirAcimaQtd: 8,
    revisaoCapacidadeAcimaQtd: 30
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

async function fetchSupabaseConfigValue(config, key) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort("timeout"), SUPABASE_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(
      `${config.url}/rest/v1/configuracoes?chave=eq.${encodeURIComponent(key)}&select=valor&limit=1`,
      {
        method: "GET",
        headers: {
          "content-type": "application/json; charset=utf-8",
          apikey: config.writeKey,
          authorization: `Bearer ${config.writeKey}`
        },
        signal: controller ? controller.signal : undefined
      }
    );

    if (!response.ok) return null;
    const parsed = await parseJsonSafe(response);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const value = parsed[0]?.valor;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  if (!base || typeof base !== "object") return override;
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      merged[key] = value.slice();
      continue;
    }
    if (value && typeof value === "object") {
      merged[key] = deepMerge(base[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

async function loadPricingContext(config) {
  const [pricing, score] = await Promise.all([
    fetchSupabaseConfigValue(config, "pricing_rules"),
    fetchSupabaseConfigValue(config, "score_weights")
  ]);

  return {
    pricingRules: deepMerge(DEFAULT_PRICING_RULES, pricing || {}),
    scoreWeights: deepMerge(DEFAULT_SCORE_WEIGHTS, score || {})
  };
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
      valorSugerido: Number(pricing?.valorSugerido || 0),
      faixaSugerida: pricing?.faixaSugerida || "",
      margemEstimada: Number(pricing?.margemEstimada || 0),
      revisaoManual: Boolean(pricing?.revisaoManual),
      motivoCalculo: pricing?.motivoCalculo || "",
      complexidadeNivel: pricing?.complexidadeNivel || "",
      multiplicadorComplexidade: Number(pricing?.multiplicadorComplexidade || 1),
      multiplicadorUrgencia: Number(pricing?.multiplicadorUrgencia || 1),
      descontoVolumePercent: Number(pricing?.descontoVolumePercent || 0),
      ajusteReferenciaPercent: Number(pricing?.ajusteReferenciaPercent || 0),
      ajusteMulticameraPercent: Number(pricing?.ajusteMulticameraPercent || 0),
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

function inferUrgenciaFromPrazo(flow, prazoRaw) {
  const key = canonicalPrazoKey(prazoRaw);
  if (!key) return "media";
  if (key === "24h" || key === "imediato") return "alta";
  if (key === "3 dias" || key === "essa semana") return "media";
  if (flow === "DR" && (key === "esse mês" || key === "estou analisando")) return "baixa";
  if (key === "sem pressa") return "baixa";
  return "media";
}

function inferTemperaturaByScore(score) {
  if (score >= 75) return "Quente";
  if (score >= 45) return "Morno";
  return "Frio";
}

function inferPrioridadeByScore(score, urgencia) {
  if (urgencia === "alta" || score >= 75) return "alta";
  if (urgencia === "baixa" && score < 45) return "baixa";
  return "media";
}

function inferMaterialState(raw) {
  const text = String(raw || "").toLowerCase();
  if (!text) return "desconhecido";
  if (text.includes("sim")) return "sim";
  if (text.includes("nao") || text.includes("não")) return "nao";
  return "parcial";
}

function estimateLeadScoreFromRow(row, pricing, scoreWeights) {
  const flow = row?.Fluxo === "DR" ? "DR" : "DU";
  const urgencia = inferUrgenciaFromPrazo(flow, row?.Prazo);
  const material = inferMaterialState(row?.MaterialGravado);
  const quantidade = Math.max(1, Number(pricing?.totalQuantidade || parsePositiveNumber(row?.Quantidade) || 1));
  const tempoHours = parseHours(row?.TempoBruto);
  const hasReferencia = stripDangerousText(String(row?.Referencia || ""), LIMITS.referencia).length > 3;
  const servico = String(row?.ServicoOuOperacao || "").toLowerCase();
  const servicoAltoValor = /(criativo|ads|anuncio|lancamento|youtube|estrutura|recorrente)/.test(servico);

  let score = 20;
  if (flow === "DR") score += Number(scoreWeights?.fluxoRecorrente || DEFAULT_SCORE_WEIGHTS.fluxoRecorrente);
  if (servicoAltoValor) score += Number(scoreWeights?.servicoAltoValor || DEFAULT_SCORE_WEIGHTS.servicoAltoValor);

  if (quantidade >= 20) score += 20;
  else if (quantidade >= 10) score += 14;
  else if (quantidade >= 5) score += 8;
  else if (quantidade >= 2) score += 4;

  if (material === "sim") score += Number(scoreWeights?.materialGravado || DEFAULT_SCORE_WEIGHTS.materialGravado);
  if (material === "nao") score -= 4;

  if (tempoHours >= 10) score += 10;
  else if (tempoHours >= 4) score += 6;

  if (hasReferencia) score += Number(scoreWeights?.referenciaVisual || DEFAULT_SCORE_WEIGHTS.referenciaVisual);

  if (urgencia === "alta") score += Number(scoreWeights?.urgenciaAlta || DEFAULT_SCORE_WEIGHTS.urgenciaAlta);
  else if (urgencia === "media") score += 8;
  else score += Number(scoreWeights?.semPressa || DEFAULT_SCORE_WEIGHTS.semPressa);

  const obs = stripDangerousText(String(row?.Observacoes || ""), 500);
  if (obs.length >= 80) score += 4;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function estimateMargemFromPricing(row, pricing) {
  const valor = Number(pricing?.precoFinal || pricing?.precoBase || 0);
  if (!Number.isFinite(valor) || valor <= 0) return 0;

  const urgencia = inferUrgenciaFromPrazo(row?.Fluxo, row?.Prazo);
  const material = inferMaterialState(row?.MaterialGravado);
  const tempoHours = parseHours(row?.TempoBruto);
  const flow = row?.Fluxo === "DR" ? "DR" : "DU";

  let costRatio = 0.46;
  if (material === "nao") costRatio += 0.12;
  if (tempoHours >= 8) costRatio += 0.09;
  if (urgencia === "alta") costRatio += 0.08;
  if (flow === "DR") costRatio -= 0.05;

  costRatio = Math.min(0.9, Math.max(0.25, costRatio));
  const margem = ((valor - (valor * costRatio)) / valor) * 100;
  return roundCurrency(Math.min(95, Math.max(0, margem)));
}

function buildResumoComercial(row, pricing, score, urgencia, prioridade) {
  const parts = [
    row?.Fluxo || "",
    `Servico: ${normalizeServicoCurto(row?.ServicoOuOperacao || "") || "-"}`,
    `Quantidade: ${row?.Quantidade || "-"}`,
    `Prazo: ${row?.Prazo || "-"}`,
    `Urgencia: ${urgencia}`,
    `Prioridade: ${prioridade}`,
    `Score: ${score}`,
    `Valor sugerido: ${pricing?.valorSugerido || pricing?.precoFinal || pricing?.precoBase || 0}`,
    `Revisao manual: ${pricing?.revisaoManual ? "sim" : "nao"}`
  ];
  return stripDangerousText(parts.join(" | "), 1800);
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
  const { pricingRules, scoreWeights } = await loadPricingContext(config);
  const pricing = calculateOrcamentoPricing(row, pricingRules, lead?.raw?.answers || {});
  const urgencia = inferUrgenciaFromPrazo(row?.Fluxo, row?.Prazo);
  const scoreLead = estimateLeadScoreFromRow(row, pricing, scoreWeights);
  const prioridade = inferPrioridadeByScore(scoreLead, urgencia);
  const temperatura = inferTemperaturaByScore(scoreLead);
  const valorEstimado = Number(pricing.valorSugerido || pricing.precoFinal || pricing.precoBase || 0);
  const margemEstimada = Number(pricing.margemEstimada || estimateMargemFromPricing(row, pricing));
  const resumoComercial = buildResumoComercial(row, pricing, scoreLead, urgencia, prioridade);

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
    valor_estimado: valorEstimado,
    valor_sugerido: Number(pricing.valorSugerido || 0),
    margem_estimada: margemEstimada,
    faixa_sugerida: stripDangerousText(pricing.faixaSugerida || "", 200),
    motivo_calculo: stripDangerousText(pricing.motivoCalculo || "", 2000),
    revisao_manual: Boolean(pricing.revisaoManual),
    alerta_capacidade: Boolean(pricing.alertaCapacidade),
    operacao_especial: Boolean(pricing.operacaoEspecial),
    complexidade_nivel: stripDangerousText(pricing.complexidadeNivel || "N2", 20),
    multiplicador_complexidade: Number(pricing.multiplicadorComplexidade || 1),
    multiplicador_urgencia: Number(pricing.multiplicadorUrgencia || 1),
    desconto_volume_percent: Number(pricing.descontoVolumePercent || 0),
    ajuste_referencia_percent: Number(pricing.ajusteReferenciaPercent || 0),
    ajuste_multicamera_percent: Number(pricing.ajusteMulticameraPercent || 0),
    score_lead: scoreLead,
    urgencia,
    prioridade,
    temperatura,
    proxima_acao: "",
    responsavel: "",
    ultimo_contato_em: null,
    proximo_followup_em: null,
    resumo_comercial: resumoComercial,
    pacote_sugerido: stripDangerousText(pricing.pacoteSugerido || "", 120),
    status_orcamento: stripDangerousText(pricing.statusOrcamento || STATUS_ORCAMENTO_PADRAO, 60),
    observacoes_internas: stripDangerousText(pricing.observacoesInternas || "", 500),
    link_pdf: stripDangerousText(pricing.linkPdf || "", 500)
  };

  const orcamentoResult = await postSupabaseRow(config, "orcamentos", orcamentoInsert);
  if (!orcamentoResult.ok) return orcamentoResult;

  const leadInsert = {
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
    score_lead: scoreLead,
    urgencia,
    prioridade,
    temperatura,
    valor_estimado: valorEstimado,
    margem_estimada: margemEstimada,
    proxima_acao: "",
    responsavel: "",
    ultimo_contato_em: null,
    proximo_followup_em: null,
    resumo_orcamento: buildResumoOrcamento(row),
    resumo_comercial: resumoComercial
  };
  const leadResult = await postSupabaseRow(config, "leads", leadInsert);
  if (!leadResult.ok) return leadResult;

  return { ok: true };
}

async function saveLead(env, lead) {
  return saveLeadToSupabase(env, lead);
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

function roundCurrency(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function getComplexidadeByMinutes(minutes, pricingRules) {
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  const limits = pricingRules?.complexidade || DEFAULT_PRICING_RULES.complexidade;
  if (safeMinutes <= limits.n1MaxMin) return { nivel: "N1", multiplicador: Number(limits.N1 || 0.7) };
  if (safeMinutes <= limits.n2MaxMin) return { nivel: "N2", multiplicador: Number(limits.N2 || 1) };
  return { nivel: "N3", multiplicador: Number(limits.N3 || 1.5) };
}

function canonicalPrazoKey(rawPrazo) {
  const prazo = String(rawPrazo || "").toLowerCase();
  if (!prazo) return "";
  if (prazo.includes("24h")) return "24h";
  if (prazo.includes("3 dia")) return "3 dias";
  if (prazo.includes("essa semana")) return "essa semana";
  if (prazo.includes("sem pressa")) return "sem pressa";
  if (prazo.includes("imediato")) return "imediato";
  if (prazo.includes("esse mês") || prazo.includes("esse mes")) return "esse mês";
  if (prazo.includes("estou analisando")) return "estou analisando";
  return prazo.trim();
}

function mapServiceCatalog(serviceLabel) {
  const normalized = normalizeServiceKey(serviceLabel);
  if (/(reels|shorts|tiktok|conteudo para redes sociais)/.test(normalized)) return "reels_shorts_tiktok";
  if (/(criativo|trafego|anuncio|ads|criativos para anuncios)/.test(normalized)) return "criativo_trafego_pago";
  if (/(corte|podcast)/.test(normalized)) return "corte_podcast";
  if (/video medio/.test(normalized)) return "video_medio";
  if (/depoimento/.test(normalized)) return "depoimento";
  if (/(videoaula|modulo)/.test(normalized)) return "videoaula_modulo";
  if (/(youtube|youtube recorrente)/.test(normalized)) return "youtube";
  if (/lancamento/.test(normalized)) return "video_medio";
  if (/vsl/.test(normalized) && /(longa|30|min|45|min|60|min)/.test(normalized)) return "vsl_longa";
  if (/vsl/.test(normalized)) return "vsl_15";
  if (/(motion|vinheta)/.test(normalized)) return "motion";
  return "default";
}

function getUnitPriceFromRules(flow, serviceKey, pricingRules) {
  const base = pricingRules?.serviceBase || DEFAULT_PRICING_RULES.serviceBase;
  if (serviceKey === "motion") {
    const min = Number(base.motion_min || 900);
    const max = Number(base.motion_max || 2500);
    return { min, max, value: min, heavy: true, manual: true };
  }

  const fromTable = Number(base[serviceKey]);
  if (Number.isFinite(fromTable) && fromTable > 0) {
    const heavy = serviceKey === "youtube" || serviceKey === "vsl_15" || serviceKey === "vsl_longa";
    return { min: fromTable, max: fromTable, value: fromTable, heavy, manual: false };
  }

  const fallback = flow === "DR"
    ? Number(base.default_dr || DEFAULT_PRICING_RULES.serviceBase.default_dr)
    : Number(base.default_du || DEFAULT_PRICING_RULES.serviceBase.default_du);
  return { min: fallback, max: fallback, value: fallback, heavy: false, manual: false };
}

function readUrgencyMultiplier(flowTable, key) {
  const canonicalKey = normalizeServiceKey(key);
  if (!canonicalKey) return 1;
  for (const [rawKey, rawValue] of Object.entries(flowTable || {})) {
    if (normalizeServiceKey(rawKey) === canonicalKey) {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }
  }
  return 1;
}

function getUrgencyMultiplier(flow, prazoKey, serviceKey, pricingRules) {
  const urg = pricingRules?.urgencia || DEFAULT_PRICING_RULES.urgencia;
  const flowTable = flow === "DR" ? (urg.DR || {}) : (urg.DU || {});
  const vslTable = urg.VSL || {};

  let multiplier = readUrgencyMultiplier(flowTable, prazoKey);
  let blocked = false;
  let forcedManual = false;
  const reasons = [];

  if (serviceKey === "vsl_15" || serviceKey === "vsl_longa") {
    if (prazoKey === "24h") {
      blocked = true;
      forcedManual = true;
      multiplier = 1;
      reasons.push("VSL nao aceita prazo 24h.");
    } else if (prazoKey === "3 dias") {
      multiplier = Math.max(multiplier, readUrgencyMultiplier(vslTable, "3 dias") || 1.4);
      reasons.push("Prazo 3 dias para VSL aplica adicional de 40%.");
    }
  }

  if (flow === "DU" && prazoKey === "24h") {
    const allow24h = serviceKey === "reels_shorts_tiktok" || serviceKey === "criativo_trafego_pago";
    if (!allow24h) {
      forcedManual = true;
      reasons.push("24h em DU so e aplicado para Reels e Criativo.");
    }
  }

  return {
    multiplier: Number.isFinite(multiplier) ? multiplier : 1,
    blocked,
    forcedManual,
    reasons
  };
}

function getVolumeDiscount(totalQty, pricingRules) {
  const rules = Array.isArray(pricingRules?.volumeDiscounts)
    ? pricingRules.volumeDiscounts
    : DEFAULT_PRICING_RULES.volumeDiscounts;
  const safeQty = Math.max(1, Math.round(Number(totalQty || 0) || 1));
  for (const rule of rules) {
    const min = Number(rule?.min || 0);
    const max = Number(rule?.max || 999999);
    if (safeQty >= min && safeQty <= max) {
      return Number(rule?.percent || 0);
    }
  }
  return 0;
}

function detectMulticamera(text) {
  const normalized = String(text || "").toLowerCase();
  return /(multicamera|multi camera|3 cameras|3 camera|3 cam|tricamera)/.test(normalized);
}

function detectOperacaoEspecial(text) {
  const normalized = String(text || "").toLowerCase();
  return /(operacao especial|operação especial|efeito complexo|animacao complexa|captação externa|captacao externa)/.test(normalized);
}

function getPackageSuggestion(flow, totalQty, value, pricingRules) {
  const pkgRules = pricingRules?.pacotes || DEFAULT_PRICING_RULES.pacotes;
  const threshold = Number(pkgRules?.sugerirAcimaQtd || 8);
  if (totalQty <= threshold) return "Projeto avulso";
  if (flow === "DR") {
    if (totalQty >= 30) return "Pacote Escala DR";
    if (totalQty >= 15) return "Pacote Crescimento DR";
    return "Pacote Recorrente DR";
  }
  if (value >= 6000 || totalQty >= 20) return "Pacote Intensivo DU";
  return "Pacote Plus DU";
}

function extractMultiSelection(rawField) {
  if (Array.isArray(rawField)) return rawField;
  if (rawField && Array.isArray(rawField.selected)) return rawField.selected;
  return [];
}

function mapSelectionWithOutro(rawList, outroValue) {
  return extractMultiSelection(rawList).map((item) => {
    const safe = stripDangerousText(String(item || ""), LIMITS.service);
    if (safe !== "Outro") return safe;
    const outro = stripDangerousText(String(outroValue || ""), LIMITS.outro);
    return outro ? `Outro: ${outro}` : "Outro";
  }).filter(Boolean);
}

function toLooseMapEntries(rawMap, keyLimit, valLimit) {
  if (!rawMap || typeof rawMap !== "object") return [];
  return Object.entries(rawMap).map(([rawKey, rawVal]) => ({
    label: stripDangerousText(String(rawKey || ""), keyLimit),
    normalized: normalizeServiceKey(rawKey),
    value: stripDangerousText(String(rawVal ?? ""), valLimit)
  })).filter((entry) => entry.label);
}

function getLooseMapValue(entries, targetLabel) {
  const normalizedTarget = normalizeServiceKey(targetLabel);
  if (!normalizedTarget) return "";
  const found = entries.find((entry) => entry.normalized === normalizedTarget);
  return found?.value || "";
}

function entriesToLookup(entries) {
  const map = {};
  for (const entry of entries) {
    if (!entry?.normalized) continue;
    map[entry.normalized] = entry.value || "";
  }
  return map;
}

function buildStructuredDataFromAnswers(tipo, answers) {
  const data = {
    servicePrimary: "",
    quantityPrimary: "",
    materialPrimary: "",
    tempoPrimary: "",
    prazo: "",
    referencia: "",
    objetivo: "",
    services: [],
    quantities: [],
    materialLookup: {},
    tempoLookup: {}
  };

  if (tipo === "unica") {
    const services = mapSelectionWithOutro(answers?.unica_servicos, answers?.unica_servicos?.outro);
    const qtyEntries = toLooseMapEntries(answers?.unica_quantidades, LIMITS.service, 16);
    const materialEntries = toLooseMapEntries(answers?.unica_gravado, LIMITS.service, 16);
    const tempoEntries = toLooseMapEntries(answers?.unica_tempo_bruto, LIMITS.service, LIMITS.duration);
    const fallbackServices = qtyEntries.map((entry) => entry.label).filter(Boolean);
    const resolvedServices = services.length > 0 ? services : fallbackServices;
    const primaryService = resolvedServices[0] || qtyEntries[0]?.label || "";
    const resolvedQuantities = resolvedServices.map((service) => getLooseMapValue(qtyEntries, service) || "-");

    data.servicePrimary = primaryService;
    data.quantityPrimary = getLooseMapValue(qtyEntries, primaryService) || resolvedQuantities[0] || "";
    data.materialPrimary = getLooseMapValue(materialEntries, primaryService) || materialEntries[0]?.value || "";
    data.tempoPrimary = getLooseMapValue(tempoEntries, primaryService) || tempoEntries[0]?.value || "";
    data.prazo = stripDangerousText(String(answers?.unica_prazo || ""), 60);
    data.referencia = stripDangerousText(String(answers?.unica_referencia || ""), LIMITS.referencia);
    data.services = resolvedServices;
    data.quantities = resolvedQuantities;
    data.materialLookup = entriesToLookup(materialEntries);
    data.tempoLookup = entriesToLookup(tempoEntries);
    return data;
  }

  const operations = mapSelectionWithOutro(answers?.rec_operacoes, answers?.rec_operacoes?.outro);
  const qtyEntries = toLooseMapEntries(answers?.rec_quantidades, LIMITS.service, 16);
  const materialEntries = toLooseMapEntries(answers?.rec_gravado_por_tipo, LIMITS.service, 16);
  const tempoEntries = toLooseMapEntries(answers?.rec_tempo_bruto_por_tipo, LIMITS.service, LIMITS.duration);
  const fallbackOperations = qtyEntries.map((entry) => entry.label).filter(Boolean);
  const resolvedOperations = operations.length > 0 ? operations : fallbackOperations;
  const primaryOperation = resolvedOperations[0] || qtyEntries[0]?.label || "";
  const resolvedQuantities = resolvedOperations.map((operation) => getLooseMapValue(qtyEntries, operation) || "-");

  data.servicePrimary = primaryOperation || composeWithOutro(answers?.rec_tipo_operacao, answers?.rec_tipo_operacao_outro, 120);
  data.quantityPrimary = getLooseMapValue(qtyEntries, primaryOperation) || resolvedQuantities[0] || stripDangerousText(String(answers?.rec_volume || ""), 60);
  data.materialPrimary = getLooseMapValue(materialEntries, primaryOperation) || materialEntries[0]?.value || stripDangerousText(String(answers?.rec_gravado || ""), 40);
  data.tempoPrimary = getLooseMapValue(tempoEntries, primaryOperation) || tempoEntries[0]?.value || stripDangerousText(String(answers?.rec_tempo_bruto || ""), LIMITS.duration);
  data.prazo = stripDangerousText(String(answers?.rec_inicio || answers?.recorrente_prazo || ""), 60);
  data.referencia = stripDangerousText(String(answers?.rec_referencia || answers?.referencia || ""), LIMITS.referencia);
  data.objetivo = stripDangerousText(String(answers?.rec_objetivo || answers?.objetivo || ""), 120);
  data.services = resolvedOperations.length > 0 ? resolvedOperations : (data.servicePrimary ? [data.servicePrimary] : []);
  data.quantities = resolvedQuantities.length > 0 ? resolvedQuantities : [data.quantityPrimary || "-"];
  data.materialLookup = entriesToLookup(materialEntries);
  data.tempoLookup = entriesToLookup(tempoEntries);
  return data;
}

function calculateOrcamentoPricing(row, pricingRules, rawAnswers) {
  const flow = row?.Fluxo === "DR" ? "DR" : "DU";
  const structured = buildStructuredDataFromAnswers(flow === "DU" ? "unica" : "recorrente", rawAnswers || {});
  const services = structured.services.length > 0 ? structured.services : splitPipeValues(row?.ServicoOuOperacao);
  const qtyParts = structured.quantities.length > 0 ? structured.quantities : splitPipeValues(row?.Quantidade);
  const tempoMap = Object.keys(structured.tempoLookup).length > 0
    ? structured.tempoLookup
    : parseLabeledMap(row?.TempoBruto, 180, 60);
  const materialMap = Object.keys(structured.materialLookup).length > 0
    ? structured.materialLookup
    : parseLabeledMap(row?.MaterialGravado, 180, 40);
  const prazoBase = structured.prazo || row?.Prazo;
  const referenciaBase = structured.referencia || row?.Referencia;
  const prazoKey = canonicalPrazoKey(prazoBase);
  const observacoes = String(row?.Observacoes || "");
  const referencia = String(referenciaBase || "");

  const adjustments = pricingRules?.ajustes || DEFAULT_PRICING_RULES.ajustes;
  const marginRules = pricingRules?.margem || DEFAULT_PRICING_RULES.margem;
  const semReferenciaPercent = !referencia.trim() ? Number(adjustments?.semReferencia || 10) : 0;
  const multicameraPercent = detectMulticamera(`${observacoes} ${referencia}`) ? Number(adjustments?.multicamera || 15) : 0;
  const operacaoEspecial = detectOperacaoEspecial(`${observacoes} ${row?.ServicoOuOperacao || ""}`);

  let subtotalBase = 0;
  let subtotalSuggested = 0;
  let faixaMinTotal = 0;
  let faixaMaxTotal = 0;
  let totalQty = 0;
  let weightedComplexity = 0;
  let maxUrgencyMultiplier = 1;
  let hasHeavyService = false;
  let revisaoManual = false;
  let alertaCapacidade = false;
  let prazoBloqueado = false;
  let estimatedHours = 0;
  const reasons = [];

  const baseHoursByService = {
    reels_shorts_tiktok: 0.9,
    criativo_trafego_pago: 1.2,
    corte_podcast: 0.8,
    video_medio: 2.1,
    depoimento: 1.6,
    videoaula_modulo: 2.8,
    youtube: 4.0,
    vsl_15: 6.0,
    vsl_longa: 14.0,
    motion: 10.0,
    default: 1.4
  };

  for (let index = 0; index < services.length; index += 1) {
    const serviceLabel = services[index];
    const qty = Math.max(1, Math.round(parsePositiveNumber(qtyParts[index] || "1") || 1));
    const serviceKey = mapServiceCatalog(serviceLabel);
    const unit = getUnitPriceFromRules(flow, serviceKey, pricingRules);
    const tempoRaw = tempoMap[normalizeServiceKey(serviceLabel)] || "";
    const tempoMinutes = Math.round(parseHours(tempoRaw) * 60);
    const complexity = getComplexidadeByMinutes(tempoMinutes, pricingRules);
    const urg = getUrgencyMultiplier(flow, prazoKey, serviceKey, pricingRules);
    const materialRaw = String(materialMap[normalizeServiceKey(serviceLabel)] || row?.MaterialGravado || "").toLowerCase();
    const materialPronto = materialRaw.includes("sim");

    let itemBase = unit.value * qty;
    let itemSuggested = itemBase * complexity.multiplicador * urg.multiplier;

    if (!materialPronto && materialRaw.trim()) {
      itemSuggested *= 1.05;
      reasons.push(`${serviceLabel}: material nao totalmente pronto aplicou +5%.`);
    }

    subtotalBase += itemBase;
    subtotalSuggested += itemSuggested;
    totalQty += qty;
    weightedComplexity += complexity.multiplicador * qty;
    maxUrgencyMultiplier = Math.max(maxUrgencyMultiplier, urg.multiplier);
    hasHeavyService = hasHeavyService || unit.heavy;
    revisaoManual = revisaoManual || unit.manual || urg.forcedManual;
    prazoBloqueado = prazoBloqueado || urg.blocked;
    urg.reasons.forEach((reason) => reasons.push(reason));

    const hourBase = baseHoursByService[serviceKey] || baseHoursByService.default;
    estimatedHours += (hourBase * complexity.multiplicador) * qty;

    if (complexity.nivel === "N3") {
      revisaoManual = true;
      reasons.push(`${serviceLabel}: bruto acima de 2h exige revisao manual.`);
    }
    if ((serviceKey === "vsl_15" || serviceKey === "vsl_longa") && tempoMinutes > 30) {
      revisaoManual = true;
      reasons.push("VSL com bruto acima de 30min exige revisao manual.");
    }

    const spread = unit.heavy ? 0.2 : (serviceKey === "video_medio" || serviceKey === "depoimento" || serviceKey === "videoaula_modulo" ? 0.1 : 0.05);
    faixaMinTotal += itemSuggested * (1 - spread);
    faixaMaxTotal += itemSuggested * (1 + spread);
  }

  if (!services.length) {
    const fallbackQty = Math.max(1, Math.round(parsePositiveNumber(row?.Quantidade || "1") || 1));
    const fallbackUnit = getUnitPriceFromRules(flow, "default", pricingRules);
    subtotalBase = fallbackUnit.value * fallbackQty;
    subtotalSuggested = subtotalBase;
    faixaMinTotal = subtotalBase * 0.95;
    faixaMaxTotal = subtotalBase * 1.05;
    totalQty = fallbackQty;
    weightedComplexity = fallbackQty;
    estimatedHours = fallbackQty * 1.4;
    reasons.push("Servico nao mapeado automaticamente, aplicado valor base padrao.");
    revisaoManual = true;
  }

  if (semReferenciaPercent > 0) {
    const factor = 1 + (semReferenciaPercent / 100);
    subtotalSuggested *= factor;
    faixaMinTotal *= factor;
    faixaMaxTotal *= factor;
    reasons.push(`Sem referencia visual: +${semReferenciaPercent}%.`);
  }

  if (multicameraPercent > 0) {
    const factor = 1 + (multicameraPercent / 100);
    subtotalSuggested *= factor;
    faixaMinTotal *= factor;
    faixaMaxTotal *= factor;
    reasons.push(`Multicamera detectada: +${multicameraPercent}%.`);
  }

  if (operacaoEspecial) {
    revisaoManual = true;
    reasons.push("Operacao especial detectada: revisao manual obrigatoria.");
  }

  const discountPercent = getVolumeDiscount(totalQty, pricingRules);
  const discountFactor = 1 - (discountPercent / 100);
  subtotalSuggested *= discountFactor;
  faixaMinTotal *= discountFactor;
  faixaMaxTotal *= discountFactor;

  const pacote = getPackageSuggestion(flow, totalQty, subtotalSuggested, pricingRules);
  if (totalQty > Number((pricingRules?.pacotes || DEFAULT_PRICING_RULES.pacotes).revisaoCapacidadeAcimaQtd || 30)) {
    alertaCapacidade = true;
    revisaoManual = true;
    reasons.push("Volume acima de 30 itens: revisar capacidade antes de aprovar.");
  }

  if (hasHeavyService) {
    reasons.push("Servico pesado identificado: revisar escopo antes de enviar proposta.");
  }

  const precoBase = Math.max(1, roundCurrency(subtotalBase));
  const valorSugerido = Math.max(1, roundCurrency(subtotalSuggested));
  const faixaMin = Math.max(1, roundCurrency(faixaMinTotal));
  const faixaMax = Math.max(faixaMin, roundCurrency(faixaMaxTotal));
  const faixaSugerida = `R$ ${faixaMin.toFixed(2)} a R$ ${faixaMax.toFixed(2)}`;

  const complexityAvg = totalQty > 0 ? (weightedComplexity / totalQty) : 1;
  const complexityLevel = complexityAvg <= 0.8 ? "N1" : (complexityAvg < 1.3 ? "N2" : "N3");
  const custoEstimado = roundCurrency((Number(marginRules?.choHora || 41.67) || 41.67) * Math.max(estimatedHours, 0.5));
  const margemPercent = valorSugerido > 0 ? roundCurrency(((valorSugerido - custoEstimado) / valorSugerido) * 100) : 0;
  if (margemPercent < Number(marginRules?.recusaAbaixo || 55)) {
    revisaoManual = true;
    reasons.push(`Margem estimada (${margemPercent}%) abaixo do limite de ${marginRules?.recusaAbaixo || 55}%.`);
  }
  if (prazoBloqueado) {
    revisaoManual = true;
  }

  return {
    precoBase,
    precoFinal: valorSugerido,
    valorSugerido,
    faixaSugerida,
    margemEstimada: margemPercent,
    custoEstimado,
    totalQuantidade: totalQty,
    pacoteSugerido: pacote,
    statusOrcamento: STATUS_ORCAMENTO_PADRAO,
    observacoesInternas: "",
    linkPdf: "",
    revisaoManual,
    alertaCapacidade,
    operacaoEspecial,
    complexidadeNivel: revisaoManual && complexityLevel === "N3" ? "manual" : complexityLevel,
    multiplicadorComplexidade: roundCurrency(complexityAvg),
    multiplicadorUrgencia: roundCurrency(maxUrgencyMultiplier),
    descontoVolumePercent: discountPercent,
    ajusteReferenciaPercent: semReferenciaPercent,
    ajusteMulticameraPercent: multicameraPercent,
    motivoCalculo: stripDangerousText(reasons.join(" "), 2000),
    metrics: {
      prazoKey,
      hasHeavyService
    }
  };
}

function buildLeadRow(body, request, ip, nowIso) {
  const answers = body?.answers || {};
  const fluxo = body?.tipo === "unica" ? "DU" : "DR";
  const tipo = body?.tipo === "unica" ? "Demanda Única" : "Demanda Recorrente";
  const origem = "hagav.com.br";
  const structured = buildStructuredDataFromAnswers(body?.tipo === "unica" ? "unica" : "recorrente", answers);

  return {
    DataHora: nowIso,
    Fluxo: fluxo,
    TipoFluxo: tipo,
    Pagina: "orcamento",
    Nome: stripDangerousText(String(answers?.nome || ""), LIMITS.nome),
    WhatsApp: stripDangerousText(String(answers?.whatsapp || ""), 16),
    Instagram: stripDangerousText(String(answers?.instagram || ""), LIMITS.instagram),
    Empresa: stripDangerousText(String(answers?.empresa || ""), LIMITS.empresa),
    ServicoOuOperacao: stripDangerousText(structured.servicePrimary, 600),
    Quantidade: stripDangerousText(structured.quantityPrimary, 600),
    MaterialGravado: stripDangerousText(structured.materialPrimary, 600),
    TempoBruto: stripDangerousText(structured.tempoPrimary, 600),
    Prazo: stripDangerousText(structured.prazo, 120),
    Referencia: stripDangerousText(structured.referencia, LIMITS.referencia),
    Objetivo: stripDangerousText(structured.objetivo, 300),
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



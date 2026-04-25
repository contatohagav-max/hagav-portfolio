export const PRICING_RULES_VERSION = 2;

const LEGACY_DEFAULT_PRICING_RULES = Object.freeze({
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
    default_dr: 210,
  },
  volumeDiscounts: [
    { min: 1, max: 4, percent: 0 },
    { min: 5, max: 9, percent: 3 },
    { min: 10, max: 19, percent: 6 },
    { min: 20, max: 29, percent: 10 },
    { min: 30, max: 99999, percent: 10 },
  ],
  complexidade: {
    N1: 0.7,
    N2: 1,
    N3: 1.5,
    n1MaxMin: 30,
    n2MaxMin: 120,
  },
  margem: {
    choHora: 41.67,
    minimaSegura: 60,
    saudavelMin: 65,
    saudavelMax: 75,
    excelente: 75,
    recusaAbaixo: 55,
    repasseEditorMin: 30,
    repasseEditorMax: 35,
  },
});

export const DEFAULT_PRICING_RULES = Object.freeze({
  version: PRICING_RULES_VERSION,
  basePriceMode: 'floor',
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
    default_dr: 210,
  },
  serviceHours: {
    reels_shorts_tiktok: 1,
    criativo_trafego_pago: 1.25,
    corte_podcast: 0.75,
    video_medio: 2.25,
    depoimento: 1.5,
    videoaula_modulo: 3,
    youtube: 4.5,
    vsl_15: 8,
    vsl_longa: 18,
    motion: 10,
    default: 1.5,
  },
  volumeDiscounts: [
    { min: 1, max: 4, percent: 0 },
    { min: 5, max: 9, percent: 3 },
    { min: 10, max: 19, percent: 5 },
    { min: 20, max: 29, percent: 8 },
    { min: 30, max: 99999, percent: 12 },
  ],
  complexidade: {
    N1: 1,
    N2: 1.08,
    N3: 1.18,
    n1MaxMin: 60,
    n2MaxMin: 150,
  },
  urgencia: {
    DU: {
      '24h': 1.3,
      '3 dias': 1.15,
      'Essa semana': 1,
      'Sem pressa': 1,
    },
    DR: {
      Imediato: 1.2,
      'Essa semana': 1,
      'Esse mês': 1,
      'Estou analisando': 1,
    },
    VSL: {
      '3 dias': 1.4,
    },
  },
  ajustes: {
    semReferencia: 10,
    multicamera: 15,
    materialNaoPronto: 5,
  },
  margem: {
    choHora: 45,
    minimaSegura: 55,
    saudavelMin: 65,
    saudavelMax: 75,
    excelente: 82,
    recusaAbaixo: 45,
    repasseEditorMin: 30,
    repasseEditorMax: 35,
  },
  pacotes: {
    sugerirAcimaQtd: 5,
    revisaoCapacidadeAcimaQtd: 30,
  },
});

const SCALE_ELIGIBLE_SERVICES = new Set([
  'reels_shorts_tiktok',
  'criativo_trafego_pago',
  'corte_podcast',
  'depoimento',
  'videoaula_modulo',
  'youtube',
]);

const MANUAL_REVIEW_SERVICES = new Set([
  'motion',
  'vsl_longa',
]);

function approx(a, b, tolerance = 0.001) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance;
}

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  if (!base || typeof base !== 'object') return override;
  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = value.slice();
      return;
    }
    if (value && typeof value === 'object') {
      merged[key] = deepMerge(base[key], value);
      return;
    }
    merged[key] = value;
  });
  return merged;
}

export function roundCurrency(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return 0;
  return Math.round(safe * 100) / 100;
}

function roundPercent(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return 0;
  return Math.round(safe * 10) / 10;
}

export function parsePositiveNumber(raw) {
  const match = String(raw || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return 0;
  const parsed = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseDurationToHours(raw, fallback = 0) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  const text = String(raw || '').trim().toLowerCase();
  if (!text) return fallback;

  const hhmm = text.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours + (minutes / 60);
    }
  }

  const compactHours = text.match(/^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2}))?$/);
  if (compactHours) {
    const hours = Number(String(compactHours[1]).replace(',', '.'));
    const minutes = Number(compactHours[2] || 0);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours + (minutes / 60);
    }
  }

  const extensoHoras = text.match(/^(\d+(?:[.,]\d+)?)\s*horas?$/);
  if (extensoHoras) {
    const hours = Number(String(extensoHoras[1]).replace(',', '.'));
    return Number.isFinite(hours) && hours > 0 ? hours : fallback;
  }

  const minutos = text.match(/^(\d+(?:[.,]\d+)?)\s*min(?:utos?)?$/);
  if (minutos) {
    const minutes = Number(String(minutos[1]).replace(',', '.'));
    return Number.isFinite(minutes) && minutes > 0 ? minutes / 60 : fallback;
  }

  const compactMixed = text.match(/^(\d+)\s*h\s*(\d{1,2})\s*m?(?:in)?$/);
  if (compactMixed) {
    const hours = Number(compactMixed[1]);
    const minutes = Number(compactMixed[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours + (minutes / 60);
    }
  }

  const parsed = parsePositiveNumber(text);
  if (!parsed) return fallback;
  if (text.includes('min')) return parsed / 60;
  if (text.includes('hora') || text.includes('h')) return parsed;
  if (parsed > 20) return parsed / 60;
  return parsed;
}

export function formatDurationCompact(hoursInput) {
  const hours = Number(hoursInput || 0);
  if (!Number.isFinite(hours) || hours <= 0) return '';
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  if (wholeHours === 0) return `0:${String(minutes).padStart(2, '0')}`;
  return `${wholeHours}h${String(minutes).padStart(2, '0')}`;
}

export function normalizeServiceKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function mapServiceCatalog(serviceLabel) {
  const normalized = normalizeServiceKey(serviceLabel);
  if (/(reels|shorts|tiktok|conteudo para redes sociais)/.test(normalized)) return 'reels_shorts_tiktok';
  if (/(criativo|trafego|anuncio|ads|criativos para anuncios)/.test(normalized)) return 'criativo_trafego_pago';
  if (/(corte|podcast)/.test(normalized)) return 'corte_podcast';
  if (/video medio/.test(normalized)) return 'video_medio';
  if (/depoimento/.test(normalized)) return 'depoimento';
  if (/(videoaula|modulo)/.test(normalized)) return 'videoaula_modulo';
  if (/(youtube|youtube recorrente)/.test(normalized)) return 'youtube';
  if (/vsl/.test(normalized) && /(longa|30 ?min|45 ?min|60 ?min|acima de 15|mais de 15)/.test(normalized)) return 'vsl_longa';
  if (/vsl/.test(normalized)) return 'vsl_15';
  if (/(motion|vinheta)/.test(normalized)) return 'motion';
  return 'default';
}

export function canonicalPrazoKey(rawPrazo) {
  const prazo = normalizeServiceKey(rawPrazo);
  if (!prazo) return '';
  if (prazo.includes('24h')) return '24h';
  if (prazo.includes('3 dia')) return '3 dias';
  if (prazo.includes('essa semana')) return 'Essa semana';
  if (prazo.includes('sem pressa')) return 'Sem pressa';
  if (prazo.includes('imediato')) return 'Imediato';
  if (prazo.includes('esse mes')) return 'Esse mês';
  if (prazo.includes('estou analisando')) return 'Estou analisando';
  return normalizeText(rawPrazo);
}

export function inferMaterialState(rawMaterial) {
  const lower = normalizeText(rawMaterial).toLowerCase();
  if (!lower) return 'desconhecido';
  if (lower.includes('sim')) return 'sim';
  if (lower.includes('nao') || lower.includes('não')) return 'nao';
  return 'parcial';
}

function hasReference(rawReference) {
  return normalizeText(rawReference).length > 3;
}

function detectMulticamera(text) {
  const normalized = normalizeServiceKey(text);
  return /(multicamera|multi camera|3 camera|3 cameras|3 cam|tres camera|tricamera)/.test(normalized);
}

function detectOperacaoEspecial(text) {
  const normalized = normalizeServiceKey(text);
  return /(operacao especial|efeito complexo|animacao complexa|captacao externa|captação externa)/.test(normalized);
}

function isLegacyVolumeTable(rules) {
  const volume = Array.isArray(rules?.volumeDiscounts) ? rules.volumeDiscounts : [];
  if (volume.length !== LEGACY_DEFAULT_PRICING_RULES.volumeDiscounts.length) return false;
  return volume.every((tier, index) => {
    const legacyTier = LEGACY_DEFAULT_PRICING_RULES.volumeDiscounts[index];
    return (
      Number(tier?.min) === Number(legacyTier.min)
      && Number(tier?.max) === Number(legacyTier.max)
      && Number(tier?.percent) === Number(legacyTier.percent)
    );
  });
}

function isLegacyComplexityTable(rules) {
  const complex = rules?.complexidade || {};
  const legacy = LEGACY_DEFAULT_PRICING_RULES.complexidade;
  return (
    approx(complex.N1, legacy.N1)
    && approx(complex.N2, legacy.N2)
    && approx(complex.N3, legacy.N3)
    && Number(complex.n1MaxMin || 0) === Number(legacy.n1MaxMin)
    && Number(complex.n2MaxMin || 0) === Number(legacy.n2MaxMin)
  );
}

export function normalizePricingRules(rawRules = {}) {
  const merged = deepMerge(DEFAULT_PRICING_RULES, rawRules || {});
  const normalized = {
    ...merged,
    serviceBase: { ...DEFAULT_PRICING_RULES.serviceBase, ...(merged.serviceBase || {}) },
    serviceHours: { ...DEFAULT_PRICING_RULES.serviceHours, ...(merged.serviceHours || {}) },
    complexidade: { ...DEFAULT_PRICING_RULES.complexidade, ...(merged.complexidade || {}) },
    urgencia: {
      ...DEFAULT_PRICING_RULES.urgencia,
      ...(merged.urgencia || {}),
      DU: { ...DEFAULT_PRICING_RULES.urgencia.DU, ...((merged.urgencia || {}).DU || {}) },
      DR: { ...DEFAULT_PRICING_RULES.urgencia.DR, ...((merged.urgencia || {}).DR || {}) },
      VSL: { ...DEFAULT_PRICING_RULES.urgencia.VSL, ...((merged.urgencia || {}).VSL || {}) },
    },
    ajustes: { ...DEFAULT_PRICING_RULES.ajustes, ...(merged.ajustes || {}) },
    margem: { ...DEFAULT_PRICING_RULES.margem, ...(merged.margem || {}) },
    pacotes: { ...DEFAULT_PRICING_RULES.pacotes, ...(merged.pacotes || {}) },
    volumeDiscounts: Array.isArray(merged.volumeDiscounts) && merged.volumeDiscounts.length > 0
      ? merged.volumeDiscounts.slice()
      : DEFAULT_PRICING_RULES.volumeDiscounts.slice(),
  };

  if (!normalized.serviceHours.default || Number(normalized.serviceHours.default) <= 0) {
    normalized.serviceHours.default = DEFAULT_PRICING_RULES.serviceHours.default;
  }

  const legacyLike = !rawRules?.version;
  if (legacyLike && approx(normalized.margem.choHora, LEGACY_DEFAULT_PRICING_RULES.margem.choHora)) {
    normalized.margem.choHora = DEFAULT_PRICING_RULES.margem.choHora;
  }
  if (legacyLike && isLegacyVolumeTable(normalized)) {
    normalized.volumeDiscounts = DEFAULT_PRICING_RULES.volumeDiscounts.slice();
  }
  if (legacyLike && isLegacyComplexityTable(normalized)) {
    normalized.complexidade = {
      ...normalized.complexidade,
      ...DEFAULT_PRICING_RULES.complexidade,
    };
  }

  normalized.version = PRICING_RULES_VERSION;
  normalized.basePriceMode = String(normalized.basePriceMode || DEFAULT_PRICING_RULES.basePriceMode).toLowerCase() === 'floor'
    ? 'floor'
    : 'reference';

  return normalized;
}

function getBaseUnitPrice(flow, serviceKey, pricingRules) {
  const base = pricingRules?.serviceBase || DEFAULT_PRICING_RULES.serviceBase;
  if (serviceKey === 'motion') {
    return Number(base.motion_min || DEFAULT_PRICING_RULES.serviceBase.motion_min);
  }
  const fromTable = Number(base[serviceKey]);
  if (Number.isFinite(fromTable) && fromTable > 0) return fromTable;
  return flow === 'DR'
    ? Number(base.default_dr || DEFAULT_PRICING_RULES.serviceBase.default_dr)
    : Number(base.default_du || DEFAULT_PRICING_RULES.serviceBase.default_du);
}

function getPresetHours(serviceKey, pricingRules) {
  const presets = pricingRules?.serviceHours || DEFAULT_PRICING_RULES.serviceHours;
  const fromTable = Number(presets[serviceKey]);
  if (Number.isFinite(fromTable) && fromTable > 0) return fromTable;
  return Number(presets.default || DEFAULT_PRICING_RULES.serviceHours.default || 1.5);
}

function getComplexidadeByHours(hours, pricingRules) {
  const safeHours = Number.isFinite(hours) ? hours : 0;
  const minutes = safeHours * 60;
  const limits = pricingRules?.complexidade || DEFAULT_PRICING_RULES.complexidade;
  if (minutes <= Number(limits.n1MaxMin || DEFAULT_PRICING_RULES.complexidade.n1MaxMin)) {
    return { nivel: 'N1', multiplicador: Number(limits.N1 || DEFAULT_PRICING_RULES.complexidade.N1) };
  }
  if (minutes <= Number(limits.n2MaxMin || DEFAULT_PRICING_RULES.complexidade.n2MaxMin)) {
    return { nivel: 'N2', multiplicador: Number(limits.N2 || DEFAULT_PRICING_RULES.complexidade.N2) };
  }
  return { nivel: 'N3', multiplicador: Number(limits.N3 || DEFAULT_PRICING_RULES.complexidade.N3) };
}

function readUrgencyMultiplier(flowTable, key) {
  const normalizedKey = normalizeServiceKey(key);
  if (!normalizedKey) return 1;
  for (const [rawKey, rawValue] of Object.entries(flowTable || {})) {
    if (normalizeServiceKey(rawKey) !== normalizedKey) continue;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }
  return 1;
}

function getUrgencyContext(flow, prazo, serviceKey, pricingRules) {
  const key = canonicalPrazoKey(prazo);
  const urgencia = pricingRules?.urgencia || DEFAULT_PRICING_RULES.urgencia;
  const flowTable = flow === 'DR' ? urgencia.DR : urgencia.DU;
  const vslTable = urgencia.VSL || {};
  let multiplier = readUrgencyMultiplier(flowTable, key);
  let forcedManual = false;
  let blocked = false;
  const reasons = [];

  if ((serviceKey === 'vsl_15' || serviceKey === 'vsl_longa') && key === '24h') {
    multiplier = 1;
    blocked = true;
    forcedManual = true;
    reasons.push('VSL nao aceita prazo 24h.');
  } else if ((serviceKey === 'vsl_15' || serviceKey === 'vsl_longa') && key === '3 dias') {
    multiplier = Math.max(multiplier, readUrgencyMultiplier(vslTable, '3 dias') || 1.4);
  }

  if (flow === 'DU' && key === '24h') {
    const allow24h = serviceKey === 'reels_shorts_tiktok' || serviceKey === 'criativo_trafego_pago';
    if (!allow24h) {
      forcedManual = true;
      reasons.push('24h em DU requer revisao manual para este servico.');
    }
  }

  return {
    key,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
    forcedManual,
    blocked,
    reasons,
  };
}

function getVolumeDiscount(totalQty, pricingRules) {
  const rules = Array.isArray(pricingRules?.volumeDiscounts)
    ? pricingRules.volumeDiscounts
    : DEFAULT_PRICING_RULES.volumeDiscounts;
  const safeQty = Math.max(1, Math.round(Number(totalQty || 0) || 1));
  for (const tier of rules) {
    const min = Number(tier?.min || 0);
    const max = Number(tier?.max || 999999);
    if (safeQty >= min && safeQty <= max) {
      return Number(tier?.percent || 0);
    }
  }
  return 0;
}

function getMarginFloorPrice(costReal, marginPercent) {
  const cost = Number(costReal || 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const margin = Number(marginPercent || 0) / 100;
  if (!Number.isFinite(margin) || margin <= 0) return cost;
  if (margin >= 0.95) return cost;
  return cost / (1 - margin);
}

function getMarginHealth(marginPercent, profitValue, pricingRules) {
  const rules = pricingRules?.margem || DEFAULT_PRICING_RULES.margem;
  const margin = Number(marginPercent || 0);
  const profit = Number(profitValue || 0);
  if (!Number.isFinite(profit) || profit <= 0) {
    return {
      tone: 'red',
      label: 'Lucro negativo',
      description: 'Preco final abaixo do custo real.',
    };
  }
  if (!Number.isFinite(margin) || margin < Number(rules.minimaSegura || DEFAULT_PRICING_RULES.margem.minimaSegura)) {
    return {
      tone: 'yellow',
      label: 'Margem abaixo da meta',
      description: 'Ajuste o preco ou reduza desconto para proteger a operacao.',
    };
  }
  return {
    tone: 'green',
    label: margin >= Number(rules.excelente || DEFAULT_PRICING_RULES.margem.excelente) ? 'Margem excelente' : 'Margem saudavel',
    description: 'Cenário comercial protegido.',
  };
}

function buildPackageSuggestion(flow, totalQty, scaleQty, pricingRules) {
  const threshold = Number((pricingRules?.pacotes || DEFAULT_PRICING_RULES.pacotes).sugerirAcimaQtd || DEFAULT_PRICING_RULES.pacotes.sugerirAcimaQtd);
  const qty = Math.max(scaleQty || 0, totalQty || 0);
  if (qty >= 30) return flow === 'DR' ? 'Pacote Escala Mensal' : 'Pacote Escala';
  if (qty >= 20) return flow === 'DR' ? 'Pacote Performance Mensal' : 'Pacote Performance';
  if (qty >= 10) return flow === 'DR' ? 'Pacote Crescimento Mensal' : 'Pacote Crescimento';
  if (qty >= threshold) return flow === 'DR' ? 'Pacote Essencial Mensal' : 'Pacote Essencial';
  return flow === 'DR' ? 'Plano recorrente' : 'Projeto avulso';
}

function canApplyScaleDiscount(serviceKey, quantity) {
  return quantity >= 5 && SCALE_ELIGIBLE_SERVICES.has(serviceKey);
}

function maxDiscountAllowed(preDiscountPrice, minimumAllowedPrice) {
  if (!Number.isFinite(preDiscountPrice) || preDiscountPrice <= 0) return 0;
  if (!Number.isFinite(minimumAllowedPrice) || minimumAllowedPrice <= 0) return 100;
  const raw = (1 - (minimumAllowedPrice / preDiscountPrice)) * 100;
  return Math.max(0, Math.min(100, raw));
}

function toItemQuantity(value) {
  return Math.max(1, Math.round(parsePositiveNumber(value || '1') || 1));
}

function highestComplexityLevel(current, next) {
  const order = { N1: 1, N2: 2, N3: 3 };
  return (order[next] || 0) > (order[current] || 0) ? next : current;
}

function buildReasonSummary(itemReasons, summaryLines) {
  const lines = [...summaryLines, ...itemReasons].filter(Boolean);
  return lines.join(' ');
}

export function computeCommercialPricing(input = {}, pricingRulesInput = DEFAULT_PRICING_RULES) {
  const pricingRules = normalizePricingRules(pricingRulesInput);
  const flow = String(input?.flow || '').toUpperCase() === 'DR' ? 'DR' : 'DU';
  const observacoes = normalizeText(input?.observacoes);
  const referenciaGlobal = normalizeText(input?.referencia);
  const prazoGlobal = normalizeText(input?.prazo);
  const multicamera = detectMulticamera(`${observacoes} ${referenciaGlobal}`);
  const operacaoEspecial = detectOperacaoEspecial(`${observacoes} ${(input?.items || []).map((item) => item?.servico || '').join(' ')}`);
  const multicameraPercent = multicamera ? Number(pricingRules.ajustes.multicamera || 0) : 0;
  const materialNaoProntoPercent = Number(pricingRules.ajustes.materialNaoPronto || 0);
  const minMargin = Number(pricingRules.margem.minimaSegura || 0);
  const saudavelMin = Number(pricingRules.margem.saudavelMin || minMargin);
  const saudavelMax = Number(pricingRules.margem.saudavelMax || saudavelMin);
  const recusaAbaixo = Number(pricingRules.margem.recusaAbaixo || 0);
  const choHora = Number(pricingRules.margem.choHora || DEFAULT_PRICING_RULES.margem.choHora);
  const basePriceMode = pricingRules.basePriceMode === 'floor' ? 'floor' : 'reference';
  const itemsInput = Array.isArray(input?.items) && input.items.length > 0
    ? input.items
    : [{
      servico: normalizeText(input?.servico) || 'Servico',
      quantidade: normalizeText(input?.quantidade) || '1',
      material_gravado: normalizeText(input?.material_gravado),
      tempo_bruto: normalizeText(input?.tempo_bruto),
      horas_estimadas: normalizeText(input?.horas_estimadas),
      prazo: prazoGlobal,
      referencia: referenciaGlobal,
    }];

  let precoBase = 0;
  let valorSugerido = 0;
  let custoReal = 0;
  let precoAntesDesconto = 0;
  let economiaTotal = 0;
  let totalQuantidade = 0;
  let totalHoras = 0;
  let totalEscalavel = 0;
  let maxUrgencyMultiplier = 1;
  let weightedComplexity = 0;
  let complexidadeNivel = 'N1';
  let descontoVolumePercent = 0;
  let alertaCapacidade = false;
  let revisaoManual = false;
  let anyReferenceAdjustment = false;
  const itemReasons = [];
  const itensServico = [];

  for (const rawItem of itemsInput) {
    const servico = normalizeText(rawItem?.servico) || 'Servico';
    const serviceKey = mapServiceCatalog(servico);
    const quantidade = toItemQuantity(rawItem?.quantidade);
    const materialGravado = normalizeText(rawItem?.material_gravado);
    const tempoBruto = normalizeText(rawItem?.tempo_bruto);
    const horasEstimadasRaw = normalizeText(rawItem?.horas_estimadas || rawItem?.horas_por_unidade || rawItem?.duracao_sugerida);
    const prazo = normalizeText(rawItem?.prazo || prazoGlobal);
    const referencia = normalizeText(rawItem?.referencia || referenciaGlobal);
    const baseUnit = getBaseUnitPrice(flow, serviceKey, pricingRules);
    const presetHours = getPresetHours(serviceKey, pricingRules);
    const parsedHours = parseDurationToHours(horasEstimadasRaw || tempoBruto, 0);
    const horasPorUnidade = parsedHours > 0 ? parsedHours : presetHours;
    const horasTotais = horasPorUnidade * quantidade;
    const custoRealItem = roundCurrency(horasTotais * choHora);
    const precoBaseItem = roundCurrency(baseUnit * quantidade);
    const complexidade = getComplexidadeByHours(horasPorUnidade, pricingRules);
    const urgencia = getUrgencyContext(flow, prazo, serviceKey, pricingRules);
    const materialState = inferMaterialState(materialGravado);
    const semReferenciaPercent = hasReference(referencia) ? 0 : Number(pricingRules.ajustes.semReferencia || 0);
    const referenceFactor = semReferenciaPercent > 0 ? (1 + (semReferenciaPercent / 100)) : 1;
    const materialFactor = materialState === 'nao' ? (1 + (materialNaoProntoPercent / 100)) : 1;
    const multicameraFactor = multicameraPercent > 0 ? (1 + (multicameraPercent / 100)) : 1;
    const fatorComercial = complexidade.multiplicador * urgencia.multiplier * referenceFactor * materialFactor * multicameraFactor;
    const precoReferenciaItem = roundCurrency(precoBaseItem * fatorComercial);
    const precoMinimoMargemItem = roundCurrency(getMarginFloorPrice(custoRealItem, minMargin));
    const precoBasePisoItem = basePriceMode === 'floor' ? precoBaseItem : 0;
    const precoAntesDescontoItem = roundCurrency(Math.max(precoReferenciaItem, precoMinimoMargemItem, precoBasePisoItem));

    let descontoDesejado = canApplyScaleDiscount(serviceKey, quantidade)
      ? getVolumeDiscount(quantidade, pricingRules)
      : 0;
    const descontoMaximoPermitido = maxDiscountAllowed(precoAntesDescontoItem, Math.max(precoMinimoMargemItem, precoBasePisoItem));
    if (descontoDesejado > descontoMaximoPermitido) {
      descontoDesejado = descontoMaximoPermitido;
    }
    const descontoAplicado = roundPercent(descontoDesejado);
    const precoComDesconto = roundCurrency(precoAntesDescontoItem * (1 - (descontoAplicado / 100)));
    const precoFinalItem = roundCurrency(Math.max(precoComDesconto, precoMinimoMargemItem, precoBasePisoItem));
    const economiaItem = roundCurrency(Math.max(0, precoAntesDescontoItem - precoFinalItem));
    const lucroItem = roundCurrency(precoFinalItem - custoRealItem);
    const margemItem = precoFinalItem > 0
      ? roundPercent(((precoFinalItem - custoRealItem) / precoFinalItem) * 100)
      : 0;

    precoBase += precoBaseItem;
    valorSugerido += precoFinalItem;
    custoReal += custoRealItem;
    precoAntesDesconto += precoAntesDescontoItem;
    economiaTotal += economiaItem;
    totalQuantidade += quantidade;
    totalHoras += horasTotais;
    if (canApplyScaleDiscount(serviceKey, quantidade)) {
      totalEscalavel += quantidade;
    }
    maxUrgencyMultiplier = Math.max(maxUrgencyMultiplier, urgencia.multiplier);
    weightedComplexity += complexidade.multiplicador * quantidade;
    complexidadeNivel = highestComplexityLevel(complexidadeNivel, complexidade.nivel);
    descontoVolumePercent = Math.max(descontoVolumePercent, descontoAplicado);
    anyReferenceAdjustment = anyReferenceAdjustment || semReferenciaPercent > 0;

    if (MANUAL_REVIEW_SERVICES.has(serviceKey)) {
      revisaoManual = true;
      itemReasons.push(`${servico}: servico de revisao manual.`);
    }
    if (urgencia.forcedManual || urgencia.blocked) {
      revisaoManual = true;
      urgencia.reasons.forEach((reason) => itemReasons.push(`${servico}: ${reason}`));
    }
    if (margemItem < recusaAbaixo) {
      revisaoManual = true;
      itemReasons.push(`${servico}: margem estimada em ${margemItem}% abaixo do limite de ${recusaAbaixo}%.`);
    }

    itensServico.push({
      servico,
      quantidade,
      material_gravado: materialGravado,
      tempo_bruto: tempoBruto || formatDurationCompact(horasPorUnidade),
      horas_estimadas: formatDurationCompact(horasPorUnidade),
      horas_por_unidade: roundCurrency(horasPorUnidade),
      horas_totais: roundCurrency(horasTotais),
      referencia,
      prazo,
      preco_base_item: precoBaseItem,
      preco_referencia_item: precoReferenciaItem,
      preco_minimo_margem_item: precoMinimoMargemItem,
      preco_antes_desconto_item: precoAntesDescontoItem,
      valor_sugerido_item: precoFinalItem,
      custo_real_item: custoRealItem,
      lucro_item: lucroItem,
      margem_item: margemItem,
      economia_item: economiaItem,
      desconto_volume_percent: descontoAplicado,
      complexidade_nivel: complexidade.nivel,
      multiplicador_complexidade: roundCurrency(complexidade.multiplicador),
      multiplicador_urgencia: roundCurrency(urgencia.multiplier),
      material_estado: materialState,
      horas_origem: parsedHours > 0 ? 'informado' : 'preset',
    });
  }

  if (totalQuantidade > Number(pricingRules.pacotes.revisaoCapacidadeAcimaQtd || DEFAULT_PRICING_RULES.pacotes.revisaoCapacidadeAcimaQtd)) {
    alertaCapacidade = true;
    revisaoManual = true;
    itemReasons.push(`Volume acima de ${pricingRules.pacotes.revisaoCapacidadeAcimaQtd || DEFAULT_PRICING_RULES.pacotes.revisaoCapacidadeAcimaQtd} itens: revisar capacidade.`);
  }

  if (operacaoEspecial) {
    revisaoManual = true;
    itemReasons.push('Operacao especial detectada: revisar escopo manualmente.');
  }

  const precoBaseRounded = Math.max(1, roundCurrency(precoBase));
  const valorSugeridoRounded = Math.max(1, roundCurrency(valorSugerido));
  const custoRealRounded = roundCurrency(custoReal);
  const economiaTotalRounded = roundCurrency(economiaTotal);
  const lucroEstimado = roundCurrency(valorSugeridoRounded - custoRealRounded);
  const margemEstimada = valorSugeridoRounded > 0
    ? roundPercent(((valorSugeridoRounded - custoRealRounded) / valorSugeridoRounded) * 100)
    : 0;
  const multiplicadorComplexidade = totalQuantidade > 0
    ? roundCurrency(weightedComplexity / totalQuantidade)
    : 1;

  const margemSaudavelMin = roundCurrency(getMarginFloorPrice(custoRealRounded, saudavelMin));
  const margemSaudavelMax = roundCurrency(getMarginFloorPrice(custoRealRounded, Math.min(saudavelMax, 90)));
  const faixaMin = Math.max(
    roundCurrency(Math.max(getMarginFloorPrice(custoRealRounded, minMargin), basePriceMode === 'floor' ? precoBaseRounded : 0)),
    roundCurrency(Math.min(valorSugeridoRounded, margemSaudavelMin || valorSugeridoRounded))
  );
  const faixaMax = Math.max(
    faixaMin,
    roundCurrency(Math.max(valorSugeridoRounded, margemSaudavelMin, margemSaudavelMax))
  );
  const faixaSugerida = `R$ ${faixaMin.toFixed(2)} a R$ ${faixaMax.toFixed(2)}`;
  const descontoRealPercent = precoAntesDesconto > 0
    ? roundPercent((economiaTotalRounded / precoAntesDesconto) * 100)
    : 0;
  const pacoteSugerido = buildPackageSuggestion(flow, totalQuantidade, totalEscalavel, pricingRules);
  const marginHealth = getMarginHealth(margemEstimada, lucroEstimado, pricingRules);

  const summaryLines = [
    `Custo real estimado: R$ ${custoRealRounded.toFixed(2)} com C/HORA de R$ ${roundCurrency(choHora).toFixed(2)}.`,
    `Preco base de mercado: R$ ${precoBaseRounded.toFixed(2)} em modo ${basePriceMode === 'floor' ? 'piso minimo' : 'referencia'}.`,
    `Horas totais estimadas: ${roundCurrency(totalHoras).toFixed(2)}h.`,
    descontoRealPercent > 0
      ? `Desconto por escala aplicado: ${descontoRealPercent}% com economia de R$ ${economiaTotalRounded.toFixed(2)}.`
      : 'Sem desconto por escala aplicado.',
    pacoteSugerido ? `Pacote sugerido: ${pacoteSugerido}.` : '',
    anyReferenceAdjustment ? 'Sem referencia visual: ajuste comercial aplicado.' : '',
    multicameraPercent > 0 ? `Multicamera detectada: ajuste de ${multicameraPercent}% aplicado.` : '',
  ];

  return {
    pricingRuleVersion: pricingRules.version || PRICING_RULES_VERSION,
    basePriceMode,
    choHora: roundCurrency(choHora),
    precoBase: precoBaseRounded,
    precoFinal: valorSugeridoRounded,
    valorSugerido: valorSugeridoRounded,
    valorEstimado: valorSugeridoRounded,
    custoReal: custoRealRounded,
    custoEstimado: custoRealRounded,
    lucroEstimado,
    margemEstimada,
    margemStatus: marginHealth,
    faixaSugerida,
    descontoVolumePercent: descontoRealPercent,
    descontoVolumePercentMax: descontoVolumePercent,
    economiaTotal: economiaTotalRounded,
    multiplicadorUrgencia: roundCurrency(maxUrgencyMultiplier),
    multiplicadorComplexidade,
    complexidadeNivel: complexidadeNivel || 'N1',
    ajusteReferenciaPercent: anyReferenceAdjustment ? Number(pricingRules.ajustes.semReferencia || 0) : 0,
    ajusteMulticameraPercent: multicameraPercent,
    revisaoManual,
    alertaCapacidade,
    operacaoEspecial,
    pacoteSugerido,
    totalQuantidade,
    totalHoras: roundCurrency(totalHoras),
    itensServico,
    motivoCalculo: buildReasonSummary(itemReasons, summaryLines),
  };
}

export function deriveFinalPriceMetrics(snapshot, precoFinalInput, pricingRulesInput = DEFAULT_PRICING_RULES) {
  const pricingRules = normalizePricingRules(pricingRulesInput);
  const costReal = roundCurrency(snapshot?.custoReal || snapshot?.custoEstimado || 0);
  const precoFinal = roundCurrency(precoFinalInput ?? snapshot?.precoFinal ?? snapshot?.valorSugerido ?? 0);
  const lucroEstimado = roundCurrency(precoFinal - costReal);
  const margemPercentual = precoFinal > 0
    ? roundPercent(((precoFinal - costReal) / precoFinal) * 100)
    : 0;
  const health = getMarginHealth(margemPercentual, lucroEstimado, pricingRules);

  return {
    custo_real: costReal,
    custo_base: costReal,
    preco_final: Math.max(0, precoFinal),
    margem_percentual: margemPercentual,
    margem_estimada: margemPercentual,
    margem_comercial: margemPercentual,
    lucro_estimado: lucroEstimado,
    valor_estimado: roundCurrency(snapshot?.valorEstimado || snapshot?.valorSugerido || precoFinal),
    potencial_total: roundCurrency(snapshot?.valorEstimado || snapshot?.valorSugerido || precoFinal),
    margem_status: health,
  };
}

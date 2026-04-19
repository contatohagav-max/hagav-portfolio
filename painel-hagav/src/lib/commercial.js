import { parseISO, isValid, differenceInHours } from 'date-fns';

const HIGH_VALUE_KEYWORDS = [
  'criativo',
  'ads',
  'anuncio',
  'lancamento',
  'youtube',
  'estrutura',
  'recorrente'
];

const STATUS_ABERTO = new Set(['novo', 'chamado', 'proposta enviada']);
const STATUS_FECHADO = new Set(['fechado']);
const STATUS_PERDIDO = new Set(['perdido']);

const ORC_ABERTO = new Set(['pendente_revisao', 'em_revisao', 'aprovado', 'enviado']);
const ORC_GANHO = new Set(['aprovado', 'enviado']);
const ORC_REVISAO = new Set(['pendente_revisao', 'em_revisao']);

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
  pacotes: {
    sugerirAcimaQtd: 8,
    revisaoCapacidadeAcimaQtd: 30,
  },
};

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeServiceKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitPipeValues(value) {
  return String(value || '')
    .split('|')
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function parsePositiveNumber(raw) {
  const match = String(raw || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return 0;
  const num = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function parseHours(raw) {
  const text = String(raw || '').toLowerCase().trim();
  if (!text) return 0;

  const hhmm = text.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    return hours + (minutes / 60);
  }

  const value = parsePositiveNumber(text);
  if (!value) return 0;
  if (text.includes('min')) return value / 60;
  if (text.includes('hora') || text.includes('h')) return value;
  if (value > 20) return value / 60;
  return value;
}

function parseLabeledMap(value) {
  const map = {};
  for (const item of splitPipeValues(value)) {
    const idx = item.lastIndexOf(':');
    if (idx === -1) continue;
    const key = normalizeServiceKey(item.slice(0, idx));
    const val = normalizeText(item.slice(idx + 1));
    if (!key) continue;
    map[key] = val || '-';
  }
  return map;
}

function sumQuantidade(value) {
  const parts = splitPipeValues(value);
  if (parts.length === 0) return Math.max(1, Math.round(parsePositiveNumber(value) || 1));
  const total = parts.reduce((sum, part) => {
    const qty = Math.max(1, Math.round(parsePositiveNumber(part) || 1));
    return sum + qty;
  }, 0);
  return Math.max(1, total);
}

function canonicalPrazoKey(rawPrazo) {
  const prazo = normalizeServiceKey(rawPrazo);
  if (!prazo) return '';
  if (prazo.includes('24h')) return '24h';
  if (prazo.includes('3 dia')) return '3 dias';
  if (prazo.includes('essa semana')) return 'Essa semana';
  if (prazo.includes('sem pressa')) return 'Sem pressa';
  if (prazo.includes('imediato')) return 'Imediato';
  if (prazo.includes('esse mes')) return 'Esse mês';
  if (prazo.includes('estou analisando')) return 'Estou analisando';
  return rawPrazo || '';
}

function mapServiceCatalog(serviceLabel) {
  const normalized = normalizeServiceKey(serviceLabel);
  if (/(reels|shorts|tiktok|conteudo para redes sociais)/.test(normalized)) return 'reels_shorts_tiktok';
  if (/(criativo|trafego|anuncio|ads|criativos para anuncios)/.test(normalized)) return 'criativo_trafego_pago';
  if (/(corte|podcast)/.test(normalized)) return 'corte_podcast';
  if (/video medio/.test(normalized)) return 'video_medio';
  if (/depoimento/.test(normalized)) return 'depoimento';
  if (/(videoaula|modulo)/.test(normalized)) return 'videoaula_modulo';
  if (/(youtube|youtube recorrente)/.test(normalized)) return 'youtube';
  if (/vsl/.test(normalized) && /(longa|30|min|45|min|60|min)/.test(normalized)) return 'vsl_longa';
  if (/vsl/.test(normalized)) return 'vsl_15';
  if (/(motion|vinheta)/.test(normalized)) return 'motion';
  return 'default';
}

function getUnitPriceFromRules(flow, serviceKey, pricingRules = DEFAULT_PRICING_RULES) {
  const base = pricingRules.serviceBase || DEFAULT_PRICING_RULES.serviceBase;
  if (serviceKey === 'motion') return Number(base.motion_min || 900);
  const fromTable = Number(base[serviceKey]);
  if (Number.isFinite(fromTable) && fromTable > 0) return fromTable;
  return flow === 'DR'
    ? Number(base.default_dr || DEFAULT_PRICING_RULES.serviceBase.default_dr)
    : Number(base.default_du || DEFAULT_PRICING_RULES.serviceBase.default_du);
}

function getUrgencyMultiplier(flow, prazo, serviceKey) {
  const key = canonicalPrazoKey(prazo);
  const urgencia = DEFAULT_PRICING_RULES.urgencia;
  const flowTable = flow === 'DR' ? urgencia.DR : urgencia.DU;
  let multiplier = Number(flowTable[key] || 1);
  if ((serviceKey === 'vsl_15' || serviceKey === 'vsl_longa') && key === '3 dias') {
    multiplier = Math.max(multiplier, Number(urgencia.VSL['3 dias'] || 1.4));
  }
  return multiplier;
}

function getVolumeDiscount(totalQty) {
  const tiers = DEFAULT_PRICING_RULES.volumeDiscounts;
  const safeQty = Math.max(1, Math.round(Number(totalQty || 0) || 1));
  const tier = tiers.find((item) => safeQty >= Number(item.min) && safeQty <= Number(item.max));
  return Number(tier?.percent || 0);
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function extractMultiSelection(rawField) {
  if (Array.isArray(rawField)) return rawField;
  if (rawField && Array.isArray(rawField.selected)) return rawField.selected;
  return [];
}

function mapSelectionWithOutro(rawList, outroValue) {
  return extractMultiSelection(rawList)
    .map((item) => {
      const safe = normalizeText(item);
      if (safe !== 'Outro') return safe;
      const extra = normalizeText(outroValue);
      return extra ? `Outro: ${extra}` : 'Outro';
    })
    .filter(Boolean);
}

function toLooseMapEntries(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') return [];
  return Object.entries(rawMap)
    .map(([rawKey, rawVal]) => ({
      label: normalizeText(rawKey),
      normalized: normalizeServiceKey(rawKey),
      value: normalizeText(rawVal),
    }))
    .filter((entry) => entry.label);
}

function getLooseMapValue(entries, targetLabel) {
  const target = normalizeServiceKey(targetLabel);
  if (!target) return '';
  const found = entries.find((entry) => entry.normalized === target);
  return found?.value || '';
}

function buildStructuredFromAnswers(flow, answers) {
  const empty = {
    servico: '',
    quantidade: '',
    material_gravado: '',
    tempo_bruto: '',
    prazo: '',
    referencia: '',
  };
  if (!answers || typeof answers !== 'object') return empty;

  if (flow === 'DU') {
    const services = mapSelectionWithOutro(answers.unica_servicos, answers?.unica_servicos?.outro);
    const qtyEntries = toLooseMapEntries(answers.unica_quantidades);
    const materialEntries = toLooseMapEntries(answers.unica_gravado);
    const tempoEntries = toLooseMapEntries(answers.unica_tempo_bruto);
    const resolvedServices = services.length > 0 ? services : qtyEntries.map((entry) => entry.label).filter(Boolean);
    const primaryService = resolvedServices[0] || qtyEntries[0]?.label || '';

    return {
      servico: primaryService,
      quantidade: getLooseMapValue(qtyEntries, primaryService) || qtyEntries[0]?.value || '',
      material_gravado: getLooseMapValue(materialEntries, primaryService) || materialEntries[0]?.value || '',
      tempo_bruto: getLooseMapValue(tempoEntries, primaryService) || tempoEntries[0]?.value || '',
      prazo: normalizeText(answers.unica_prazo),
      referencia: normalizeText(answers.unica_referencia),
    };
  }

  const operations = mapSelectionWithOutro(answers.rec_operacoes, answers?.rec_operacoes?.outro);
  const qtyEntries = toLooseMapEntries(answers.rec_quantidades);
  const materialEntries = toLooseMapEntries(answers.rec_gravado_por_tipo);
  const tempoEntries = toLooseMapEntries(answers.rec_tempo_bruto_por_tipo);
  const resolvedOperations = operations.length > 0 ? operations : qtyEntries.map((entry) => entry.label).filter(Boolean);
  const primaryOperation = resolvedOperations[0] || qtyEntries[0]?.label || normalizeText(answers.rec_tipo_operacao);

  return {
    servico: primaryOperation,
    quantidade: getLooseMapValue(qtyEntries, primaryOperation) || qtyEntries[0]?.value || normalizeText(answers.rec_volume),
    material_gravado: getLooseMapValue(materialEntries, primaryOperation) || materialEntries[0]?.value || normalizeText(answers.rec_gravado),
    tempo_bruto: getLooseMapValue(tempoEntries, primaryOperation) || tempoEntries[0]?.value || normalizeText(answers.rec_tempo_bruto),
    prazo: normalizeText(answers.rec_inicio || answers.recorrente_prazo),
    referencia: normalizeText(answers.rec_referencia || answers.referencia),
  };
}

function applyStructuredFallback(record) {
  const parsed = parseJsonSafe(record?.detalhes);
  const answers = parsed?.respostasCompletas || parsed?.answers || null;
  if (!answers || typeof answers !== 'object') return record;

  const flowRaw = normalizeText(record?.fluxo || record?.Fluxo || parsed?.fluxo || '');
  const flow = flowRaw.toUpperCase() === 'DR' ? 'DR' : 'DU';
  const structured = buildStructuredFromAnswers(flow, answers);

  return {
    ...record,
    servico: normalizeText(record?.servico) || structured.servico,
    quantidade: normalizeText(record?.quantidade) || structured.quantidade,
    material_gravado: normalizeText(record?.material_gravado) || structured.material_gravado,
    tempo_bruto: normalizeText(record?.tempo_bruto) || structured.tempo_bruto,
    prazo: normalizeText(record?.prazo) || structured.prazo,
    referencia: normalizeText(record?.referencia) || structured.referencia,
  };
}

function inferFlow(record) {
  const flow = normalizeText(record?.fluxo || record?.Fluxo || '').toUpperCase();
  if (flow === 'DR') return 'DR';
  if (flow === 'DU') return 'DU';
  if (flow.includes('WHATSAPP')) return 'WHATSAPP';
  return 'DU';
}

export function inferUrgencia(rawPrazo) {
  const prazo = normalizeText(rawPrazo).toLowerCase();
  if (!prazo) return 'media';
  if (prazo.includes('24h') || prazo.includes('imediato') || prazo.includes('urgente')) return 'alta';
  if (prazo.includes('3 dia') || prazo.includes('essa semana') || prazo.includes('semana')) return 'media';
  if (prazo.includes('sem pressa') || prazo.includes('analisando') || prazo.includes('analisando')) return 'baixa';
  return 'media';
}

function inferMaterialState(rawMaterial) {
  const lower = normalizeText(rawMaterial).toLowerCase();
  if (!lower) return 'desconhecido';
  if (lower.includes('sim')) return 'sim';
  if (lower.includes('nao') || lower.includes('não')) return 'nao';
  return 'parcial';
}

function hasReference(rawReference) {
  return normalizeText(rawReference).length > 3;
}

function hasHighValueService(rawService) {
  const lower = normalizeText(rawService).toLowerCase();
  if (!lower) return false;
  return HIGH_VALUE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function computePricingSnapshot(record) {
  const flow = inferFlow(record);
  const service = normalizeText(record?.servico || record?.ServicoOuOperacao || '');
  const quantidade = Math.max(1, Math.round(parsePositiveNumber(record?.quantidade || record?.Quantidade || '1') || 1));
  const serviceKey = mapServiceCatalog(service);
  const unitPrice = getUnitPriceFromRules(flow, serviceKey);
  const tempoMinutes = parseHours(record?.tempo_bruto || record?.TempoBruto || '') * 60;
  const material = inferMaterialState(record?.material_gravado || record?.MaterialGravado || '');

  let complexidadeNivel = 'N2';
  let multiplicadorComplexidade = Number(DEFAULT_PRICING_RULES.complexidade.N2 || 1);
  if (tempoMinutes > 0 && tempoMinutes <= Number(DEFAULT_PRICING_RULES.complexidade.n1MaxMin || 30)) {
    complexidadeNivel = 'N1';
    multiplicadorComplexidade = Number(DEFAULT_PRICING_RULES.complexidade.N1 || 0.7);
  }
  if (tempoMinutes > Number(DEFAULT_PRICING_RULES.complexidade.n2MaxMin || 120)) {
    complexidadeNivel = 'N3';
    multiplicadorComplexidade = Number(DEFAULT_PRICING_RULES.complexidade.N3 || 1.5);
  }

  const multiplicadorUrgencia = getUrgencyMultiplier(flow, record?.prazo || record?.Prazo || '', serviceKey);
  const descontoVolumePercent = getVolumeDiscount(quantidade);
  const ajusteReferenciaPercent = hasReference(record?.referencia || record?.Referencia || '')
    ? 0
    : Number(DEFAULT_PRICING_RULES.ajustes.semReferencia || 10);

  const precoBase = Math.max(1, Math.round(unitPrice * quantidade * 100) / 100);
  let valorSugerido = precoBase * multiplicadorComplexidade * multiplicadorUrgencia;
  if (material === 'nao') valorSugerido *= 1.05;
  if (ajusteReferenciaPercent > 0) valorSugerido *= (1 + ajusteReferenciaPercent / 100);
  if (descontoVolumePercent > 0) valorSugerido *= (1 - descontoVolumePercent / 100);
  valorSugerido = Math.max(1, Math.round(valorSugerido * 100) / 100);

  const faixaMin = Math.max(1, Math.round(valorSugerido * 0.9 * 100) / 100);
  const faixaMax = Math.max(faixaMin, Math.round(valorSugerido * 1.1 * 100) / 100);
  const faixaSugerida = `R$ ${faixaMin.toFixed(2)} a R$ ${faixaMax.toFixed(2)}`;

  const choHora = Number(DEFAULT_PRICING_RULES.margem.choHora || 41.67);
  const horasEstimadas = parseHours(record?.tempo_bruto || record?.TempoBruto || '') || Math.max(1, quantidade * (flow === 'DR' ? 1.1 : 1.3));
  const custoEstimado = horasEstimadas * choHora;
  const margem = valorSugerido > 0 ? ((valorSugerido - custoEstimado) / valorSugerido) * 100 : 0;
  const margemEstimada = Math.round(Math.min(95, Math.max(0, margem)) * 10) / 10;

  const revisaoManual = quantidade > Number(DEFAULT_PRICING_RULES.pacotes.revisaoCapacidadeAcimaQtd || 30)
    || complexidadeNivel === 'N3'
    || serviceKey === 'youtube'
    || serviceKey === 'vsl_15'
    || serviceKey === 'vsl_longa'
    || serviceKey === 'motion';

  return {
    precoBase,
    valorSugerido,
    margemEstimada,
    faixaSugerida,
    descontoVolumePercent,
    multiplicadorUrgencia,
    multiplicadorComplexidade,
    complexidadeNivel,
    ajusteReferenciaPercent,
    revisaoManual,
  };
}

export function estimateValorPotencial(record) {
  const valorSugerido = toNumber(record?.valor_sugerido, 0);
  const precoFinal = toNumber(record?.preco_final, 0);
  const precoBase = toNumber(record?.preco_base, 0);
  const savedEstimate = toNumber(record?.valor_estimado, 0);
  if (valorSugerido > 0) return valorSugerido;
  if (precoFinal > 0) return precoFinal;
  if (savedEstimate > 0) return savedEstimate;
  if (precoBase > 0) return precoBase;

  const snapshot = computePricingSnapshot(record);
  return Math.max(150, snapshot.valorSugerido || 0);
}

export function estimateMargem(record) {
  const storedMargin = toNumber(record?.margem_estimada, NaN);
  if (Number.isFinite(storedMargin) && storedMargin > 0) return Math.min(95, Math.max(0, storedMargin));
  return computePricingSnapshot(record).margemEstimada;
}

export function estimateLeadScore(record) {
  const flow = inferFlow(record);
  const urgencia = inferUrgencia(record?.prazo || record?.Prazo || '');
  const material = inferMaterialState(record?.material_gravado || record?.MaterialGravado || '');
  const quantidade = sumQuantidade(record?.quantidade || record?.Quantidade || '1');
  const tempoHours = parseHours(record?.tempo_bruto || record?.TempoBruto || '');
  const referencia = hasReference(record?.referencia || record?.Referencia || '');
  const highValue = hasHighValueService(record?.servico || record?.ServicoOuOperacao || '');

  let score = 20;

  if (flow === 'DR') score += 20;
  if (highValue) score += 12;

  if (quantidade >= 20) score += 20;
  else if (quantidade >= 10) score += 14;
  else if (quantidade >= 5) score += 8;
  else if (quantidade >= 2) score += 4;

  if (material === 'sim') score += 10;
  if (material === 'nao') score -= 4;

  if (tempoHours >= 10) score += 10;
  else if (tempoHours >= 4) score += 6;

  if (referencia) score += 8;

  if (urgencia === 'alta') score += 18;
  else if (urgencia === 'media') score += 8;
  else score -= 6;

  const observacoes = normalizeText(record?.observacoes || record?.Observacoes || '');
  if (observacoes.length >= 80) score += 4;

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function temperatureByScore(score) {
  if (score >= 75) return 'Quente';
  if (score >= 45) return 'Morno';
  return 'Frio';
}

export function priorityByScore(score, urgencia) {
  if (urgencia === 'alta' || score >= 75) return 'alta';
  if (urgencia === 'baixa' && score < 45) return 'baixa';
  return 'media';
}

function buildResumoComercial(record, computed) {
  const flow = inferFlow(record);
  const service = normalizeText(record?.servico || record?.ServicoOuOperacao || '-') || '-';
  const quantidade = normalizeText(record?.quantidade || record?.Quantidade || '-') || '-';
  const material = normalizeText(record?.material_gravado || record?.MaterialGravado || '-') || '-';
  const prazo = normalizeText(record?.prazo || record?.Prazo || '-') || '-';

  return `${flow} | ${service} | Qtd: ${quantidade} | Material: ${material} | Prazo: ${prazo} | Score: ${computed.score}`;
}

function parseDateSafe(value) {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isLateFollowup(lead, nowDate) {
  if (STATUS_FECHADO.has(lead.status) || STATUS_PERDIDO.has(lead.status)) return false;

  const followupDate = parseDateSafe(lead.proximo_followup_em);
  if (followupDate) return followupDate.getTime() < nowDate.getTime();

  const lastContact = parseDateSafe(lead.ultimo_contato_em);
  const created = parseDateSafe(lead.created_at);

  if (lastContact) {
    return differenceInHours(nowDate, lastContact) > 48;
  }
  if (created) {
    return differenceInHours(nowDate, created) > 48;
  }
  return false;
}

export function enrichLeadRecord(record) {
  const normalizedRecord = applyStructuredFallback(record);
  const score = toNumber(normalizedRecord?.score_lead, NaN);
  const computedScore = Number.isFinite(score) && score > 0 ? Math.round(score) : estimateLeadScore(normalizedRecord);
  const urgencia = normalizeText(normalizedRecord?.urgencia || '').toLowerCase() || inferUrgencia(normalizedRecord?.prazo || normalizedRecord?.Prazo || '');
  const prioridade = normalizeText(normalizedRecord?.prioridade || '').toLowerCase() || priorityByScore(computedScore, urgencia);
  const temperatura = normalizeText(normalizedRecord?.temperatura || '') || temperatureByScore(computedScore);
  const valorEstimado = toNumber(normalizedRecord?.valor_estimado, 0) || estimateValorPotencial(normalizedRecord);

  const enriched = {
    ...normalizedRecord,
    score_lead: computedScore,
    urgencia,
    prioridade,
    temperatura,
    valor_estimado: Math.round(valorEstimado * 100) / 100,
    resumo_comercial: normalizeText(normalizedRecord?.resumo_comercial) || buildResumoComercial(normalizedRecord, { score: computedScore }),
  };

  return enriched;
}

export function enrichOrcamentoRecord(record) {
  const normalizedRecord = applyStructuredFallback(record);
  const enrichedLead = enrichLeadRecord(normalizedRecord);
  const snapshot = computePricingSnapshot(enrichedLead);
  const margem = estimateMargem(enrichedLead);

  const incompletoCampos = [];
  if (!normalizeText(enrichedLead?.servico)) incompletoCampos.push('servico');
  if (!normalizeText(enrichedLead?.quantidade)) incompletoCampos.push('quantidade');
  if (!normalizeText(enrichedLead?.prazo)) incompletoCampos.push('prazo');
  if (!normalizeText(enrichedLead?.material_gravado)) incompletoCampos.push('material_gravado');
  if (!normalizeText(enrichedLead?.tempo_bruto)) incompletoCampos.push('tempo_bruto');

  const valorPotencial = estimateValorPotencial(enrichedLead);
  const precoBaseRaw = toNumber(enrichedLead?.preco_base, 0);
  const precoFinalRaw = toNumber(enrichedLead?.preco_final, 0);
  const valorSugeridoRaw = toNumber(enrichedLead?.valor_sugerido, 0);
  const precoBase = precoBaseRaw > 0 ? precoBaseRaw : snapshot.precoBase;
  const valorSugerido = valorSugeridoRaw > 0 ? valorSugeridoRaw : snapshot.valorSugerido;
  const precoFinal = precoFinalRaw > 0 ? precoFinalRaw : valorSugerido;
  const faixaSugerida = normalizeText(enrichedLead?.faixa_sugerida) || snapshot.faixaSugerida;
  const descontoVolumePercent = toNumber(enrichedLead?.desconto_volume_percent, NaN);
  const multipUrg = toNumber(enrichedLead?.multiplicador_urgencia, NaN);
  const multipComp = toNumber(enrichedLead?.multiplicador_complexidade, NaN);
  const complexidade = normalizeText(enrichedLead?.complexidade_nivel) || snapshot.complexidadeNivel;
  const revisaoManual = typeof enrichedLead?.revisao_manual === 'boolean' ? enrichedLead.revisao_manual : snapshot.revisaoManual;

  return {
    ...enrichedLead,
    margem_estimada: Math.round(margem * 10) / 10,
    preco_base: Math.round((precoBase || 0) * 100) / 100,
    valor_sugerido: Math.round((valorSugerido || 0) * 100) / 100,
    preco_final: Math.round((precoFinal || 0) * 100) / 100,
    faixa_sugerida: faixaSugerida,
    desconto_volume_percent: Number.isFinite(descontoVolumePercent) ? descontoVolumePercent : snapshot.descontoVolumePercent,
    multiplicador_urgencia: Number.isFinite(multipUrg) ? multipUrg : snapshot.multiplicadorUrgencia,
    multiplicador_complexidade: Number.isFinite(multipComp) ? multipComp : snapshot.multiplicadorComplexidade,
    complexidade_nivel: complexidade,
    revisao_manual: revisaoManual,
    ajuste_referencia_percent: toNumber(enrichedLead?.ajuste_referencia_percent, snapshot.ajusteReferenciaPercent),
    valor_estimado: Math.round((precoFinal || precoBase || valorPotencial) * 100) / 100,
    incompleto: incompletoCampos.length > 0,
    incompleto_campos: incompletoCampos,
    requer_revisao: ORC_REVISAO.has(enrichedLead?.status_orcamento) || precoFinal <= 0 || revisaoManual,
  };
}

function groupBy(items, getKey, getValue = () => 1, reducer = (acc, v) => acc + v, seed = 0) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    const value = getValue(item);
    const prev = map.has(key) ? map.get(key) : seed;
    map.set(key, reducer(prev, value));
  }
  return Array.from(map.entries());
}

export function buildDashboardInsights(rawLeads = [], rawOrcamentos = []) {
  const leads = rawLeads.map(enrichLeadRecord);
  const orcamentos = rawOrcamentos.map(enrichOrcamentoRecord);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const leadsMes = leads.filter((lead) => {
    const created = parseDateSafe(lead.created_at);
    return created ? created >= monthStart : false;
  });

  const leadsFechadosMes = leadsMes.filter((lead) => STATUS_FECHADO.has(lead.status));

  const orcamentosMes = orcamentos.filter((orc) => {
    const created = parseDateSafe(orc.created_at);
    return created ? created >= monthStart : false;
  });

  const receitaFechadaMes = orcamentosMes
    .filter((orc) => ORC_GANHO.has(orc.status_orcamento))
    .reduce((sum, orc) => sum + toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0), 0);

  const orcamentosAbertos = orcamentos
    .filter((orc) => ORC_ABERTO.has(orc.status_orcamento))
    .reduce((sum, orc) => sum + toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0), 0);

  const ticketMedio = leadsFechadosMes.length > 0
    ? receitaFechadaMes / leadsFechadosMes.length
    : 0;

  const taxaConversao = leadsMes.length > 0
    ? (leadsFechadosMes.length / leadsMes.length) * 100
    : 0;

  const leadsUrgentes = leads.filter((lead) => lead.urgencia === 'alta' && STATUS_ABERTO.has(lead.status)).length;
  const followupAtrasado = leads.filter((lead) => isLateFollowup(lead, now)).length;

  const temposResposta = leads
    .map((lead) => {
      const created = parseDateSafe(lead.created_at);
      const lastContact = parseDateSafe(lead.ultimo_contato_em);
      if (!created || !lastContact || lastContact <= created) return null;
      return differenceInHours(lastContact, created);
    })
    .filter((value) => value !== null);

  const tempoMedioResposta = temposResposta.length > 0
    ? temposResposta.reduce((sum, value) => sum + value, 0) / temposResposta.length
    : 0;

  const origemGrouped = groupBy(
    leads,
    (lead) => normalizeText(lead.origem || 'Sem origem'),
    () => ({ total: 1, fechados: 0 }),
    (acc, value) => ({
      total: acc.total + value.total,
      fechados: acc.fechados + value.fechados,
    }),
    { total: 0, fechados: 0 }
  ).map(([origem, values]) => {
    const closed = leads.filter((lead) => normalizeText(lead.origem || 'Sem origem') === origem && STATUS_FECHADO.has(lead.status)).length;
    const conversion = values.total > 0 ? (closed / values.total) * 100 : 0;
    return {
      origem,
      leads: values.total,
      fechados: closed,
      conversao: Math.round(conversion * 10) / 10,
    };
  }).sort((a, b) => b.leads - a.leads);

  const serviceDemand = groupBy(
    orcamentos.flatMap((orc) => splitPipeValues(orc.servico).map((servico) => ({ servico }))),
    (entry) => normalizeText(entry.servico || 'Nao informado')
  ).map(([servico, total]) => ({ servico, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const revenueByService = groupBy(
    orcamentos.flatMap((orc) => {
      const servicos = splitPipeValues(orc.servico);
      if (servicos.length === 0) {
        return [{ servico: 'Nao informado', valor: toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0) }];
      }

      const valorTotal = toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0);
      const rateio = servicos.length > 0 ? valorTotal / servicos.length : valorTotal;
      return servicos.map((servico) => ({ servico, valor: rateio }));
    }),
    (entry) => normalizeText(entry.servico || 'Nao informado'),
    (entry) => toNumber(entry.valor, 0)
  ).map(([servico, valor]) => ({ servico, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const pipeline = [
    { status: 'novo', label: 'Novo' },
    { status: 'chamado', label: 'Contatado' },
    { status: 'proposta enviada', label: 'Proposta' },
    { status: 'fechado', label: 'Fechado' },
    { status: 'perdido', label: 'Perdido' },
  ].map((step) => ({
    ...step,
    total: leads.filter((lead) => lead.status === step.status).length,
  }));

  const urgenciaData = ['alta', 'media', 'baixa'].map((urg) => ({
    urgencia: urg,
    total: leads.filter((lead) => lead.urgencia === urg).length,
  }));

  const ultimasEntradas = [...leads]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  const orcUrgentes = orcamentos
    .filter((orc) => orc.urgencia === 'alta' && ORC_ABERTO.has(orc.status_orcamento))
    .sort((a, b) => (b.valor_estimado || 0) - (a.valor_estimado || 0))
    .slice(0, 8);

  const orcIncompletos = orcamentos
    .filter((orc) => orc.incompleto)
    .slice(0, 8);

  return {
    metrics: {
      leadsMes: leadsMes.length,
      orcamentosAbertos,
      receitaFechadaMes,
      ticketMedio,
      taxaConversao,
      leadsUrgentes,
      followupAtrasado,
      tempoMedioResposta,
      totalLeads: leads.length,
      totalOrcamentos: orcamentos.length,
    },
    charts: {
      origemConversao: origemGrouped,
      servicosMaisPedidos: serviceDemand,
      receitaPorServico: revenueByService,
      funilPipeline: pipeline,
      leadsPorUrgencia: urgenciaData,
    },
    lists: {
      ultimasEntradas,
      orcUrgentes,
      orcIncompletos,
      orcSemRevisao: orcamentos.filter((orc) => orc.requer_revisao),
      maiorPotencial: [...orcamentos]
        .sort((a, b) => (b.valor_estimado || 0) - (a.valor_estimado || 0))
        .slice(0, 10),
    },
  };
}

export function mergeById(records = [], updated) {
  return records.map((record) => (record.id === updated.id ? { ...record, ...updated } : record));
}

export const COMMERCIAL_DEFAULTS = {
  scoreWeights: {
    urgenciaAlta: 18,
    fluxoRecorrente: 20,
    referenciaVisual: 8,
    materialGravado: 10,
    servicoAltoValor: 12,
    semPressa: -6,
  },
  pricing: DEFAULT_PRICING_RULES,
  pipelineStatus: ['novo', 'chamado', 'proposta enviada', 'fechado', 'perdido'],
};

import { parseISO, isValid, differenceInMinutes } from 'date-fns';

const HIGH_VALUE_KEYWORDS = [
  'criativo',
  'ads',
  'anuncio',
  'lancamento',
  'youtube',
  'estrutura',
  'recorrente'
];

const STATUS_ABERTO = new Set(['novo', 'em_contato', 'proposta']);
const STATUS_FECHADO = new Set(['fechado']);
const STATUS_PERDIDO = new Set(['perdido']);
const URGENCIA_OPERACIONAL = new Set(['alta', 'media']);

const ORC_ABERTO = new Set(['aberto']);
const ORC_GANHO = new Set(['fechado']);
const ORC_REVISAO = new Set(['pendente_revisao', 'em_revisao']);

const LEAD_STATUS_ALIAS = {
  novo: 'novo',
  chamado: 'em_contato',
  contatado: 'em_contato',
  em_contato: 'em_contato',
  proposta_enviada: 'proposta',
  proposta: 'proposta',
  fechado: 'fechado',
  perdido: 'perdido',
};

const LEAD_STATUS_PIPELINE_ALIAS = {
  novo: 'novo',
  chamado: 'chamado',
  contatado: 'chamado',
  em_contato: 'chamado',
  proposta_enviada: 'proposta enviada',
  proposta: 'proposta enviada',
  fechado: 'fechado',
  perdido: 'perdido',
};

const ORCAMENTO_STATUS_ALIAS = {
  pendente_revisao: 'aberto',
  em_revisao: 'aberto',
  pendente: 'aberto',
  proposta: 'aberto',
  proposta_enviada: 'aberto',
  enviado: 'aberto',
  em_negociacao: 'aberto',
  negociacao: 'aberto',
  aberto: 'aberto',
  aprovado: 'fechado',
  ganho: 'fechado',
  fechado: 'fechado',
  perdido: 'perdido',
  cancelado: 'perdido',
  reprovado: 'perdido',
  recusado: 'perdido',
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

const DR_OFFICIAL_ITEM_TOTALS = {
  reels_shorts_tiktok: {
    8: 1320,
    16: 2560,
  },
  criativo_trafego_pago: {
    30: 5520,
  },
  corte_podcast: {
    16: 1472,
  },
  youtube: {
    2: 1012,
    4: 1820,
  },
};

function toNumber(value, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return fallback;
    const sanitized = raw.replace(/[^\d,.\-]/g, '');
    if (!sanitized) return fallback;

    const commaIdx = sanitized.lastIndexOf(',');
    const dotIdx = sanitized.lastIndexOf('.');
    let normalized = sanitized;

    if (commaIdx > -1 && dotIdx > -1) {
      normalized = commaIdx > dotIdx
        ? sanitized.replace(/\./g, '').replace(',', '.')
        : sanitized.replace(/,/g, '');
    } else if (commaIdx > -1) {
      normalized = sanitized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = sanitized.replace(/,/g, '');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeStatusKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeLeadStatus(status) {
  const key = normalizeStatusKey(status);
  return LEAD_STATUS_ALIAS[key] || key;
}

function normalizeLeadStatusPipeline(status) {
  const key = normalizeStatusKey(status);
  return LEAD_STATUS_PIPELINE_ALIAS[key] || key;
}

function normalizeOrcamentoStatus(statusOrcamento, leadStatus) {
  const orcKey = normalizeStatusKey(statusOrcamento);
  const lead = normalizeLeadStatus(leadStatus);

  if (orcKey && ORCAMENTO_STATUS_ALIAS[orcKey]) {
    return ORCAMENTO_STATUS_ALIAS[orcKey];
  }

  // Se o orçamento já possui um status (mesmo fora do alias), tratamos como aberto
  // para evitar fechar receita por inferência de status de lead.
  if (orcKey) return 'aberto';

  if (lead === 'fechado') return 'fechado';
  if (lead === 'perdido') return 'perdido';
  if (lead && STATUS_ABERTO.has(lead)) return 'aberto';
  return '';
}

function isLeadFechadoStatus(status) {
  return STATUS_FECHADO.has(normalizeLeadStatus(status));
}

function isLeadPerdidoStatus(status) {
  return STATUS_PERDIDO.has(normalizeLeadStatus(status));
}

function isLeadAbertoStatus(status) {
  const normalized = normalizeLeadStatus(status);
  if (!normalized) return false;
  return normalized !== 'fechado' && normalized !== 'perdido';
}

function isOrcamentoFechado(orcamento) {
  return ORC_GANHO.has(normalizeOrcamentoStatus(orcamento?.status_orcamento, orcamento?.status));
}

function isOrcamentoAberto(orcamento) {
  return ORC_ABERTO.has(normalizeOrcamentoStatus(orcamento?.status_orcamento, orcamento?.status));
}

function getOrcamentoValorFechado(orcamento) {
  return toNumber(orcamento?.preco_final, 0)
    || toNumber(orcamento?.valor_sugerido, 0)
    || toNumber(orcamento?.preco_base, 0)
    || toNumber(orcamento?.valor_estimado, 0);
}

function getOrcamentoValorAberto(orcamento) {
  return toNumber(orcamento?.valor_sugerido, 0)
    || toNumber(orcamento?.valor_estimado, 0)
    || toNumber(orcamento?.preco_base, 0)
    || toNumber(orcamento?.preco_final, 0);
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

function summarizeItemsField(items, field, fallback = '') {
  if (!Array.isArray(items) || items.length === 0) return normalizeText(fallback);
  const parts = items
    .map((item) => {
      const service = normalizeText(item?.servico);
      const value = normalizeText(item?.[field]) || '-';
      if (!service) return value;
      return `${service}: ${value}`;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : normalizeText(fallback);
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

function roundCurrency(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return 0;
  return Math.round(safe * 100) / 100;
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
  if (/vsl/.test(normalized) && /(longa|30 ?min|45 ?min|60 ?min|acima de 15|mais de 15)/.test(normalized)) return 'vsl_longa';
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

function getDrOfficialItemTotal(serviceKey, qty) {
  const byService = DR_OFFICIAL_ITEM_TOTALS[serviceKey];
  if (!byService) return null;
  const total = Number(byService[Math.max(1, Math.round(Number(qty || 0) || 0))]);
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
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

function buildItemFromEntries(serviceLabel, qtyEntries, materialEntries, tempoEntries, defaults = {}) {
  const servico = normalizeText(serviceLabel);
  if (!servico) return null;

  const quantidade = getLooseMapValue(qtyEntries, servico) || normalizeText(defaults.quantidade) || '';
  const material = getLooseMapValue(materialEntries, servico) || normalizeText(defaults.material_gravado) || '';
  const tempo = getLooseMapValue(tempoEntries, servico) || normalizeText(defaults.tempo_bruto) || '';

  return {
    servico,
    quantidade: quantidade || '-',
    material_gravado: material,
    tempo_bruto: tempo,
    prazo: normalizeText(defaults.prazo),
    referencia: normalizeText(defaults.referencia),
  };
}

function buildStructuredFromAnswers(flow, answers) {
  const empty = {
    servico: '',
    servico_resumo: '',
    quantidade: '',
    quantidade_resumo: '',
    material_gravado: '',
    material_resumo: '',
    tempo_bruto: '',
    tempo_resumo: '',
    prazo: '',
    referencia: '',
    items: [],
  };
  if (!answers || typeof answers !== 'object') return empty;

  if (flow === 'DU') {
    const services = mapSelectionWithOutro(answers.unica_servicos, answers?.unica_servicos?.outro);
    const qtyEntries = toLooseMapEntries(answers.unica_quantidades);
    const materialEntries = toLooseMapEntries(answers.unica_gravado);
    const tempoEntries = toLooseMapEntries(answers.unica_tempo_bruto);
    const resolvedServices = services.length > 0
      ? services
      : qtyEntries.map((entry) => entry.label).filter(Boolean);
    const prazo = normalizeText(answers.unica_prazo);
    const referencia = normalizeText(answers.unica_referencia);

    const items = resolvedServices
      .map((service) => buildItemFromEntries(service, qtyEntries, materialEntries, tempoEntries, { prazo, referencia }))
      .filter(Boolean);
    const primary = items[0] || null;

    return {
      servico: normalizeText(primary?.servico),
      servico_resumo: items.map((item) => item.servico).join(' | '),
      quantidade: normalizeText(primary?.quantidade),
      quantidade_resumo: summarizeItemsField(items, 'quantidade', primary?.quantidade || ''),
      material_gravado: normalizeText(primary?.material_gravado),
      material_resumo: summarizeItemsField(items, 'material_gravado', primary?.material_gravado || ''),
      tempo_bruto: normalizeText(primary?.tempo_bruto),
      tempo_resumo: summarizeItemsField(items, 'tempo_bruto', primary?.tempo_bruto || ''),
      prazo,
      referencia,
      items,
    };
  }

  const operations = mapSelectionWithOutro(answers.rec_operacoes, answers?.rec_operacoes?.outro);
  const qtyEntries = toLooseMapEntries(answers.rec_quantidades);
  const materialEntries = toLooseMapEntries(answers.rec_gravado_por_tipo);
  const tempoEntries = toLooseMapEntries(answers.rec_tempo_bruto_por_tipo);
  const resolvedOperations = operations.length > 0
    ? operations
    : qtyEntries.map((entry) => entry.label).filter(Boolean);
  const fallbackOperation = normalizeText(answers.rec_tipo_operacao);
  const prazo = normalizeText(answers.rec_inicio || answers.recorrente_prazo);
  const referencia = normalizeText(answers.rec_referencia || answers.referencia);

  const items = (resolvedOperations.length > 0 ? resolvedOperations : [fallbackOperation])
    .map((operation) => buildItemFromEntries(operation, qtyEntries, materialEntries, tempoEntries, {
      quantidade: normalizeText(answers.rec_volume),
      material_gravado: normalizeText(answers.rec_gravado),
      tempo_bruto: normalizeText(answers.rec_tempo_bruto),
      prazo,
      referencia,
    }))
    .filter(Boolean);
  const primary = items[0] || null;

  return {
    servico: normalizeText(primary?.servico),
    servico_resumo: items.map((item) => item.servico).join(' | '),
    quantidade: normalizeText(primary?.quantidade),
    quantidade_resumo: summarizeItemsField(items, 'quantidade', primary?.quantidade || ''),
    material_gravado: normalizeText(primary?.material_gravado),
    material_resumo: summarizeItemsField(items, 'material_gravado', primary?.material_gravado || ''),
    tempo_bruto: normalizeText(primary?.tempo_bruto),
    tempo_resumo: summarizeItemsField(items, 'tempo_bruto', primary?.tempo_bruto || ''),
    prazo,
    referencia,
    items,
  };
}

function normalizeItemPayload(rawItem, defaults = {}) {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const servico = normalizeText(rawItem.servico || rawItem.servico_ou_operacao || rawItem.operacao || '');
  if (!servico) return null;
  return {
    servico,
    quantidade: normalizeText(rawItem.quantidade || defaults.quantidade) || '-',
    material_gravado: normalizeText(rawItem.material_gravado || defaults.material_gravado),
    tempo_bruto: normalizeText(rawItem.tempo_bruto || defaults.tempo_bruto),
    prazo: normalizeText(rawItem.prazo || defaults.prazo),
    referencia: normalizeText(rawItem.referencia || defaults.referencia),
    preco_base_item: toNumber(rawItem.preco_base_item, 0),
    valor_sugerido_item: toNumber(rawItem.valor_sugerido_item, 0),
    complexidade_nivel: normalizeText(rawItem.complexidade_nivel),
    multiplicador_complexidade: toNumber(rawItem.multiplicador_complexidade, 0),
    multiplicador_urgencia: toNumber(rawItem.multiplicador_urgencia, 0),
  };
}

function extractItemsFromRecordFields(record) {
  const services = splitPipeValues(record?.servico || record?.ServicoOuOperacao || '');
  const qtyByService = parseLabeledMap(record?.quantidade || record?.Quantidade || '');
  const materialByService = parseLabeledMap(record?.material_gravado || record?.MaterialGravado || '');
  const tempoByService = parseLabeledMap(record?.tempo_bruto || record?.TempoBruto || '');
  const qtyParts = splitPipeValues(record?.quantidade || record?.Quantidade || '');
  const materialParts = splitPipeValues(record?.material_gravado || record?.MaterialGravado || '');
  const tempoParts = splitPipeValues(record?.tempo_bruto || record?.TempoBruto || '');
  const prazo = normalizeText(record?.prazo || record?.Prazo || '');
  const referencia = normalizeText(record?.referencia || record?.Referencia || '');

  if (services.length === 0) {
    const fallbackService = normalizeText(record?.servico || record?.ServicoOuOperacao || '');
    if (!fallbackService) return [];
    return [
      {
        servico: fallbackService,
        quantidade: normalizeText(record?.quantidade || record?.Quantidade || '') || '-',
        material_gravado: normalizeText(record?.material_gravado || record?.MaterialGravado || ''),
        tempo_bruto: normalizeText(record?.tempo_bruto || record?.TempoBruto || ''),
        prazo,
        referencia,
      },
    ];
  }

  return services.map((servico, index) => {
    const key = normalizeServiceKey(servico);
    const qtyValue = qtyByService[key] || normalizeText(qtyParts[index] || qtyParts[0] || '');
    const materialValue = materialByService[key] || normalizeText(materialParts[index] || materialParts[0] || '');
    const tempoValue = tempoByService[key] || normalizeText(tempoParts[index] || tempoParts[0] || '');
    return {
      servico,
      quantidade: qtyValue || '-',
      material_gravado: materialValue,
      tempo_bruto: tempoValue,
      prazo,
      referencia,
    };
  });
}

function extractServiceItems(record) {
  const parsed = parseJsonSafe(record?.detalhes);
  const defaultData = {
    prazo: normalizeText(record?.prazo || record?.Prazo || parsed?.prazo || ''),
    referencia: normalizeText(record?.referencia || record?.Referencia || parsed?.referencia || ''),
  };

  const directItems = Array.isArray(record?.itens_servico) ? record.itens_servico : null;
  if (directItems && directItems.length > 0) {
    return directItems
      .map((item) => normalizeItemPayload(item, defaultData))
      .filter(Boolean);
  }

  const calcItems = parsed?.calculoAutomatico?.itensServico;
  if (Array.isArray(calcItems) && calcItems.length > 0) {
    return calcItems
      .map((item) => normalizeItemPayload(item, defaultData))
      .filter(Boolean);
  }

  const answers = parsed?.respostasCompletas || parsed?.answers;
  if (answers && typeof answers === 'object') {
    const flow = inferFlow({ ...record, fluxo: record?.fluxo || parsed?.fluxo || record?.Fluxo });
    const structured = buildStructuredFromAnswers(flow, answers);
    if (Array.isArray(structured.items) && structured.items.length > 0) {
      return structured.items
        .map((item) => normalizeItemPayload(item, defaultData))
        .filter(Boolean);
    }
  }

  return extractItemsFromRecordFields(record)
    .map((item) => normalizeItemPayload(item, defaultData))
    .filter(Boolean);
}

function applyStructuredFallback(record) {
  const parsed = parseJsonSafe(record?.detalhes);
  const answers = parsed?.respostasCompletas || parsed?.answers;
  const flow = inferFlow({ ...record, fluxo: record?.fluxo || parsed?.fluxo || record?.Fluxo });
  const structured = buildStructuredFromAnswers(flow, answers);
  const items = extractServiceItems(record);
  const primary = items[0] || null;

  return {
    ...record,
    fluxo: normalizeText(record?.fluxo || record?.Fluxo || parsed?.fluxo || flow),
    origem: normalizeText(record?.origem || record?.Origem || parsed?.origem),
    pagina: normalizeText(record?.pagina || record?.Pagina || parsed?.pagina),
    servico: normalizeText(record?.servico)
      || normalizeText(structured?.servico_resumo)
      || items.map((item) => item.servico).join(' | ')
      || normalizeText(parsed?.servico || parsed?.servicoOuOperacao || parsed?.operacao)
      || normalizeText(record?.ServicoOuOperacao),
    quantidade: normalizeText(record?.quantidade)
      || normalizeText(structured?.quantidade_resumo)
      || summarizeItemsField(items, 'quantidade', primary?.quantidade || normalizeText(parsed?.quantidade || parsed?.Quantidade || record?.Quantidade)),
    material_gravado: normalizeText(record?.material_gravado)
      || normalizeText(structured?.material_resumo)
      || summarizeItemsField(items, 'material_gravado', primary?.material_gravado || normalizeText(parsed?.material_gravado || parsed?.materialGravado || record?.MaterialGravado)),
    tempo_bruto: normalizeText(record?.tempo_bruto)
      || normalizeText(structured?.tempo_resumo)
      || summarizeItemsField(items, 'tempo_bruto', primary?.tempo_bruto || normalizeText(parsed?.tempo_bruto || parsed?.tempoBruto || record?.TempoBruto)),
    prazo: normalizeText(record?.prazo) || normalizeText(structured?.prazo) || primary?.prazo || normalizeText(parsed?.prazo || record?.Prazo),
    referencia: normalizeText(record?.referencia) || normalizeText(structured?.referencia) || primary?.referencia || normalizeText(parsed?.referencia || record?.Referencia),
    observacoes: normalizeText(record?.observacoes || record?.Observacoes)
      || normalizeText(parsed?.observacoes || parsed?.extras || answers?.extras),
    itens_servico: items,
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

function getComplexidadeByMinutes(minutes) {
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  const limits = DEFAULT_PRICING_RULES.complexidade;
  if (safeMinutes <= Number(limits.n1MaxMin || 30)) {
    return { nivel: 'N1', multiplicador: Number(limits.N1 || 0.7) };
  }
  if (safeMinutes <= Number(limits.n2MaxMin || 120)) {
    return { nivel: 'N2', multiplicador: Number(limits.N2 || 1) };
  }
  return { nivel: 'N3', multiplicador: Number(limits.N3 || 1.5) };
}

function detectMulticamera(text) {
  const normalized = normalizeServiceKey(text);
  return /(multicamera|multi camera|3 camera|tres camera|3\+ camera)/.test(normalized);
}

function computePricingSnapshot(record) {
  const flow = inferFlow(record);
  const items = extractServiceItems(record);
  const fallbackPrazo = normalizeText(record?.prazo || record?.Prazo || '');
  const fallbackReferencia = normalizeText(record?.referencia || record?.Referencia || '');
  const observacoes = normalizeText(record?.observacoes || record?.Observacoes || '');
  const multicamera = detectMulticamera(`${observacoes} ${fallbackReferencia}`);
  const ajusteMulticameraPercent = multicamera ? Number(DEFAULT_PRICING_RULES.ajustes.multicamera || 15) : 0;

  const itemList = items.length > 0
    ? items
    : [{
      servico: normalizeText(record?.servico || record?.ServicoOuOperacao || 'Servico'),
      quantidade: normalizeText(record?.quantidade || record?.Quantidade || '1'),
      material_gravado: normalizeText(record?.material_gravado || record?.MaterialGravado || ''),
      tempo_bruto: normalizeText(record?.tempo_bruto || record?.TempoBruto || ''),
      prazo: fallbackPrazo,
      referencia: fallbackReferencia,
    }];

  const choHora = Number(DEFAULT_PRICING_RULES.margem.choHora || 41.67);
  const itemHoursByService = {
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
    default: 1.4,
  };

  let subtotalBase = 0;
  let subtotalSuggested = 0;
  let totalQuantidade = 0;
  let weightedComplexity = 0;
  let maxUrgenciaMultiplier = 1;
  let estimatedHours = 0;
  let hasManualService = false;
  let hasN3 = false;
  let hasNoReference = false;
  let faixaMinTotal = 0;
  let faixaMaxTotal = 0;
  let maxItemDiscountPercent = 0;

  const itensServico = itemList.map((rawItem) => {
    const servico = normalizeText(rawItem?.servico || 'Servico');
    const quantidade = Math.max(1, Math.round(parsePositiveNumber(rawItem?.quantidade || '1') || 1));
    const material = normalizeText(rawItem?.material_gravado);
    const tempoBruto = normalizeText(rawItem?.tempo_bruto);
    const prazo = normalizeText(rawItem?.prazo || fallbackPrazo);
    const referencia = normalizeText(rawItem?.referencia || fallbackReferencia);

    const serviceKey = mapServiceCatalog(servico);
    const baseUnit = getUnitPriceFromRules(flow, serviceKey);
    const complexidade = getComplexidadeByMinutes(parseHours(tempoBruto) * 60);
    const urgenciaMultiplier = getUrgencyMultiplier(flow, prazo || fallbackPrazo, serviceKey);
    const drOfficialTotal = flow === 'DR' ? getDrOfficialItemTotal(serviceKey, quantidade) : null;

    const baseItem = drOfficialTotal ?? (baseUnit * quantidade);
    let suggestedItem = baseItem * complexidade.multiplicador * urgenciaMultiplier;
    if (flow === 'DR' && drOfficialTotal === null) {
      const itemDiscountPercent = getVolumeDiscount(quantidade);
      maxItemDiscountPercent = Math.max(maxItemDiscountPercent, itemDiscountPercent);
      if (itemDiscountPercent > 0) {
        suggestedItem *= (1 - (itemDiscountPercent / 100));
      }
    }
    if (inferMaterialState(material) === 'nao') {
      suggestedItem *= 1.05;
    }

    const refMissing = !hasReference(referencia);
    if (refMissing) {
      hasNoReference = true;
      suggestedItem *= (1 + Number(DEFAULT_PRICING_RULES.ajustes.semReferencia || 10) / 100);
    }
    if (ajusteMulticameraPercent > 0) {
      suggestedItem *= (1 + (ajusteMulticameraPercent / 100));
    }

    subtotalBase += baseItem;
    subtotalSuggested += suggestedItem;
    totalQuantidade += quantidade;
    weightedComplexity += complexidade.multiplicador * quantidade;
    maxUrgenciaMultiplier = Math.max(maxUrgenciaMultiplier, urgenciaMultiplier);

    const serviceHours = itemHoursByService[serviceKey] || itemHoursByService.default;
    estimatedHours += (serviceHours * complexidade.multiplicador) * quantidade;

    const spread = serviceKey === 'youtube' || serviceKey === 'vsl_15' || serviceKey === 'vsl_longa' || serviceKey === 'motion' ? 0.2 : 0.1;
    faixaMinTotal += suggestedItem * (1 - spread);
    faixaMaxTotal += suggestedItem * (1 + spread);

    hasManualService = hasManualService
      || serviceKey === 'youtube'
      || serviceKey === 'vsl_15'
      || serviceKey === 'vsl_longa'
      || serviceKey === 'motion';
    hasN3 = hasN3 || complexidade.nivel === 'N3';

    return {
      servico,
      quantidade,
      material_gravado: material,
      tempo_bruto: tempoBruto,
      referencia,
      prazo,
      preco_base_item: roundCurrency(baseItem),
      valor_sugerido_item: roundCurrency(suggestedItem),
      complexidade_nivel: complexidade.nivel,
      multiplicador_complexidade: roundCurrency(complexidade.multiplicador),
      multiplicador_urgencia: roundCurrency(urgenciaMultiplier),
    };
  });

  const descontoVolumePercent = maxItemDiscountPercent;

  const precoBase = Math.max(1, roundCurrency(subtotalBase));
  const valorSugerido = Math.max(1, roundCurrency(subtotalSuggested));
  const faixaMin = Math.max(1, roundCurrency(faixaMinTotal || (valorSugerido * 0.9)));
  const faixaMax = Math.max(faixaMin, roundCurrency(faixaMaxTotal || (valorSugerido * 1.1)));
  const faixaSugerida = `R$ ${faixaMin.toFixed(2)} a R$ ${faixaMax.toFixed(2)}`;

  const custoEstimado = roundCurrency(choHora * Math.max(estimatedHours, 0.5));
  const margem = valorSugerido > 0 ? ((valorSugerido - custoEstimado) / valorSugerido) * 100 : 0;
  const margemEstimada = Math.round(Math.min(95, Math.max(0, margem)) * 10) / 10;

  const complexidadeMedia = totalQuantidade > 0 ? weightedComplexity / totalQuantidade : 1;
  const complexidadeNivel = complexidadeMedia <= 0.8 ? 'N1' : (complexidadeMedia < 1.3 ? 'N2' : 'N3');
  const revisaoManual = totalQuantidade > Number(DEFAULT_PRICING_RULES.pacotes.revisaoCapacidadeAcimaQtd || 30)
    || hasManualService
    || hasN3
    || margemEstimada < Number(DEFAULT_PRICING_RULES.margem.recusaAbaixo || 55);

  return {
    precoBase,
    valorSugerido,
    margemEstimada,
    faixaSugerida,
    descontoVolumePercent,
    multiplicadorUrgencia: roundCurrency(maxUrgenciaMultiplier),
    multiplicadorComplexidade: roundCurrency(complexidadeMedia),
    complexidadeNivel,
    ajusteReferenciaPercent: hasNoReference ? Number(DEFAULT_PRICING_RULES.ajustes.semReferencia || 10) : 0,
    ajusteMulticameraPercent,
    revisaoManual,
    totalQuantidade,
    itensServico,
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
  if (isLeadFechadoStatus(lead.status) || isLeadPerdidoStatus(lead.status)) return false;

  const followupDate = parseDateSafe(lead.proximo_followup_em);
  if (!followupDate) return false;
  return followupDate.getTime() < nowDate.getTime();
}

export function isLeadFollowupLate(lead, now = new Date()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  return isLateFollowup(lead, nowDate);
}

function inMonthRange(dateValue, monthStart, monthEnd) {
  if (!dateValue) return false;
  return dateValue >= monthStart && dateValue < monthEnd;
}

function getOrcamentoDateForFechamentoMes(orcamento) {
  return parseDateSafe(orcamento?.fechado_em)
    || parseDateSafe(orcamento?.data_fechamento)
    || parseDateSafe(orcamento?.data_fechamento_em)
    || parseDateSafe(orcamento?.updated_at)
    || parseDateSafe(orcamento?.created_at);
}

function getLeadPrimeiroContatoDate(lead) {
  return parseDateSafe(lead?.primeiro_contato_em)
    || parseDateSafe(lead?.data_primeiro_contato)
    || parseDateSafe(lead?.first_contact_at)
    || parseDateSafe(lead?.ultimo_contato_em);
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
  const itensServico = Array.isArray(snapshot.itensServico) ? snapshot.itensServico : extractServiceItems(enrichedLead);

  const incompletoCampos = [];
  if (!Array.isArray(itensServico) || itensServico.length === 0 || !itensServico.some((item) => normalizeText(item?.servico))) {
    incompletoCampos.push('servico');
  }
  if (!Array.isArray(itensServico) || itensServico.length === 0 || itensServico.some((item) => !normalizeText(item?.quantidade))) {
    incompletoCampos.push('quantidade');
  }
  if (!normalizeText(enrichedLead?.prazo)) incompletoCampos.push('prazo');
  if (!Array.isArray(itensServico) || itensServico.length === 0 || itensServico.some((item) => !normalizeText(item?.material_gravado))) {
    incompletoCampos.push('material_gravado');
  }
  const tempoInvalido = Array.isArray(itensServico)
    ? itensServico.some((item) => {
      const material = inferMaterialState(item?.material_gravado);
      if (material !== 'sim') return false;
      return !normalizeText(item?.tempo_bruto);
    })
    : !normalizeText(enrichedLead?.tempo_bruto);
  if (tempoInvalido) incompletoCampos.push('tempo_bruto');

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
    ajuste_multicamera_percent: toNumber(enrichedLead?.ajuste_multicamera_percent, snapshot.ajusteMulticameraPercent),
    valor_estimado: Math.round((precoFinal || precoBase || valorPotencial) * 100) / 100,
    itens_servico: itensServico,
    quantidade_total: Number(snapshot.totalQuantidade || sumQuantidade(enrichedLead?.quantidade || enrichedLead?.Quantidade || '1')),
    incompleto: incompletoCampos.length > 0,
    incompleto_campos: incompletoCampos,
    requer_revisao: ORC_REVISAO.has(normalizeStatusKey(enrichedLead?.status_orcamento)) || precoFinal <= 0 || revisaoManual,
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
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const leadsMes = leads.filter((lead) => {
    const created = parseDateSafe(lead.created_at);
    return inMonthRange(created, monthStart, monthEnd);
  });

  const leadsFechadosMes = leadsMes.filter((lead) => isLeadFechadoStatus(lead.status));

  const orcamentosFechadosMes = orcamentos
    .filter((orc) => isOrcamentoFechado(orc))
    .filter((orc) => inMonthRange(getOrcamentoDateForFechamentoMes(orc), monthStart, monthEnd));

  const receitaFechadaMes = orcamentosFechadosMes
    .reduce((sum, orc) => sum + getOrcamentoValorFechado(orc), 0);

  const orcamentosAbertos = orcamentos
    .filter((orc) => isOrcamentoAberto(orc))
    .reduce((sum, orc) => sum + getOrcamentoValorAberto(orc), 0);

  const ticketMedio = orcamentosFechadosMes.length > 0
    ? receitaFechadaMes / orcamentosFechadosMes.length
    : 0;

  const taxaConversao = leadsMes.length > 0
    ? (leadsFechadosMes.length / leadsMes.length) * 100
    : 0;

  const leadsUrgentes = leads
    .filter((lead) => URGENCIA_OPERACIONAL.has(normalizeStatusKey(lead.urgencia)))
    .filter((lead) => isLeadAbertoStatus(lead.status))
    .length;
  const followupAtrasado = leads.filter((lead) => isLeadFollowupLate(lead, now)).length;

  const leadBaseTempoResposta = leadsMes.length > 0 ? leadsMes : leads;
  const temposResposta = leadBaseTempoResposta
    .map((lead) => {
      const created = parseDateSafe(lead.created_at);
      const primeiroContato = getLeadPrimeiroContatoDate(lead);
      if (!created || !primeiroContato || primeiroContato <= created) return null;
      const minutes = differenceInMinutes(primeiroContato, created);
      return Number.isFinite(minutes) && minutes >= 0 ? (minutes / 60) : null;
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
    const closed = leads.filter((lead) => normalizeText(lead.origem || 'Sem origem') === origem && isLeadFechadoStatus(lead.status)).length;
    const conversion = values.total > 0 ? (closed / values.total) * 100 : 0;
    return {
      origem,
      leads: values.total,
      fechados: closed,
      conversao: Math.round(conversion * 10) / 10,
    };
  }).sort((a, b) => b.leads - a.leads);

  const serviceDemand = groupBy(
    orcamentos.flatMap((orc) => {
      const items = Array.isArray(orc.itens_servico) && orc.itens_servico.length > 0
        ? orc.itens_servico
        : [{ servico: orc.servico || 'Nao informado' }];
      return items.map((item) => ({ servico: normalizeText(item?.servico) || 'Nao informado' }));
    }),
    (entry) => normalizeText(entry.servico || 'Nao informado')
  ).map(([servico, total]) => ({ servico, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const revenueByService = groupBy(
    orcamentos.flatMap((orc) => {
      const items = Array.isArray(orc.itens_servico) && orc.itens_servico.length > 0
        ? orc.itens_servico
        : [];
      if (items.length > 0) {
        const fallbackValue = toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0);
        return items.map((item) => ({
          servico: normalizeText(item?.servico) || 'Nao informado',
          valor: toNumber(item?.valor_sugerido_item, 0) || (fallbackValue / items.length),
        }));
      }

      const servicos = splitPipeValues(orc.servico);
      if (servicos.length === 0) {
        return [{ servico: 'Nao informado', valor: toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0) }];
      }
      const valorTotal = toNumber(orc.preco_final || orc.preco_base || orc.valor_estimado, 0);
      const rateio = valorTotal / servicos.length;
      return servicos.map((servico) => ({ servico, valor: rateio }));
    }),
    (entry) => normalizeText(entry.servico || 'Nao informado'),
    (entry) => toNumber(entry.valor, 0)
  ).map(([servico, valor]) => ({ servico, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const pipeline = [
    { status: 'novo', label: 'Novo' },
    { status: 'chamado', label: 'Em contato' },
    { status: 'proposta enviada', label: 'Proposta enviada' },
    { status: 'fechado', label: 'Fechado' },
    { status: 'perdido', label: 'Perdido' },
  ].map((step) => ({
    ...step,
    total: leads.filter((lead) => normalizeLeadStatusPipeline(lead.status) === step.status).length,
  }));

  const urgenciaData = ['alta', 'media', 'baixa'].map((urg) => ({
    urgencia: urg,
    total: leads.filter((lead) => lead.urgencia === urg).length,
  }));

  const ultimasEntradas = [
    ...leads.map((lead) => ({
      id: lead.id,
      entryType: 'lead',
      nome: lead.nome,
      origem: lead.origem,
      tipo: lead.fluxo || lead.servico || 'Lead',
      valor_estimado: lead.valor_estimado,
      status: lead.status,
      prioridade: lead.prioridade,
      created_at: lead.created_at,
    })),
    ...orcamentos.map((orc) => ({
      id: orc.id,
      entryType: 'orcamento',
      nome: orc.nome,
      origem: orc.origem,
      tipo: orc.servico || orc.fluxo || 'Orcamento',
      valor_estimado: orc.valor_estimado || orc.preco_final || orc.preco_base || 0,
      status_orcamento: orc.status_orcamento,
      prioridade: orc.prioridade,
      created_at: orc.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 12);

  const orcUrgentes = orcamentos
    .filter((orc) => orc.urgencia === 'alta' && isOrcamentoAberto(orc))
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

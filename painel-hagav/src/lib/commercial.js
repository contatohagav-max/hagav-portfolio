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

const SERVICE_UNIT_PRICE = {
  DU: {
    'reels tiktok e shorts': 180,
    'corte estrategico': 150,
    'criativo para ads': 240,
    outro: 190,
  },
  DR: {
    'conteudo para redes sociais': 150,
    'criativos para anuncios': 220,
    lancamentos: 260,
    'youtube recorrente': 280,
    outro: 210,
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

function getUnitPrice(flow, service) {
  const table = SERVICE_UNIT_PRICE[flow] || SERVICE_UNIT_PRICE.DU;
  const normalized = normalizeServiceKey(service);
  if (table[normalized]) return table[normalized];
  if (normalized.startsWith('outro')) return table.outro || 190;
  return flow === 'DR' ? 170 : 190;
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

export function estimateValorPotencial(record) {
  const precoFinal = toNumber(record?.preco_final, 0);
  const precoBase = toNumber(record?.preco_base, 0);
  const savedEstimate = toNumber(record?.valor_estimado, 0);
  if (precoFinal > 0) return precoFinal;
  if (savedEstimate > 0) return savedEstimate;
  if (precoBase > 0) return precoBase;

  const flow = inferFlow(record);
  const services = splitPipeValues(record?.servico || record?.ServicoOuOperacao || '');
  const quantities = splitPipeValues(record?.quantidade || record?.Quantidade || '');
  const materialMap = parseLabeledMap(record?.material_gravado || record?.MaterialGravado || '');
  const tempoMap = parseLabeledMap(record?.tempo_bruto || record?.TempoBruto || '');

  if (services.length === 0) {
    return sumQuantidade(record?.quantidade || record?.Quantidade || '1') * (flow === 'DR' ? 170 : 190);
  }

  let subtotal = 0;
  let totalQty = 0;

  for (let idx = 0; idx < services.length; idx += 1) {
    const service = services[idx];
    const key = normalizeServiceKey(service);
    const qty = Math.max(1, Math.round(parsePositiveNumber(quantities[idx] || '') || 1));
    const material = inferMaterialState(materialMap[key] || record?.material_gravado || '');
    const tempoHours = parseHours(tempoMap[key] || record?.tempo_bruto || '');

    let itemTotal = qty * getUnitPrice(flow, service);
    if (material === 'nao') itemTotal *= 1.35;
    if (tempoHours > 2) itemTotal *= 1 + Math.min(0.35, (tempoHours - 2) * 0.08);

    subtotal += itemTotal;
    totalQty += qty;
  }

  const urgencia = inferUrgencia(record?.prazo || record?.Prazo || '');
  if (urgencia === 'alta') subtotal *= 1.2;
  if (urgencia === 'media') subtotal *= 1.08;

  if (flow === 'DR') {
    if (totalQty >= 40) subtotal *= 0.88;
    else if (totalQty >= 20) subtotal *= 0.92;
    else if (totalQty >= 10) subtotal *= 0.95;
  }

  return Math.max(150, Math.round(subtotal * 100) / 100);
}

export function estimateMargem(record) {
  const valor = estimateValorPotencial(record);
  if (!valor) return 0;

  const storedMargin = toNumber(record?.margem_estimada, NaN);
  if (Number.isFinite(storedMargin) && storedMargin > 0) return Math.min(95, Math.max(0, storedMargin));

  const urgencia = inferUrgencia(record?.prazo || record?.Prazo || '');
  const material = inferMaterialState(record?.material_gravado || record?.MaterialGravado || '');
  const tempoHours = parseHours(record?.tempo_bruto || record?.TempoBruto || '');
  const flow = inferFlow(record);

  let custoPercentual = 0.46;
  if (material === 'nao') custoPercentual += 0.12;
  if (tempoHours >= 8) custoPercentual += 0.09;
  if (urgencia === 'alta') custoPercentual += 0.08;
  if (flow === 'DR') custoPercentual -= 0.05;

  custoPercentual = Math.min(0.9, Math.max(0.25, custoPercentual));
  const margem = ((valor - (valor * custoPercentual)) / valor) * 100;
  return Math.round(Math.min(95, Math.max(0, margem)) * 10) / 10;
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
  const score = toNumber(record?.score_lead, NaN);
  const computedScore = Number.isFinite(score) && score > 0 ? Math.round(score) : estimateLeadScore(record);
  const urgencia = normalizeText(record?.urgencia || '').toLowerCase() || inferUrgencia(record?.prazo || record?.Prazo || '');
  const prioridade = normalizeText(record?.prioridade || '').toLowerCase() || priorityByScore(computedScore, urgencia);
  const temperatura = normalizeText(record?.temperatura || '') || temperatureByScore(computedScore);
  const valorEstimado = toNumber(record?.valor_estimado, 0) || estimateValorPotencial(record);

  const enriched = {
    ...record,
    score_lead: computedScore,
    urgencia,
    prioridade,
    temperatura,
    valor_estimado: Math.round(valorEstimado * 100) / 100,
    resumo_comercial: normalizeText(record?.resumo_comercial) || buildResumoComercial(record, { score: computedScore }),
  };

  return enriched;
}

export function enrichOrcamentoRecord(record) {
  const enrichedLead = enrichLeadRecord(record);
  const margem = estimateMargem(record);

  const incompletoCampos = [];
  if (!normalizeText(record?.servico)) incompletoCampos.push('servico');
  if (!normalizeText(record?.quantidade)) incompletoCampos.push('quantidade');
  if (!normalizeText(record?.prazo)) incompletoCampos.push('prazo');
  if (!normalizeText(record?.material_gravado)) incompletoCampos.push('material_gravado');

  const valorPotencial = estimateValorPotencial(record);
  const precoBase = toNumber(record?.preco_base, 0);
  const precoFinal = toNumber(record?.preco_final, 0);

  return {
    ...record,
    ...enrichedLead,
    margem_estimada: Math.round(margem * 10) / 10,
    valor_estimado: Math.round((precoFinal || precoBase || valorPotencial) * 100) / 100,
    incompleto: incompletoCampos.length > 0,
    incompleto_campos: incompletoCampos,
    requer_revisao: ORC_REVISAO.has(record?.status_orcamento) || precoFinal <= 0,
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
  },
  pricing: {
    urgencia24h: 1.2,
    urgenciaSemana: 1.08,
    materialNaoGravado: 1.35,
    recorrencia40Plus: 0.88,
  },
  pipelineStatus: ['novo', 'chamado', 'proposta enviada', 'fechado', 'perdido'],
};

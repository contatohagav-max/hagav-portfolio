import { createClient } from '@supabase/supabase-js';
import {
  buildDashboardInsights,
  deriveFinancialMetricsFromFinalPrice,
  enrichLeadRecord,
  enrichOrcamentoRecord,
  estimateLeadScore,
  inferUrgencia,
  priorityByScore,
  temperatureByScore,
  COMMERCIAL_DEFAULTS,
  isLeadFollowupLate,
  DEAL_STATUS,
  DEAL_STATUS_GROUPS,
  normalizeDealStatus,
  mapLegacyLeadStatusToDeal,
  mapLegacyOrcamentoStatusToDeal,
  mapDealStatusToLegacyLead,
  mapDealStatusToLegacyOrcamento,
  normalizePrazoLabel,
  normalizePricingRules,
} from '@/lib/commercial';

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const supabaseKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
  .trim();

let _client = null;

function deepMerge(base, override) {
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

function safeParseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function extractProposalNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatProposalSequence(value) {
  const safe = Math.max(1, Number(value || 1));
  return String(safe).padStart(2, '0');
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDealRecord(raw) {
  const statusDeal = normalizeDealStatus(raw?.status, DEAL_STATUS.NOVO);
  return {
    ...raw,
    status: statusDeal,
  };
}

function mapDealToLeadRecord(raw) {
  const deal = normalizeDealRecord(raw);
  return {
    ...deal,
    status_deal: deal.status,
    status: mapDealStatusToLegacyLead(deal.status),
  };
}

function mapDealToOrcamentoRecord(raw) {
  const deal = normalizeDealRecord(raw);
  return {
    ...deal,
    status_deal: deal.status,
    status: mapDealStatusToLegacyLead(deal.status),
    status_orcamento: mapDealStatusToLegacyOrcamento(deal.status),
  };
}

function mapDealToContratoRecord(raw) {
  const deal = normalizeDealRecord(raw);
  const detalhes = safeParseJsonObject(deal?.detalhes);
  const contrato = safeParseJsonObject(detalhes?.contrato);
  const comercial = safeParseJsonObject(detalhes?.comercial);
  const vencimento = contrato?.vencimento || deal?.validade_ate || null;
  const renovacaoEm = contrato?.renovacao_alerta_em || deal?.proximo_followup_em || null;
  const valorContrato = Number(
    contrato?.valor_final
      ?? deal?.valor_fechado
      ?? deal?.preco_final
      ?? deal?.valor_sugerido
      ?? 0
  ) || 0;

  const now = new Date();
  const vencimentoDate = parseDateSafe(vencimento ? `${vencimento}T23:59:59` : null);
  const statusRaw = String(contrato?.status || '').toLowerCase();
  const hasContratoData = Boolean(
    statusRaw
    || contrato?.data_inicio
    || contrato?.vencimento
    || contrato?.forma_pagamento
    || contrato?.responsavel
    || contrato?.observacoes
    || contrato?.assinado_em
    || contrato?.ativado_em
    || contrato?.renovado_em
    || contrato?.encerrado_em
    || valorContrato > 0
  );

  let statusContrato = statusRaw;
  if (!statusContrato) {
    if (deal.status === DEAL_STATUS.APROVADO && !hasContratoData) {
      statusContrato = 'aguardando_contrato';
    } else if (vencimentoDate && vencimentoDate.getTime() < now.getTime()) {
      statusContrato = 'vencido';
    } else {
      statusContrato = 'ativo';
    }
  }

  const diasParaVencimento = vencimentoDate
    ? Math.ceil((vencimentoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const renovacaoProxima = statusContrato !== 'encerrado'
    && (Number.isFinite(diasParaVencimento) && diasParaVencimento <= 15);
  const dealLink = String(deal?.link_pdf || '').trim();
  const contratoLink = String(contrato?.link_pdf || '').trim();
  const propostaFromComercial = String(comercial?.proposta_link || comercial?.link_pdf || '').trim();
  const propostaLink = propostaFromComercial || (contratoLink ? '' : dealLink);
  const genericLink = contratoLink || dealLink || propostaLink;

  return {
    ...deal,
    status_deal: deal.status,
    contrato,
    status_contrato: statusContrato,
    valor_contrato: valorContrato,
    vencimento_contrato: vencimento,
    inicio_contrato: contrato?.data_inicio || null,
    recorrente_contrato: typeof contrato?.recorrente === 'boolean'
      ? contrato.recorrente
      : Boolean(contrato?.recorrente ?? deal?.recorrente),
    responsavel_contrato: contrato?.responsavel || deal?.responsavel || '',
    forma_pagamento_contrato: contrato?.forma_pagamento || '',
    renovacao_alerta_em: renovacaoEm,
    renovacao_proxima: renovacaoProxima,
    dias_para_vencimento: Number.isFinite(diasParaVencimento) ? diasParaVencimento : null,
    plano_servico: deal?.pacote_sugerido || deal?.servico || '',
    proposta_gerada_em: deal?.proposta_gerada_em || null,
    proposta_link_pdf: propostaLink,
    contrato_link_pdf: contratoLink,
    link_pdf: genericLink,
  };
}

function normalizeLeadPatchToDeals(patch = {}) {
  const next = { ...patch };
  if (next.status !== undefined) {
    next.status = mapLegacyLeadStatusToDeal(next.status, DEAL_STATUS.NOVO);
  }
  delete next.status_orcamento;
  return next;
}

function normalizeOrcamentoPatchToDeals(patch = {}) {
  const next = { ...patch };
  delete next.operacao_especial;
  delete next.operação_especial;
  if (next.status_orcamento !== undefined) {
    next.status = mapLegacyOrcamentoStatusToDeal(next.status_orcamento, DEAL_STATUS.ORCAMENTO);
    delete next.status_orcamento;
  } else if (next.status !== undefined) {
    next.status = mapLegacyLeadStatusToDeal(next.status, DEAL_STATUS.ORCAMENTO);
  }
  return next;
}

export function getSupabase() {
  if (_client) return _client;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[HAGAV] Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local');
    return null;
  }

  _client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      storageKey: 'hagav-admin-session',
    },
  });

  return _client;
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabase();
    if (!client) {
      return () => Promise.resolve({ data: null, count: 0, error: { message: 'Supabase não configurado' } });
    }
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// Auth

export async function signIn(email, password) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado. Verifique o .env.local.');

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = getSupabase();
  if (!client) return;
  await client.auth.signOut();
}

export async function getSession() {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session ?? null;
}

// Leads

export async function fetchLeads({
  status,
  origem,
  fluxo,
  search,
  prioridade,
  urgencia,
  temperatura,
  onlyFollowupLate,
  limit = 500,
} = {}) {
  const client = getSupabase();
  if (!client) return [];

  let query = client
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', mapLegacyLeadStatusToDeal(status, DEAL_STATUS.NOVO));
  } else {
    query = query.in('status', DEAL_STATUS_GROUPS.leads);
  }

  if (origem) query = query.eq('origem', origem);
  if (fluxo) query = query.eq('fluxo', fluxo);
  if (search) query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,observacoes.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  let leads = (data ?? []).map(mapDealToLeadRecord).map(enrichLeadRecord);

  if (prioridade) leads = leads.filter((lead) => lead.prioridade === prioridade);
  if (urgencia) leads = leads.filter((lead) => lead.urgencia === urgencia);
  if (temperatura) leads = leads.filter((lead) => lead.temperatura === temperatura);

  if (onlyFollowupLate) {
    const now = new Date();
    leads = leads.filter((lead) => isLeadFollowupLate(lead, now));
  }

  return leads;
}

export async function fetchPipelineDeals({ search, limit = 1200 } = {}) {
  const client = getSupabase();
  if (!client) return [];

  const pipelineStatuses = [
    DEAL_STATUS.NOVO,
    DEAL_STATUS.CONTATADO,
    DEAL_STATUS.QUALIFICADO,
    DEAL_STATUS.DESCARTADO,
    DEAL_STATUS.ORCAMENTO,
    DEAL_STATUS.PROPOSTA_ENVIADA,
    DEAL_STATUS.AJUSTANDO,
    DEAL_STATUS.APROVADO,
    DEAL_STATUS.FECHADO,
    DEAL_STATUS.PERDIDO,
  ];

  let query = client
    .from('deals')
    .select('*')
    .in('status', pipelineStatuses)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (search) query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,observacoes.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(mapDealToLeadRecord).map(enrichLeadRecord);
}

function normalizeLeadText(value, maxLen = 300) {
  return String(value || '').trim().slice(0, maxLen);
}

function normalizeComparableNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function buildLeadDerivedSyncPatch(record) {
  // Prioridade e urgencia manuais sao sinais operacionais; o valor estimado
  // continua ancorado no snapshot/preco ja salvo para nao alterar a regra comercial.
  const derived = enrichLeadRecord({
    ...mapDealToLeadRecord(record),
    resumo_comercial: '',
  });

  return {
    score_lead: Number(derived.score_lead || 0),
    urgencia: String(derived.urgencia || '').trim().toLowerCase() || null,
    prioridade: String(derived.prioridade || '').trim().toLowerCase() || null,
    temperatura: String(derived.temperatura || '').trim() || null,
    valor_estimado: normalizeComparableNumber(derived.valor_estimado || 0),
    resumo_comercial: String(derived.resumo_comercial || '').trim() || null,
  };
}

function leadDerivedSyncChanged(record, patch) {
  return (
    normalizeComparableNumber(record?.score_lead) !== normalizeComparableNumber(patch.score_lead)
    || String(record?.urgencia || '').trim().toLowerCase() !== String(patch.urgencia || '').trim().toLowerCase()
    || String(record?.prioridade || '').trim().toLowerCase() !== String(patch.prioridade || '').trim().toLowerCase()
    || String(record?.temperatura || '').trim() !== String(patch.temperatura || '').trim()
    || normalizeComparableNumber(record?.valor_estimado) !== normalizeComparableNumber(patch.valor_estimado)
    || String(record?.resumo_comercial || '').trim() !== String(patch.resumo_comercial || '').trim()
  );
}

function normalizeLeadFlow(value) {
  const raw = normalizeLeadText(value, 40)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (raw === 'dr' || raw.includes('mensal') || raw.includes('recorrente')) return 'DR';
  return 'DU';
}

function parseLeadQuantity(value, fallback = 1) {
  const match = String(value || '').match(/(\d+)/);
  if (!match || !match[1]) return fallback;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
}

function normalizeLeadMaterialState(value) {
  const raw = normalizeLeadText(value, 40)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (raw.startsWith('sim')) return 'Sim';
  if (raw.startsWith('nao')) return 'Não';
  if (raw.startsWith('parcial')) return 'Parcial';
  return '';
}

function splitLeadServices(rawValue) {
  return normalizeLeadText(rawValue, 700)
    .split(/\||\n|;/)
    .map((item) => normalizeLeadText(item, 120))
    .filter(Boolean)
    .slice(0, 12);
}

function summarizeByService(services, value) {
  const safeValue = normalizeLeadText(value, 120);
  if (!safeValue) return '';
  if (!Array.isArray(services) || services.length === 0) return safeValue;
  return services.map((service) => `${service}: ${safeValue}`).join(' | ');
}

function buildLeadResumoOrcamento({
  fluxo,
  servicoResumo,
  quantidadeResumo,
  materialResumo,
  prazo,
  referencia,
}) {
  const prazoNormalizado = normalizePrazoLabel(prazo, '') || '-';
  const parts = [
    fluxo || '-',
    `Serviço: ${servicoResumo || '-'}`,
    `Quantidade: ${quantidadeResumo || '-'}`,
    `Material gravado: ${materialResumo || '-'}`,
    `Prazo: ${prazoNormalizado}`,
  ];
  if (referencia) parts.push(`Referência: ${referencia}`);
  return parts.join(' | ');
}

function buildLeadAnswersPayload({
  flow,
  nome,
  whatsapp,
  empresa,
  services,
  quantityByService,
  materialState,
  tempoBruto,
  prazo,
  referencia,
  contextoResumo,
}) {
  const flowSelection = { selected: services, outro: '' };
  const flowContratacao = flow === 'DR' ? 'Produção mensal' : 'Projeto pontual';

  const base = {
    nome,
    whatsapp,
    empresa: empresa || '',
    extras: contextoResumo || '',
    flow_servicos: flowSelection,
    flow_quantidades: quantityByService,
    flow_material_gravado: materialState,
    flow_tempo_bruto: tempoBruto || '',
    flow_prazo: prazo || '',
    flow_referencia: referencia || '',
    flow_tipo_contratacao: flowContratacao,
  };

  if (flow === 'DR') {
    const firstService = services[0] || '';
    return {
      ...base,
      rec_operacoes: flowSelection,
      rec_quantidades: quantityByService,
      rec_gravado_por_tipo: services.reduce((acc, service) => {
        acc[service] = materialState || '';
        return acc;
      }, {}),
      rec_tempo_bruto_por_tipo: tempoBruto
        ? services.reduce((acc, service) => {
          acc[service] = tempoBruto;
          return acc;
        }, {})
        : {},
      rec_inicio: prazo || '',
      rec_referencia: referencia || '',
      rec_gravado: materialState || '',
      rec_tempo_bruto: tempoBruto || '',
      rec_tipo_operacao: firstService,
      rec_volume: String(quantityByService[firstService] || ''),
      rec_objetivo: contextoResumo ? normalizeLeadText(contextoResumo, 200) : '',
    };
  }

  return {
    ...base,
    unica_servicos: flowSelection,
    unica_quantidades: quantityByService,
    unica_gravado: services.reduce((acc, service) => {
      acc[service] = materialState || '';
      return acc;
    }, {}),
    unica_tempo_bruto: tempoBruto
      ? services.reduce((acc, service) => {
        acc[service] = tempoBruto;
        return acc;
      }, {})
      : {},
    unica_referencia: referencia || '',
    unica_prazo: prazo || '',
  };
}

export async function createLead(fields = {}) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const nome = String(fields.nome || '').trim();
  const whatsapp = String(fields.whatsapp || '').replace(/\D/g, '');
  if (!nome) throw new Error('Nome e obrigatorio');
  if (!whatsapp || whatsapp.length < 8) throw new Error('WhatsApp inválido');

  const empresa = normalizeLeadText(fields.empresa, 120);
  const origem = normalizeLeadText(fields.origem, 120) || 'prospeccao_ativa';
  const flow = normalizeLeadFlow(fields.fluxo || fields.tipo_contratacao);
  const prazo = normalizePrazoLabel(
    normalizeLeadText(fields.prazo, 80),
    flow === 'DR' ? 'Este mês' : 'Em até 7 dias'
  );
  const services = splitLeadServices(fields.servico);
  const servicoResumo = services.join(' | ') || normalizeLeadText(fields.servico, 300);
  const quantidadeBase = parseLeadQuantity(fields.quantidade, 1);
  const quantityByService = services.reduce((acc, service) => {
    acc[service] = quantidadeBase;
    return acc;
  }, {});
  const quantidadeResumo = services.length > 0
    ? services.map((service) => `${service}: ${quantidadeBase}`).join(' | ')
    : String(quantidadeBase);
  const materialState = normalizeLeadMaterialState(fields.material_gravado_text || fields.material_gravado);
  const materialResumo = summarizeByService(services, materialState) || materialState;
  const tempoBruto = normalizeLeadText(fields.tempo_bruto, 120);
  const tempoResumo = summarizeByService(services, tempoBruto) || tempoBruto;
  const referenciaText = normalizeLeadText(fields.referencia_text || fields.referencia, 700);
  const contextoResumo = normalizeLeadText(fields.contexto_resumo, 1200);
  const observacoesCliente = normalizeLeadText(fields.observacoes, 1200);
  const observacoesInternas = normalizeLeadText(fields.observacoes_internas, 1200);
  const observacoes = [contextoResumo, observacoesCliente].filter(Boolean).join('\n\n').trim();
  const multicamera = /(multicamera|multi camera|3 camera|tres camera)/i.test(`${referenciaText} ${contextoResumo}`);

  const resumoOrcamento = buildLeadResumoOrcamento({
    fluxo: flow,
    servicoResumo: servicoResumo || '-',
    quantidadeResumo: quantidadeResumo || '-',
    materialResumo: materialResumo || '-',
    prazo: prazo || '-',
    referencia: referenciaText || '',
  });

  const leadForScore = {
    fluxo: flow,
    servico: servicoResumo || '',
    quantidade: quantidadeResumo || String(quantidadeBase),
    material_gravado: materialResumo || materialState || '',
    tempo_bruto: tempoResumo || tempoBruto || '',
    prazo: prazo || '',
    referencia: referenciaText || '',
    observacoes: observacoes || '',
  };

  const scoreRaw = Number(fields.score_lead);
  const scoreLead = Number.isFinite(scoreRaw) && scoreRaw > 0
    ? Math.round(scoreRaw)
    : estimateLeadScore(leadForScore);
  const urgenciaField = normalizeLeadText(fields.urgencia, 20).toLowerCase();
  const urgencia = ['alta', 'media', 'baixa'].includes(urgenciaField)
    ? urgenciaField
    : inferUrgencia(prazo);
  const prioridadeField = normalizeLeadText(fields.prioridade, 20).toLowerCase();
  const prioridade = ['alta', 'media', 'baixa'].includes(prioridadeField)
    ? prioridadeField
    : priorityByScore(scoreLead, urgencia);
  const temperaturaField = normalizeLeadText(fields.temperatura, 20);
  const temperatura = ['Quente', 'Morno', 'Frio'].includes(temperaturaField)
    ? temperaturaField
    : temperatureByScore(scoreLead);

  const resumoComercial = `${flow} | Serviço: ${servicoResumo || '-'} | Qtd: ${quantidadeResumo || '-'} | Material: ${materialResumo || '-'} | Prazo: ${normalizePrazoLabel(prazo, '') || '-'} | Score: ${scoreLead}`;
  const valorEstimadoInput = Number(fields.valor_estimado);
  const valorEstimado = Number.isFinite(valorEstimadoInput) && valorEstimadoInput > 0
    ? valorEstimadoInput
    : null;
  const respostasCompletas = buildLeadAnswersPayload({
    flow,
    nome,
    whatsapp,
    empresa,
    services,
    quantityByService,
    materialState,
    tempoBruto,
    prazo,
    referencia: referenciaText,
    contextoResumo,
  });
  const detalhes = {
    fluxo: flow,
    pagina: 'orcamento',
    origem,
    servicoOuOperacao: servicoResumo || '',
    quantidade: quantidadeResumo || '',
    materialGravado: materialResumo || '',
    tempoBruto: tempoResumo || '',
    prazo: prazo || '',
    referencia: referenciaText || '',
    observacoes: observacoes || '',
    respostasCompletas,
    answers: respostasCompletas,
    comercial: {
      origem_manual: true,
      criado_via: 'admin_novo_lead',
      contexto_resumo: contextoResumo || '',
    },
    ...(empresa ? { empresa } : {}),
  };

  const payload = {
    nome,
    whatsapp,
    origem,
    fluxo: flow,
    pagina: 'orcamento',
    servico: servicoResumo || null,
    quantidade: quantidadeBase,
    material_gravado: null,
    tempo_bruto: tempoResumo || tempoBruto || null,
    prazo: prazo || null,
    referencia: null,
    multicamera,
    observacoes: observacoes || null,
    detalhes,
    resumo_orcamento: resumoOrcamento,
    resumo_comercial: resumoComercial,
    score_lead: scoreLead,
    valor_estimado: valorEstimado,
    status: mapLegacyLeadStatusToDeal(fields.status || 'novo', DEAL_STATUS.NOVO),
    prioridade,
    urgencia,
    temperatura,
    proxima_acao: String(fields.proxima_acao || '').trim() || null,
    proximo_followup_em: fields.proximo_followup_em || null,
    responsavel: String(fields.responsavel || '').trim() || null,
    observacoes_internas: observacoesInternas || null,
  };

  const { data, error } = await client
    .from('deals')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return enrichLeadRecord(mapDealToLeadRecord(data));
}

export async function updateLead(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const payload = normalizeLeadPatchToDeals(patch);
  const { data, error } = await client
    .from('deals')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;

  let nextRecord = mapDealToLeadRecord(data);
  const syncPatch = buildLeadDerivedSyncPatch(nextRecord);
  if (leadDerivedSyncChanged(nextRecord, syncPatch)) {
    const { data: syncData, error: syncError } = await client
      .from('deals')
      .update(syncPatch)
      .eq('id', id)
      .select('*')
      .single();

    if (syncError) {
      console.warn('[Leads][DerivedSync]', syncError);
    } else if (syncData) {
      nextRecord = mapDealToLeadRecord(syncData);
    }
  }

  return enrichLeadRecord(nextRecord);
}

// Orcamentos

export async function fetchOrcamentos({
  statusOrcamento,
  status,
  urgencia,
  prioridade,
  incompleto,
  search,
  limit = 500,
} = {}) {
  const client = getSupabase();
  if (!client) return [];
  const settings = await fetchCommercialSettings();
  const pricingRules = normalizePricingRules(settings?.pricing || COMMERCIAL_DEFAULTS.pricing);

  let query = client
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusOrcamento) {
    query = query.eq('status', mapLegacyOrcamentoStatusToDeal(statusOrcamento, DEAL_STATUS.ORCAMENTO));
  } else if (status) {
    query = query.eq('status', mapLegacyLeadStatusToDeal(status, DEAL_STATUS.ORCAMENTO));
  } else {
    query = query.in('status', DEAL_STATUS_GROUPS.orcamentos);
  }

  if (search) query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,servico.ilike.%${search}%,resumo_orcamento.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  let orcamentos = (data ?? [])
    .map(mapDealToOrcamentoRecord)
    .map((record) => enrichOrcamentoRecord(record, pricingRules));

  if (urgencia) orcamentos = orcamentos.filter((orc) => orc.urgencia === urgencia);
  if (prioridade) orcamentos = orcamentos.filter((orc) => orc.prioridade === prioridade);
  if (incompleto === true) orcamentos = orcamentos.filter((orc) => orc.incompleto);

  return orcamentos;
}

function pickClientDetailField(detalhes, ...keys) {
  const detailSources = [
    detalhes,
    safeParseJsonObject(detalhes?.comercial),
    safeParseJsonObject(detalhes?.cadastro_cliente),
    safeParseJsonObject(detalhes?.respostasCompletas),
    safeParseJsonObject(detalhes?.answers),
  ];

  for (const source of detailSources) {
    for (const key of keys) {
      const value = String(source?.[key] || '').trim();
      if (value) return value;
    }
  }
  return '';
}

function extractClientRegistration(raw = {}) {
  const detalhes = safeParseJsonObject(raw?.detalhes);
  return {
    empresa: pickClientDetailField(detalhes, 'empresa', 'Empresa'),
    instagram: pickClientDetailField(detalhes, 'instagram', 'Instagram'),
    email: pickClientDetailField(detalhes, 'email_cliente', 'email', 'Email', 'E-mail'),
  };
}

function buildClientSearchText(row) {
  const cadastro = extractClientRegistration(row);
  return [
    row?.nome,
    row?.whatsapp,
    row?.origem,
    row?.responsavel,
    cadastro.empresa,
    cadastro.instagram,
    cadastro.email,
  ].filter(Boolean).join(' ').toLowerCase();
}

export async function fetchClientesAtivosParaOrcamento({ search, limit = 600 } = {}) {
  const client = getSupabase();
  if (!client) return [];

  const term = String(search || '').trim().toLowerCase();
  const { data, error } = await client
    .from('deals')
    .select('*')
    .in('status', [DEAL_STATUS.APROVADO, DEAL_STATUS.FECHADO])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => (!term ? true : buildClientSearchText(row).includes(term)))
    .map((row) => {
      const cadastro = extractClientRegistration(row);
      return {
        ...mapDealToContratoRecord(row),
        empresa: cadastro.empresa,
        instagram: cadastro.instagram,
        email_cliente: cadastro.email,
      };
    });
}

function buildNewOrcamentoDetails({
  source = null,
  nome = '',
  whatsapp = '',
  empresa = '',
  instagram = '',
  email = '',
  origemOriginal = '',
  responsavel = '',
  clienteOrigemId = null,
} = {}) {
  const cadastroCliente = {
    id: clienteOrigemId || null,
    nome,
    whatsapp,
    empresa,
    instagram,
    email,
    origem: origemOriginal,
    responsavel,
  };

  return {
    fluxo: source?.fluxo || '',
    pagina: 'orcamento',
    origem: clienteOrigemId ? 'cliente_existente' : 'admin_orcamentos',
    status: DEAL_STATUS.ORCAMENTO,
    nome,
    whatsapp,
    empresa,
    instagram,
    email_cliente: email,
    servicoOuOperacao: '',
    quantidade: '',
    materialGravado: '',
    tempoBruto: '',
    prazo: '',
    referencia: '',
    observacoes: '',
    cliente_origem_id: clienteOrigemId || null,
    criado_a_partir_de_cliente: Boolean(clienteOrigemId),
    cadastro_cliente: cadastroCliente,
    comercial: {
      criado_via: clienteOrigemId ? 'admin_orcamento_cliente_existente' : 'admin_orcamento_cliente_novo',
      cliente_origem_id: clienteOrigemId || null,
      criado_a_partir_de_cliente: Boolean(clienteOrigemId),
      cliente_nome: nome,
      whatsapp,
      empresa,
      instagram,
      email_cliente: email,
    },
  };
}

async function insertOrcamentoDraft(payload) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nÃ£o configurado');
  const settings = await fetchCommercialSettings();
  const pricingRules = normalizePricingRules(settings?.pricing || COMMERCIAL_DEFAULTS.pricing);

  const { data, error } = await client
    .from('deals')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return enrichOrcamentoRecord(mapDealToOrcamentoRecord(data), pricingRules);
}

export async function createOrcamentoClienteNovo(fields = {}) {
  const nome = String(fields.nome || '').trim();
  const whatsapp = String(fields.whatsapp || '').replace(/\D/g, '');
  if (!nome) throw new Error('Informe o nome do cliente.');
  if (!whatsapp || whatsapp.length < 8) throw new Error('Informe um WhatsApp vÃ¡lido.');

  const empresa = String(fields.empresa || '').trim();
  const instagram = String(fields.instagram || '').trim();
  const email = String(fields.email || '').trim();
  const detalhes = buildNewOrcamentoDetails({ nome, whatsapp, empresa, instagram, email });

  return insertOrcamentoDraft({
    status: DEAL_STATUS.ORCAMENTO,
    fluxo: 'Novo projeto',
    pagina: 'orcamento',
    origem: 'admin_orcamentos',
    nome,
    whatsapp,
    servico: null,
    quantidade: null,
    material_gravado: null,
    tempo_bruto: null,
    prazo: null,
    referencia: null,
    multicamera: false,
    observacoes: null,
    detalhes,
    resumo_orcamento: 'Novo orÃ§amento manual.',
    resumo_comercial: '',
    urgencia: 'media',
    prioridade: 'media',
    temperatura: 'Morno',
    proxima_acao: 'Preencher dados do projeto',
    responsavel: null,
    observacoes_internas: null,
  });
}

export async function createOrcamentoFromCliente(clienteId) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nÃ£o configurado');

  const { data: source, error } = await client
    .from('deals')
    .select('*')
    .eq('id', clienteId)
    .single();

  if (error) throw error;
  if (!source) throw new Error('Cliente nÃ£o encontrado.');

  const status = normalizeDealStatus(source.status, DEAL_STATUS.NOVO);
  if (![DEAL_STATUS.APROVADO, DEAL_STATUS.FECHADO].includes(status)) {
    throw new Error('Selecione um cliente ativo para criar o orÃ§amento.');
  }

  const cadastro = extractClientRegistration(source);
  const nome = String(source.nome || '').trim() || 'Sem cliente';
  const whatsapp = String(source.whatsapp || '').replace(/\D/g, '');
  const detalhes = buildNewOrcamentoDetails({
    source,
    nome,
    whatsapp,
    empresa: cadastro.empresa,
    instagram: cadastro.instagram,
    email: cadastro.email,
    origemOriginal: source.origem || '',
    responsavel: source.responsavel || '',
    clienteOrigemId: source.id,
  });

  return insertOrcamentoDraft({
    status: DEAL_STATUS.ORCAMENTO,
    fluxo: source.fluxo || 'Novo projeto',
    pagina: 'orcamento',
    origem: 'cliente_existente',
    nome,
    whatsapp,
    servico: null,
    quantidade: null,
    material_gravado: null,
    tempo_bruto: null,
    prazo: null,
    referencia: null,
    multicamera: false,
    observacoes: null,
    detalhes,
    resumo_orcamento: `Novo projeto para cliente existente: ${nome}.`,
    resumo_comercial: '',
    urgencia: 'media',
    prioridade: 'media',
    temperatura: source.temperatura || 'Morno',
    proxima_acao: 'Preencher dados do novo projeto',
    responsavel: source.responsavel || null,
    observacoes_internas: null,
  });
}

export async function fetchNextProposalNumberForClient({ nome, whatsapp, excludeId } = {}) {
  const client = getSupabase();
  if (!client) return '01';

  const name = String(nome || '').trim();
  const phone = String(whatsapp || '').replace(/\D/g, '');
  if (!name && !phone) return '01';

  let query = client
    .from('deals')
    .select('id,nome,whatsapp,detalhes,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (phone) {
    query = query.eq('whatsapp', phone);
  } else {
    query = query.ilike('nome', `%${name}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const maxNumber = (data || [])
    .filter((row) => String(row?.id || '') !== String(excludeId || ''))
    .reduce((max, row) => {
      const detalhes = safeParseJsonObject(row?.detalhes);
      const comercial = safeParseJsonObject(detalhes?.comercial);
      const value = extractProposalNumber(comercial?.numero_proposta);
      return Math.max(max, value);
    }, 0);

  return formatProposalSequence(maxNumber + 1);
}

export async function updateOrcamento(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  const settings = await fetchCommercialSettings();
  const pricingRules = normalizePricingRules(settings?.pricing || COMMERCIAL_DEFAULTS.pricing);

  const payload = normalizeOrcamentoPatchToDeals(patch);
  const hasPrecoFinalPatch = Object.prototype.hasOwnProperty.call(payload, 'preco_final');
  const hasValorEstimadoPatch = Object.prototype.hasOwnProperty.call(payload, 'valor_estimado');
  const shouldSyncPriceDerived = hasPrecoFinalPatch && !hasValorEstimadoPatch;
  const shouldRecalculatePricing = Boolean(payload?.recalcular_pricing);
  delete payload.recalcular_pricing;

  const { data, error } = await client
    .from('deals')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;

  let nextRecord = enrichOrcamentoRecord(mapDealToOrcamentoRecord(data), pricingRules);

  if (shouldRecalculatePricing) {
    const recomputeSeed = mapDealToOrcamentoRecord({
      ...data,
      margem_estimada: undefined,
      revisao_manual: undefined,
      faixa_sugerida: undefined,
      valor_estimado: undefined,
      desconto_volume_percent: undefined,
      multiplicador_urgencia: undefined,
      multiplicador_complexidade: undefined,
      complexidade_nivel: undefined,
      ajuste_referencia_percent: undefined,
      ajuste_multicamera_percent: undefined,
    });
    const recomputed = enrichOrcamentoRecord(recomputeSeed, pricingRules);

    const recalcPatch = {
      preco_base: Number(recomputed.preco_base || 0),
      valor_sugerido: Number(recomputed.valor_sugerido || 0),
      margem_estimada: Number(recomputed.margem_estimada || 0),
      revisao_manual: Boolean(recomputed.revisao_manual),
      valor_estimado: Number(recomputed.valor_estimado || 0),
      faixa_sugerida: String(recomputed.faixa_sugerida || ''),
      desconto_volume_percent: Number(recomputed.desconto_volume_percent || 0),
      multiplicador_urgencia: Number(recomputed.multiplicador_urgencia || 0),
      multiplicador_complexidade: Number(recomputed.multiplicador_complexidade || 0),
      complexidade_nivel: String(recomputed.complexidade_nivel || ''),
      ajuste_referencia_percent: Number(recomputed.ajuste_referencia_percent || 0),
      ajuste_multicamera_percent: Number(recomputed.ajuste_multicamera_percent || 0),
      pacote_sugerido: String(recomputed.pacote_sugerido || ''),
      motivo_calculo: String(recomputed.motivo_calculo || ''),
    };

    const { data: recalcData, error: recalcError } = await client
      .from('deals')
      .update(recalcPatch)
      .eq('id', id)
      .select('*')
      .single();

    if (!recalcError && recalcData) {
      nextRecord = enrichOrcamentoRecord(mapDealToOrcamentoRecord(recalcData), pricingRules);
    } else if (recalcError) {
      console.warn('[Orcamentos][Recalculo]', recalcError);
    }
  } else if (shouldSyncPriceDerived) {
    const derived = deriveFinancialMetricsFromFinalPrice(nextRecord, payload.preco_final, pricingRules);
    const recalcPatch = {
      valor_estimado: Number(derived.valor_estimado || 0),
    };

    const { data: recalcData, error: recalcError } = await client
      .from('deals')
      .update(recalcPatch)
      .eq('id', id)
      .select('*')
      .single();

    if (!recalcError && recalcData) {
      nextRecord = enrichOrcamentoRecord(mapDealToOrcamentoRecord(recalcData), pricingRules);
    } else if (recalcError) {
      console.warn('[Orcamentos][PrecoFinal]', recalcError);
    } else {
      nextRecord = {
        ...nextRecord,
        ...recalcPatch,
      };
    }
  }

  const syncPatch = buildLeadDerivedSyncPatch(nextRecord);
  if (leadDerivedSyncChanged(nextRecord, syncPatch)) {
    const { data: syncData, error: syncError } = await client
      .from('deals')
      .update(syncPatch)
      .eq('id', id)
      .select('*')
      .single();

    if (syncError) {
      console.warn('[Orcamentos][DerivedSync]', syncError);
    } else if (syncData) {
      nextRecord = enrichOrcamentoRecord(mapDealToOrcamentoRecord(syncData), pricingRules);
    }
  }

  return nextRecord;
}

function getAdminApiKey(explicitKey) {
  return String(explicitKey || '').trim();
}

async function getSupabaseSessionToken() {
  const client = getSupabase();
  if (!client) return '';
  try {
    const { data } = await client.auth.getSession();
    return String(data?.session?.access_token || '').trim();
  } catch {
    return '';
  }
}

async function generatePdfDocument(endpoint, id, { adminKey, payload } = {}) {
  const key = getAdminApiKey(adminKey);
  const token = await getSupabaseSessionToken();

  const headers = {
    'content-type': 'application/json; charset=utf-8',
  };
  if (key) headers['x-admin-key'] = key;
  if (token) headers.authorization = `Bearer ${token}`;

  const requestBody = {
    id,
    ...(payload && typeof payload === 'object' ? payload : {}),
  };

  const request = async (targetEndpoint) => fetch(targetEndpoint, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(requestBody),
  });
  let response = await request(endpoint);
  let rawText = '';
  let parsed = {};
  let responseContentType = '';
  try {
    responseContentType = String(response.headers.get('content-type') || '').toLowerCase();
    rawText = await response.text();
    const trimmedRawText = String(rawText || '').trim();
    const rawLooksJson = /^[\[{]/.test(trimmedRawText);
    parsed = trimmedRawText && (responseContentType.includes('application/json') || rawLooksJson)
      ? JSON.parse(trimmedRawText)
      : {};
  } catch {
    parsed = {};
  }

  const rawSnippet = String(rawText || '').trim().slice(0, 300);
  const responseLooksJson = responseContentType.includes('application/json') || /^[\[{]/.test(String(rawText || '').trim());
  const responseLooksHtml = /<!doctype html|<html|<head|<body|<script/i.test(rawSnippet);
  const hasUnexpectedResponse = Boolean(rawText) && !responseLooksJson;
  if (hasUnexpectedResponse) {
    console.error('[PDF][Runtime]', {
      endpoint,
      status: Number(response.status || 0),
      reason: 'unexpected_non_json_response',
      content_type: responseContentType,
      raw_snippet: rawSnippet,
      response_looks_html: responseLooksHtml,
      has_admin_key_header: Boolean(key),
      has_session_token: Boolean(token),
    });
    throw new Error('Falha ao gerar PDF: resposta inesperada do servidor.');
  }

  if (!response.ok || parsed?.ok === false) {
    const reason = String(parsed?.error || '').trim();
    const stage = String(parsed?.stage || '').trim();
    const requestId = String(parsed?.request_id || '').trim();
    const uploadReason = String(parsed?.upload_reason || '').trim();
    const providerStatus = Number(parsed?.provider_status || 0) || 0;
    const providerContentType = String(parsed?.provider_content_type || '').trim();
    const providerBodyPreview = String(parsed?.provider_body_preview || '').trim();
    const providerEndpoint = String(parsed?.provider_endpoint || '').trim();
    const providerAuthMode = String(parsed?.provider_auth_mode || '').trim();
    const detail = String(
      parsed?.detail
      || parsed?.message
      || parsed?.error_description
      || ''
    ).trim();
    const detailForMessage = /<!doctype html|<html|<head|<body|<script/i.test(detail) || detail.length > 500
      ? ''
      : detail;

    console.error('[PDF][Runtime]', {
      endpoint,
      status: Number(response.status || 0),
      reason,
      stage,
      request_id: requestId,
      upload_reason: uploadReason,
      detail,
      raw_snippet: rawSnippet,
      provider_status: providerStatus,
      provider_content_type: providerContentType,
      provider_body_preview: providerBodyPreview,
      provider_endpoint: providerEndpoint,
      provider_auth_mode: providerAuthMode,
      has_admin_key_header: Boolean(key),
      has_session_token: Boolean(token),
    });

    const withMeta = (baseMessage) => {
      const parts = [baseMessage];
      if (stage) parts.push(`Etapa: ${stage}.`);
      if (requestId) parts.push(`RID: ${requestId}.`);
      if (uploadReason) parts.push(`Upload: ${uploadReason}.`);
      if (detailForMessage) parts.push(`Detalhe: ${detailForMessage}.`);
      if (providerEndpoint) parts.push(`Provider: ${providerEndpoint}.`);
      if (providerAuthMode) parts.push(`Auth: ${providerAuthMode}.`);
      if (providerStatus) parts.push(`HTTP provider: ${providerStatus}.`);
      if (providerContentType) parts.push(`Content-Type provider: ${providerContentType}.`);
      return parts.join(' ');
    };

    if (reason === 'admin_key_not_configured_or_session_missing') {
      throw new Error(withMeta('Sua sessão administrativa expirou ou não está autorizada. Refaça o login no painel.'));
    }
    if (reason === 'unauthorized') {
      throw new Error(withMeta('Sem autorizacao para gerar PDF. Verifique chave admin ou sessao autenticada.'));
    }
    if (reason === 'supabase_not_configured') {
      throw new Error(withMeta('Supabase não configurado no endpoint de PDF.'));
    }
    if (reason === 'pdf_upload_failed') {
      throw new Error(withMeta('Falha no upload do PDF para o bucket configurado.'));
    }
    if (reason === 'pdf_engine_not_configured') {
      throw new Error(withMeta('Engine de renderização PDF não configurada no deploy. Defina PDFSHIFT_API_KEY ou BROWSERLESS_TOKEN.'));
    }
    if (reason === 'pdf_engine_not_supported') {
      throw new Error(withMeta('Engine de renderização PDF não suportada no deploy.'));
    }
    if (reason === 'pdf_render_failed') {
      throw new Error(withMeta('Falha ao renderizar HTML/CSS em PDF no endpoint.'));
    }
    if (reason === 'deal_link_update_failed') {
      throw new Error(withMeta('PDF gerado, mas falhou ao salvar link_pdf no deal.'));
    }
    if (reason === 'template_not_found') {
      throw new Error(withMeta('Template oficial de PDF não encontrado no deploy. Verifique publicação em /templates.'));
    }
    if (reason === 'template_placeholders_missing') {
      throw new Error(withMeta('Template de PDF com placeholders sem valor. Revise mapeamento de campos antes de gerar para uso comercial.'));
    }
    throw new Error(withMeta(reason || `Falha ao gerar PDF (${response.status})`));
  }

  console.info('[PDF][Runtime][Sucesso]', {
    endpoint,
    id,
    request_id: String(parsed?.request_id || ''),
    template_source: String(parsed?.template_source || ''),
    has_link_pdf: Boolean(String(parsed?.link_pdf || '').trim()),
  });

  return parsed;
}

export async function generateDealPdf(id, { adminKey, payload } = {}) {
  return generatePdfDocument('/api/admin-orcamentos-pdf', id, { adminKey, payload });
}

export async function generateContractPdf(id, { adminKey, payload } = {}) {
  return generatePdfDocument('/api/admin-contratos-pdf', id, { adminKey, payload });
}

export async function fetchClientesContratos({
  search,
  responsavel,
  statusContrato,
  recorrente,
  onlyRenovacaoProxima,
  limit = 600,
} = {}) {
  const client = getSupabase();
  if (!client) return [];

  let query = client
    .from('deals')
    .select('*')
    .in('status', [DEAL_STATUS.APROVADO, DEAL_STATUS.FECHADO])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,servico.ilike.%${search}%,observacoes.ilike.%${search}%`);
  }
  if (responsavel) query = query.eq('responsavel', responsavel);

  const { data, error } = await query;
  if (error) throw error;

  let contratos = (data ?? []).map(mapDealToContratoRecord);

  if (statusContrato) {
    const expected = String(statusContrato || '').toLowerCase();
    if (expected === 'vencendo') {
      contratos = contratos.filter((item) => (
        String(item.status_contrato || '').toLowerCase() === 'vencendo'
        || (
          String(item.status_contrato || '').toLowerCase() === 'ativo'
          && Number.isFinite(item.dias_para_vencimento)
          && item.dias_para_vencimento >= 0
          && item.dias_para_vencimento <= 15
        )
      ));
    } else {
      contratos = contratos.filter((item) => String(item.status_contrato || '').toLowerCase() === expected);
    }
  }

  if (typeof recorrente === 'boolean') {
    contratos = contratos.filter((item) => Boolean(item.recorrente_contrato) === recorrente);
  }

  if (onlyRenovacaoProxima) {
    contratos = contratos.filter((item) => item.renovacao_proxima);
  }

  return contratos;
}

export async function updateDeal(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const { data, error } = await client
    .from('deals')
    .update({ ...(patch || {}) })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapDealToContratoRecord(data);
}

// Contatos

export async function fetchContatos({ status, search, limit = 200 } = {}) {
  const client = getSupabase();
  if (!client) return [];

  let query = client
    .from('contatos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,mensagem.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updateContato(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  const { data, error } = await client
    .from('contatos')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// Configuracoes comerciais

export async function fetchCommercialSettings() {
  const client = getSupabase();
  if (!client) {
    return {
      ...COMMERCIAL_DEFAULTS,
      pricing: normalizePricingRules(COMMERCIAL_DEFAULTS.pricing),
    };
  }

  const { data, error } = await client
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['score_weights', 'pricing_rules', 'pipeline_status'])
    .limit(10);

  if (error) throw error;

  const settings = { ...COMMERCIAL_DEFAULTS };
  for (const row of data || []) {
    if (!row?.chave) continue;
    if (row.chave === 'score_weights' && row.valor && typeof row.valor === 'object') {
      settings.scoreWeights = deepMerge(settings.scoreWeights, row.valor);
    }
    if (row.chave === 'pricing_rules' && row.valor && typeof row.valor === 'object') {
      settings.pricing = normalizePricingRules(deepMerge(settings.pricing, row.valor));
    }
    if (row.chave === 'pipeline_status' && Array.isArray(row.valor)) {
      settings.pipelineStatus = row.valor;
    }
  }

  settings.pricing = normalizePricingRules(settings.pricing || COMMERCIAL_DEFAULTS.pricing);
  return settings;
}

export async function saveCommercialSettings(settings) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  const normalizedPricing = normalizePricingRules(settings?.pricing || COMMERCIAL_DEFAULTS.pricing);

  const rows = [
    { chave: 'score_weights', valor: settings.scoreWeights || COMMERCIAL_DEFAULTS.scoreWeights },
    { chave: 'pricing_rules', valor: normalizedPricing },
    { chave: 'pipeline_status', valor: settings.pipelineStatus || COMMERCIAL_DEFAULTS.pipelineStatus },
  ];

  const { data, error } = await client
    .from('configuracoes')
    .upsert(rows, { onConflict: 'chave' })
    .select('chave, valor');

  if (error) throw error;
  return data || [];
}

// Dashboard metrics

export async function fetchDashboardMetrics() {
  const client = getSupabase();
  if (!client) {
    return buildDashboardInsights([], []);
  }

  const pageSize = 1000;
  const maxRows = 10000;
  let from = 0;
  const deals = [];

  while (from < maxRows) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from('deals')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;

    deals.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const leads = deals.map(mapDealToLeadRecord);
  const orcamentos = deals
    .filter((row) => [
      DEAL_STATUS.ORCAMENTO,
      DEAL_STATUS.PROPOSTA_ENVIADA,
      DEAL_STATUS.AJUSTANDO,
      DEAL_STATUS.APROVADO,
      DEAL_STATUS.FECHADO,
      DEAL_STATUS.PERDIDO,
    ].includes(normalizeDealStatus(row?.status, DEAL_STATUS.NOVO)))
    .map(mapDealToOrcamentoRecord);

  return buildDashboardInsights(leads, orcamentos);
}

// Producao

export async function fetchProductionJobs({ status, search, limit = 1000 } = {}) {
  const client = getSupabase();
  if (!client) return [];

  let query = client
    .from('production_jobs')
    .select('*')
    .order('prazo_em', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(`titulo.ilike.%${search}%,cliente_nome.ilike.%${search}%,servico.ilike.%${search}%,responsavel.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateProductionJob(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const payload = { ...(patch || {}) };
  if (payload.status === 'entregue' && !payload.entregue_em) {
    payload.entregue_em = new Date().toISOString();
  }
  if (payload.status === 'arquivado' && !payload.arquivado_em) {
    payload.arquivado_em = new Date().toISOString();
  }

  const { data, error } = await client
    .from('production_jobs')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// Financeiro operacional

const FINANCEIRO_META_START = '[HAGAV_FINANCEIRO_META]';
const FINANCEIRO_META_END = '[/HAGAV_FINANCEIRO_META]';
const FINANCEIRO_META_REGEX = /\[HAGAV_FINANCEIRO_META\][\s\S]*?\[\/HAGAV_FINANCEIRO_META\]/g;

function stripFinancialMetadataBlock(value) {
  return String(value || '')
    .replace(FINANCEIRO_META_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readFinancialMetadataBlock(value) {
  const raw = String(value || '');
  const match = raw.match(FINANCEIRO_META_REGEX);
  const meta = {};
  if (!match?.[0]) return meta;

  match[0]
    .replace(FINANCEIRO_META_START, '')
    .replace(FINANCEIRO_META_END, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [key, ...rest] = line.split('=');
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return;
      meta[normalizedKey] = rest.join('=').trim();
    });
  return meta;
}

function parseFinancialLocalDate(value) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatFinancialInputDate(value) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const date = parseFinancialLocalDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addFinancialMonths(value, amount = 0) {
  const date = parseFinancialLocalDate(value);
  const day = date.getDate();
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function getFinancialMonthKey(value) {
  return formatFinancialInputDate(value).slice(0, 7);
}

function normalizeFinancialText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildActivatedClientFinancialObservacoes({
  dealId,
  recorrenteMensal,
  observacoes,
  clienteNome,
  contratoMes,
  contratoInicio,
  contratoDuracaoMeses,
}) {
  const block = [
    FINANCEIRO_META_START,
    'origem=cliente_ativo',
    `deal_id=${String(dealId || '').trim()}`,
    `cliente_nome=${String(clienteNome || '').trim()}`,
    'contrato_ativo=true',
    contratoMes ? `contrato_mes=${String(contratoMes).trim()}` : '',
    contratoInicio ? `contrato_inicio=${String(contratoInicio).trim()}` : '',
    contratoDuracaoMeses ? `contrato_duracao_meses=${String(contratoDuracaoMeses).trim()}` : '',
    'contrato=true',
    'natureza=Empresa',
    `recorrente_mensal=${Boolean(recorrenteMensal) ? 'true' : 'false'}`,
    FINANCEIRO_META_END,
  ].filter(Boolean).join('\n');
  const cleanText = stripFinancialMetadataBlock(observacoes);
  return cleanText ? `${block}\n\n${cleanText}` : block;
}

export async function fetchFinancialEntries({
  tipo,
  status,
  search,
  dueFrom,
  dueTo,
  limit = 1500,
} = {}) {
  const client = getSupabase();
  if (!client) return [];

  let query = client
    .from('financial_entries')
    .select('*')
    .order('vencimento', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tipo) query = query.eq('tipo', tipo);
  if (status) query = query.eq('status', status);
  if (dueFrom) query = query.gte('vencimento', dueFrom);
  if (dueTo) query = query.lte('vencimento', dueTo);
  if (search) {
    query = query.or(`descricao.ilike.%${search}%,cliente_fornecedor.ilike.%${search}%,categoria.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchFinancialEntriesByRecurrenceOrigin(originId) {
  const client = getSupabase();
  if (!client) return [];

  const cleanOriginId = String(originId || '').trim();
  if (!cleanOriginId) return [];

  const { data, error } = await client
    .from('financial_entries')
    .select('*')
    .ilike('observacoes', `%recorrencia_origem_id=${cleanOriginId}%`)
    .order('vencimento', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function createFinancialEntry(fields) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const payload = {
    tipo: fields?.tipo === 'pagar' ? 'pagar' : 'receber',
    categoria: String(fields?.categoria || 'projeto').trim(),
    descricao: String(fields?.descricao || '').trim(),
    cliente_fornecedor: String(fields?.cliente_fornecedor || '').trim() || null,
    valor: Math.max(0, Number(fields?.valor || 0)),
    valor_pago: Math.max(0, Number(fields?.valor_pago || 0)),
    status: String(fields?.status || 'pendente'),
    vencimento: fields?.vencimento || null,
    pago_em: fields?.status === 'pago' ? new Date().toISOString() : null,
    forma_pagamento: String(fields?.forma_pagamento || '').trim() || null,
    observacoes: String(fields?.observacoes || '').trim() || null,
  };

  const { data, error } = await client
    .from('financial_entries')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateFinancialEntry(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const payload = { ...(patch || {}) };
  if (payload.status === 'pago') {
    payload.pago_em = payload.pago_em || new Date().toISOString();
    if (payload.valor !== undefined && payload.valor_pago === undefined) {
      payload.valor_pago = Number(payload.valor || 0);
    }
  }
  if (payload.status !== 'pago' && payload.pago_em === undefined) {
    payload.pago_em = null;
  }

  const { data, error } = await client
    .from('financial_entries')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFinancialEntry(id) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const { error } = await client
    .from('financial_entries')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function upsertActivatedClientFinancialEntry(fields) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const dealId = String(fields?.dealId || '').trim();
  if (!dealId) throw new Error('Deal indisponível para sincronizar financeiro');

  const today = new Date().toISOString().slice(0, 10);
  const clientName = String(fields?.nomeCliente || '').trim();
  const companyName = String(fields?.empresa || '').trim();
  const displayName = clientName || 'Sem cliente';
  const fornecedor = clientName || companyName || 'Sem cliente';
  const valor = Math.max(0, Number(fields?.valor || 0));
  const vencimento = fields?.vencimento || fields?.dataInicio || today;

  const payload = {
    tipo: 'receber',
    categoria: 'contrato',
    descricao: `Projeto aprovado - ${displayName}`,
    cliente_fornecedor: fornecedor,
    valor,
    valor_pago: 0,
    status: 'pendente',
    vencimento,
    pago_em: null,
    forma_pagamento: String(fields?.formaPagamento || '').trim() || null,
    observacoes: buildActivatedClientFinancialObservacoes({
      dealId,
      recorrenteMensal: Boolean(fields?.recorrenteMensal),
      observacoes: fields?.observacoes,
    }),
  };

  const { data: existingRows, error: findError } = await client
    .from('financial_entries')
    .select('*')
    .ilike('observacoes', `%deal_id=${dealId}%`)
    .limit(20);

  if (findError) throw findError;

  const existing = (existingRows || []).find((entry) => {
    const observacoes = String(entry?.observacoes || '');
    return observacoes.includes('origem=cliente_ativado') && observacoes.includes(`deal_id=${dealId}`);
  });

  const query = existing?.id
    ? client.from('financial_entries').update(payload).eq('id', existing.id)
    : client.from('financial_entries').insert(payload);

  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}

export async function syncFinancialEntriesForActiveClientContract(fields) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nÃ£o configurado');

  const dealId = String(fields?.dealId || '').trim();
  if (!dealId) throw new Error('Deal indisponÃ­vel para sincronizar financeiro');

  const today = new Date().toISOString().slice(0, 10);
  const clientName = String(fields?.nomeCliente || '').trim();
  const companyName = String(fields?.empresa || '').trim();
  const displayName = clientName || 'Sem cliente';
  const fornecedor = clientName || companyName || 'Sem cliente';
  const valor = Math.max(0, Number(fields?.valor || 0));
  const startDate = formatFinancialInputDate(fields?.dataInicio || today);
  const durationMonths = Math.max(1, Number.parseInt(String(fields?.duracaoMeses || fields?.duracao_meses || 1), 10) || 1);
  const endDate = formatFinancialInputDate(addFinancialMonths(startDate, durationMonths - 1));
  const clientSearchTerms = Array.from(new Set([
    clientName,
    companyName,
    displayName,
    fornecedor,
  ].map(normalizeFinancialText).filter(Boolean)));

  const { data: existingRows, error: findError } = await client
    .from('financial_entries')
    .select('*')
    .ilike('observacoes', `%deal_id=${dealId}%`)
    .limit(120);

  if (findError) throw findError;

  const { data: legacyRows, error: legacyError } = await client
    .from('financial_entries')
    .select('*')
    .eq('tipo', 'receber')
    .gte('vencimento', startDate)
    .lte('vencimento', endDate)
    .limit(500);

  if (legacyError) throw legacyError;

  const belongsToSameClient = (entry) => {
    const meta = readFinancialMetadataBlock(entry?.observacoes);
    if (String(meta.deal_id || '').trim() === dealId) return true;
    const haystack = normalizeFinancialText(`${entry?.cliente_fornecedor || ''} ${entry?.descricao || ''}`);
    return clientSearchTerms.some((term) => term && haystack.includes(term));
  };

  const candidateById = new Map();
  [...(existingRows || []), ...(legacyRows || [])].forEach((entry) => {
    if (entry?.id && belongsToSameClient(entry)) candidateById.set(entry.id, entry);
  });

  const entriesByMonth = new Map();
  [...candidateById.values()].forEach((entry) => {
    const meta = readFinancialMetadataBlock(entry?.observacoes);
    const monthKey = String(meta.contrato_mes || '').trim()
      || getFinancialMonthKey(entry?.vencimento || startDate);
    const current = entriesByMonth.get(monthKey) || [];
    current.push(entry);
    entriesByMonth.set(monthKey, current);
  });

  const changedEntries = [];
  for (let index = 0; index < durationMonths; index += 1) {
    const dueDate = addFinancialMonths(startDate, index);
    const vencimento = formatFinancialInputDate(dueDate);
    const contratoMes = getFinancialMonthKey(dueDate);
    const monthEntries = entriesByMonth.get(contratoMes) || [];
    const expectedDescription = normalizeFinancialText(`Projeto aprovado - ${displayName}`);
    const editableLegacy = monthEntries.find((entry) => (
      String(entry?.status || '').toLowerCase() !== 'pago'
      && !String(entry?.observacoes || '').includes(`deal_id=${dealId}`)
      && normalizeFinancialText(entry?.descricao) === expectedDescription
    ));
    const editableLinked = monthEntries.find((entry) => (
      String(entry?.status || '').toLowerCase() !== 'pago'
      && String(entry?.observacoes || '').includes(`deal_id=${dealId}`)
    ));
    const paidExisting = monthEntries.find((entry) => String(entry?.status || '').toLowerCase() === 'pago');
    const existing = editableLegacy || editableLinked || paidExisting || null;
    const duplicateEntries = monthEntries.filter((entry) => {
      const observacoes = String(entry?.observacoes || '');
      return existing?.id
        && entry.id !== existing.id
        && String(entry?.status || '').toLowerCase() !== 'pago'
        && observacoes.includes(`deal_id=${dealId}`)
        && observacoes.includes('origem=cliente_ativo');
    });
    const freeObservation = stripFinancialMetadataBlock(existing?.observacoes || fields?.observacoes);
    const payload = {
      tipo: 'receber',
      categoria: 'contrato',
      descricao: `Projeto aprovado - ${displayName}`,
      cliente_fornecedor: fornecedor,
      valor,
      status: 'pendente',
      vencimento,
      forma_pagamento: String(fields?.formaPagamento || '').trim() || null,
      observacoes: buildActivatedClientFinancialObservacoes({
        dealId,
        clienteNome: displayName,
        contratoMes,
        contratoInicio: startDate,
        contratoDuracaoMeses: durationMonths,
        recorrenteMensal: Boolean(fields?.recorrenteMensal),
        observacoes: freeObservation,
      }),
    };

    if (!existing?.id) {
      const { data, error } = await client
        .from('financial_entries')
        .insert({
          ...payload,
          valor_pago: 0,
          pago_em: null,
        })
        .select('*')
        .single();
      if (error) throw error;
      changedEntries.push(data);
      continue;
    }

    const existingStatus = String(existing.status || '').toLowerCase();
    const existingPaidValue = Math.max(0, Number(existing.valor_pago || 0));

    if (existingStatus === 'pago' || (existingStatus === 'parcial' && existingPaidValue >= valor)) {
      for (const duplicate of duplicateEntries) {
        const { error } = await client
          .from('financial_entries')
          .delete()
          .eq('id', duplicate.id);
        if (error) throw error;
      }
      changedEntries.push(existing);
      continue;
    }

    const updatePayload = {
      ...payload,
      valor_pago: existingPaidValue,
      pago_em: null,
    };
    if (existingStatus === 'parcial') {
      updatePayload.status = 'parcial';
    }
    if (existingStatus === 'atrasado') {
      updatePayload.status = 'atrasado';
    }

    const { data, error } = await client
      .from('financial_entries')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    for (const duplicate of duplicateEntries) {
      const { error: deleteError } = await client
        .from('financial_entries')
        .delete()
        .eq('id', duplicate.id);
      if (deleteError) throw deleteError;
    }
    changedEntries.push(data);
  }

  return changedEntries;
}

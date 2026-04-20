import { createClient } from '@supabase/supabase-js';
import {
  buildDashboardInsights,
  enrichLeadRecord,
  enrichOrcamentoRecord,
  COMMERCIAL_DEFAULTS,
  isLeadFollowupLate,
  DEAL_STATUS,
  DEAL_STATUS_GROUPS,
  normalizeDealStatus,
  mapLegacyLeadStatusToDeal,
  mapLegacyOrcamentoStatusToDeal,
  mapDealStatusToLegacyLead,
  mapDealStatusToLegacyOrcamento,
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

  let statusContrato = statusRaw;
  if (!statusContrato) {
    if (vencimentoDate && vencimentoDate.getTime() < now.getTime()) {
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

  return {
    ...deal,
    status_deal: deal.status,
    contrato,
    status_contrato: statusContrato,
    valor_contrato: valorContrato,
    vencimento_contrato: vencimento,
    inicio_contrato: contrato?.data_inicio || null,
    recorrente_contrato: typeof contrato?.recorrente === 'boolean' ? contrato.recorrente : false,
    responsavel_contrato: contrato?.responsavel || deal?.responsavel || '',
    forma_pagamento_contrato: contrato?.forma_pagamento || '',
    renovacao_alerta_em: renovacaoEm,
    renovacao_proxima: renovacaoProxima,
    dias_para_vencimento: Number.isFinite(diasParaVencimento) ? diasParaVencimento : null,
    plano_servico: deal?.pacote_sugerido || deal?.servico || '',
    link_pdf: deal?.link_pdf || '',
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
      return () => Promise.resolve({ data: null, count: 0, error: { message: 'Supabase nao configurado' } });
    }
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// Auth

export async function signIn(email, password) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nao configurado. Verifique o .env.local.');

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

export async function updateLead(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nao configurado');

  const payload = normalizeLeadPatchToDeals(patch);
  const { data, error } = await client
    .from('deals')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return enrichLeadRecord(mapDealToLeadRecord(data));
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

  let orcamentos = (data ?? []).map(mapDealToOrcamentoRecord).map(enrichOrcamentoRecord);

  if (urgencia) orcamentos = orcamentos.filter((orc) => orc.urgencia === urgencia);
  if (prioridade) orcamentos = orcamentos.filter((orc) => orc.prioridade === prioridade);
  if (incompleto === true) orcamentos = orcamentos.filter((orc) => orc.incompleto);

  return orcamentos;
}

export async function updateOrcamento(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nao configurado');

  const payload = normalizeOrcamentoPatchToDeals(patch);
  const { data, error } = await client
    .from('deals')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return enrichOrcamentoRecord(mapDealToOrcamentoRecord(data));
}

function getAdminApiKey(explicitKey) {
  const direct = String(explicitKey || '').trim();
  if (direct) return direct;

  const fromEnv = String(
    process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_KEY
      || process.env.NEXT_PUBLIC_ORCAMENTO_ADMIN_KEY
      || process.env.NEXT_PUBLIC_HAGAV_ADMIN_KEY
      || ''
  ).trim();
  if (fromEnv) return fromEnv;

  if (typeof window === 'undefined') return '';
  try {
    return String(window.sessionStorage.getItem('hagav_admin_key') || '').trim();
  } catch {
    return '';
  }
}

export async function generateDealPdf(id, { adminKey } = {}) {
  const key = getAdminApiKey(adminKey);
  if (!key) {
    throw new Error('Chave admin nao configurada para gerar PDF.');
  }

  const response = await fetch('/api/admin-orcamentos-pdf', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-admin-key': key,
    },
    body: JSON.stringify({ id }),
  });
  const parsed = await response.json().catch(() => ({}));

  if (!response.ok || parsed?.ok === false) {
    throw new Error(parsed?.error || `Falha ao gerar PDF (${response.status})`);
  }

  return parsed;
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
    .eq('status', DEAL_STATUS.FECHADO)
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
    contratos = contratos.filter((item) => String(item.status_contrato || '').toLowerCase() === expected);
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
  if (!client) throw new Error('Supabase nao configurado');

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
  if (!client) throw new Error('Supabase nao configurado');
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
    return { ...COMMERCIAL_DEFAULTS };
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
      settings.pricing = deepMerge(settings.pricing, row.valor);
    }
    if (row.chave === 'pipeline_status' && Array.isArray(row.valor)) {
      settings.pipelineStatus = row.valor;
    }
  }

  return settings;
}

export async function saveCommercialSettings(settings) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nao configurado');

  const rows = [
    { chave: 'score_weights', valor: settings.scoreWeights || COMMERCIAL_DEFAULTS.scoreWeights },
    { chave: 'pricing_rules', valor: settings.pricing || COMMERCIAL_DEFAULTS.pricing },
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

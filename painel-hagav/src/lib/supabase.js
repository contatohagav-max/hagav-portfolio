import { createClient } from '@supabase/supabase-js';
import {
  buildDashboardInsights,
  enrichLeadRecord,
  enrichOrcamentoRecord,
  COMMERCIAL_DEFAULTS,
} from '@/lib/commercial';

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const supabaseKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
  .trim();

let _client = null;

function extractMissingColumn(errorMessage) {
  const text = String(errorMessage || '');
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

async function updateWithColumnFallback(client, table, id, patch) {
  const payload = { ...(patch || {}) };
  const maxAttempts = Math.max(1, Object.keys(payload).length + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await client
      .from(table)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (!error) return data;

    const missingColumn = extractMissingColumn(error.message);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      throw error;
    }

    delete payload[missingColumn];
  }

  throw new Error(`Falha ao atualizar ${table}.`);
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
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (origem) query = query.eq('origem', origem);
  if (fluxo) query = query.eq('fluxo', fluxo);
  if (search) query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,observacoes.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  let leads = (data ?? []).map(enrichLeadRecord);

  if (prioridade) leads = leads.filter((lead) => lead.prioridade === prioridade);
  if (urgencia) leads = leads.filter((lead) => lead.urgencia === urgencia);
  if (temperatura) leads = leads.filter((lead) => lead.temperatura === temperatura);

  if (onlyFollowupLate) {
    const now = Date.now();
    leads = leads.filter((lead) => {
      if (lead.status === 'fechado' || lead.status === 'perdido') return false;
      const nextFollowup = lead.proximo_followup_em ? new Date(lead.proximo_followup_em).getTime() : null;
      if (Number.isFinite(nextFollowup)) return nextFollowup < now;
      const lastContact = lead.ultimo_contato_em ? new Date(lead.ultimo_contato_em).getTime() : null;
      const createdAt = lead.created_at ? new Date(lead.created_at).getTime() : null;
      if (Number.isFinite(lastContact)) return (now - lastContact) > (1000 * 60 * 60 * 48);
      if (Number.isFinite(createdAt)) return (now - createdAt) > (1000 * 60 * 60 * 48);
      return false;
    });
  }

  return leads;
}

export async function updateLead(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nao configurado');

  const updated = await updateWithColumnFallback(client, 'leads', id, patch);
  return enrichLeadRecord(updated);
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
    .from('orcamentos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusOrcamento) query = query.eq('status_orcamento', statusOrcamento);
  if (status) query = query.eq('status', status);
  if (search) query = query.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,servico.ilike.%${search}%,resumo_orcamento.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;

  let orcamentos = (data ?? []).map(enrichOrcamentoRecord);

  if (urgencia) orcamentos = orcamentos.filter((orc) => orc.urgencia === urgencia);
  if (prioridade) orcamentos = orcamentos.filter((orc) => orc.prioridade === prioridade);
  if (incompleto === true) orcamentos = orcamentos.filter((orc) => orc.incompleto);

  return orcamentos;
}

export async function updateOrcamento(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase nao configurado');

  const updated = await updateWithColumnFallback(client, 'orcamentos', id, patch);
  return enrichOrcamentoRecord(updated);
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
  return updateWithColumnFallback(client, 'contatos', id, patch);
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

  if (error) {
    if (extractMissingColumn(error.message) || String(error.message || '').includes('does not exist')) {
      return { ...COMMERCIAL_DEFAULTS };
    }
    throw error;
  }

  const settings = { ...COMMERCIAL_DEFAULTS };
  for (const row of data || []) {
    if (!row?.chave) continue;
    if (row.chave === 'score_weights' && row.valor && typeof row.valor === 'object') {
      settings.scoreWeights = { ...settings.scoreWeights, ...row.valor };
    }
    if (row.chave === 'pricing_rules' && row.valor && typeof row.valor === 'object') {
      settings.pricing = { ...settings.pricing, ...row.valor };
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

  const [leadsRes, orcRes] = await Promise.all([
    client.from('leads').select('*').order('created_at', { ascending: false }).limit(1500),
    client.from('orcamentos').select('*').order('created_at', { ascending: false }).limit(1500),
  ]);

  if (leadsRes.error) throw leadsRes.error;
  if (orcRes.error) throw orcRes.error;

  return buildDashboardInsights(leadsRes.data || [], orcRes.data || []);
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const supabaseKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
  .trim();

let _client = null;

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

// Proxy que retorna gracefully quando Supabase não está configurado
export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabase();
    if (!client) return () => Promise.resolve({ data: null, count: 0, error: { message: 'Supabase não configurado' } });
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

// ─── Auth ──────────────────────────────────────────────────────────────────────

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

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function fetchLeads({ status, origem, fluxo, search, limit = 200 } = {}) {
  const client = getSupabase();
  if (!client) return [];
  let q = client.from('leads').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  if (origem) q = q.eq('origem', origem);
  if (fluxo)  q = q.eq('fluxo', fluxo);
  if (search) q = q.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateLead(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  const { data, error } = await client.from('leads').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Orçamentos ───────────────────────────────────────────────────────────────

export async function fetchOrcamentos({ statusOrcamento, status, search, limit = 200 } = {}) {
  const client = getSupabase();
  if (!client) return [];
  let q = client.from('orcamentos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (statusOrcamento) q = q.eq('status_orcamento', statusOrcamento);
  if (status)          q = q.eq('status', status);
  if (search)          q = q.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%,servico.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateOrcamento(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  const { data, error } = await client.from('orcamentos').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Contatos ─────────────────────────────────────────────────────────────────

export async function fetchContatos({ status, search, limit = 200 } = {}) {
  const client = getSupabase();
  if (!client) return [];
  let q = client.from('contatos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  if (search) q = q.or(`nome.ilike.%${search}%,whatsapp.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateContato(id, patch) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  const { data, error } = await client.from('contatos').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Dashboard metrics ────────────────────────────────────────────────────────

export async function fetchDashboardMetrics() {
  const client = getSupabase();
  if (!client) return { totalLeads: 0, novosHoje: 0, orcamentosPendentes: 0, propostasEnviadas: 0, fechadosMes: 0, taxaConversao: '0.0' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso   = today.toISOString();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const [a, b, c, d, e] = await Promise.all([
    client.from('leads').select('*', { count: 'exact', head: true }),
    client.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
    client.from('orcamentos').select('*', { count: 'exact', head: true }).eq('status_orcamento', 'pendente_revisao'),
    client.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'proposta enviada'),
    client.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'fechado').gte('created_at', monthStart),
  ]);

  const totalLeads = a.count ?? 0;
  const fechadosMes = e.count ?? 0;
  return {
    totalLeads,
    novosHoje:           b.count ?? 0,
    orcamentosPendentes: c.count ?? 0,
    propostasEnviadas:   d.count ?? 0,
    fechadosMes,
    taxaConversao: totalLeads > 0 ? ((fechadosMes / totalLeads) * 100).toFixed(1) : '0.0',
  };
}

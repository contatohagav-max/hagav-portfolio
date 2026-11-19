import { createLead, getSupabase } from '@/lib/supabase';

export const PROSPECT_STATUS_LABELS = {
  novo: 'Na fila',
  em_sequencia: 'Em sequência',
  respondeu: 'Respondeu',
  quer_conversar: 'Quer conversar',
  em_conversa: 'Em conversa',
  convertido: 'Virou lead',
  nao_agora: 'Não agora',
  sem_interesse: 'Sem interesse',
  sem_resposta: 'Sem resposta',
  descartado: 'Descartado',
  descadastrado: 'Não contatar',
};

export const PROSPECT_STATUS_COLORS = {
  novo: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  em_sequencia: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  respondeu: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  quer_conversar: 'bg-hagav-gold/15 text-hagav-gold border-hagav-gold/40',
  em_conversa: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  convertido: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  nao_agora: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  sem_interesse: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  sem_resposta: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  descartado: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
  descadastrado: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export const MOMENTO_LABELS = {
  pre_lancamento: 'Pré-lançamento',
  captacao: 'Captação',
  carrinho_aberto: 'Carrinho aberto',
  perpetuo: 'Perpétuo',
  sem_sinal: 'Sem sinal',
};

export const CLASSIFICACAO_LABELS = {
  interessado: 'Interessado',
  duvida: 'Dúvida',
  nao_agora: 'Não agora',
  sem_interesse: 'Sem interesse',
  descadastro: 'Descadastro',
  resposta_automatica: 'Resposta automática',
  bounce: 'Email voltou',
  outro: 'Outro',
};

export const PROSPECT_TABS = [
  { key: 'quer_conversar', label: 'Querem conversar', statuses: ['quer_conversar'] },
  { key: 'em_conversa', label: 'Em conversa', statuses: ['em_conversa'] },
  { key: 'respondeu', label: 'Responderam', statuses: ['respondeu'] },
  { key: 'em_sequencia', label: 'Em sequência', statuses: ['em_sequencia'] },
  { key: 'fila', label: 'Na fila', statuses: ['novo'] },
  {
    key: 'encerrados',
    label: 'Encerrados',
    statuses: ['convertido', 'nao_agora', 'sem_interesse', 'sem_resposta', 'descartado', 'descadastrado'],
  },
];

const STOP_SEQUENCE_STATUSES = new Set([
  'quer_conversar', 'em_conversa', 'convertido', 'sem_interesse', 'descartado', 'descadastrado',
]);

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');
  return client;
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function escapeIlike(value) {
  return String(value || '').replace(/[%,()]/g, ' ').trim();
}

export async function fetchProspects({ statuses, search, limit = 500 } = {}) {
  const client = getSupabase();
  if (!client) return [];

  let query = client
    .from('prospects')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (Array.isArray(statuses) && statuses.length) query = query.in('status', statuses);
  const term = escapeIlike(search);
  if (term) {
    query = query.or(`nome.ilike.%${term}%,empresa.ilike.%${term}%,email.ilike.%${term}%,instagram.ilike.%${term}%,nicho.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchProspectStatusCounts() {
  const client = getSupabase();
  if (!client) return {};
  const { data, error } = await client.from('prospects').select('status').limit(10000);
  if (error) throw error;
  return (data || []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
}

export async function fetchQuerConversarCount() {
  const client = getSupabase();
  if (!client) return 0;
  const { count, error } = await client
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'quer_conversar');
  if (error) return 0;
  return count || 0;
}

async function countRows(builder) {
  const { count, error } = await builder;
  if (error) throw error;
  return count || 0;
}

export async function fetchProspectMetrics() {
  const client = getSupabase();
  if (!client) return null;
  const today = startOfTodayIso();
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [encontradosHoje, enviadosHoje, abordados30, responderam30] = await Promise.all([
    countRows(client.from('prospects').select('id', { count: 'exact', head: true }).gte('created_at', today)),
    countRows(
      client
        .from('prospect_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direcao', 'saida')
        .eq('status', 'enviado')
        .gte('enviado_em', today),
    ),
    countRows(client.from('prospects').select('id', { count: 'exact', head: true }).gte('ultimo_contato_em', last30)),
    countRows(client.from('prospects').select('id', { count: 'exact', head: true }).gte('respondeu_em', last30)),
  ]);

  return {
    encontradosHoje,
    enviadosHoje,
    abordados30,
    responderam30,
    taxaResposta30: abordados30 > 0 ? (responderam30 / abordados30) * 100 : 0,
  };
}

export async function fetchProspectMessages(prospectId) {
  const client = requireClient();
  const { data, error } = await client
    .from('prospect_messages')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchProspectById(id) {
  const client = requireClient();
  const { data, error } = await client.from('prospects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function cancelPendingMessages(prospectId) {
  const client = requireClient();
  const { error } = await client
    .from('prospect_messages')
    .update({ status: 'cancelado', erro: 'cancelado pela equipe no painel' })
    .eq('prospect_id', prospectId)
    .eq('direcao', 'saida')
    .in('status', ['agendado', 'rascunho']);
  if (error) throw error;
}

export async function updateProspect(id, patch) {
  const client = requireClient();
  const { data, error } = await client
    .from('prospects')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  if (patch?.status && STOP_SEQUENCE_STATUSES.has(patch.status)) {
    await cancelPendingMessages(id);
  }
  return data;
}

export async function suppressProspect(prospect) {
  const client = requireClient();
  const values = [
    prospect?.email ? String(prospect.email).toLowerCase() : '',
    prospect?.instagram ? `@${String(prospect.instagram).toLowerCase()}` : '',
  ].filter(Boolean);
  if (values.length) {
    const { error } = await client
      .from('outreach_suppression')
      .upsert(values.map((valor) => ({ valor, motivo: 'manual_painel' })), { onConflict: 'valor', ignoreDuplicates: true });
    if (error) throw error;
  }
  return updateProspect(prospect.id, { status: 'descadastrado' });
}

export async function convertProspectToLead(prospect, { whatsapp, servico, responsavel } = {}) {
  const client = requireClient();
  const contexto = [
    prospect.resumo ? `Por que é um bom cliente: ${prospect.resumo}` : '',
    prospect.resumo_resposta ? `Resposta: ${prospect.resumo_resposta}` : '',
    prospect.ultima_resposta && !prospect.resumo_resposta ? `Resposta: ${prospect.ultima_resposta}` : '',
  ].filter(Boolean).join('\n');

  const lead = await createLead({
    nome: prospect.nome,
    whatsapp: whatsapp || prospect.whatsapp,
    empresa: prospect.empresa || '',
    origem: 'prospeccao_ativa',
    servico: servico || '',
    status: 'qualificado',
    temperatura: 'Quente',
    responsavel: responsavel || prospect.responsavel || '',
    contexto_resumo: contexto,
    observacoes_internas: [
      'Lead vindo da prospecção automática.',
      prospect.instagram ? `Instagram: @${prospect.instagram}` : '',
      prospect.email ? `Email: ${prospect.email}` : '',
      prospect.fonte_url ? `Fonte: ${prospect.fonte_url}` : '',
    ].filter(Boolean).join('\n'),
  });

  // Guarda email/instagram no cadastro do lead (usado para não prospectar clientes de novo)
  if (lead?.id) {
    const { data: deal } = await client.from('deals').select('detalhes').eq('id', lead.id).maybeSingle();
    const detalhes = { ...(deal?.detalhes || {}) };
    if (prospect.email) detalhes.email_cliente = prospect.email;
    if (prospect.instagram) detalhes.instagram = prospect.instagram;
    detalhes.prospect_id = prospect.id;
    await client.from('deals').update({ detalhes }).eq('id', lead.id);
  }

  const updated = await updateProspect(prospect.id, {
    status: 'convertido',
    deal_id: lead?.id || null,
    whatsapp: String(whatsapp || prospect.whatsapp || '').replace(/\D/g, '') || null,
  });
  return { lead, prospect: updated };
}

export async function fetchAutomationRuns({ limit = 40 } = {}) {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from('automation_runs')
    .select('*')
    .order('iniciado_em', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchNotifications({ limit = 60 } = {}) {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from('admin_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markNotificationsRead({ ids, prospectId, all = false } = {}) {
  const client = requireClient();
  let query = client.from('admin_notifications').update({ lida_em: new Date().toISOString() }).is('lida_em', null);
  if (prospectId) query = query.eq('prospect_id', prospectId);
  else if (Array.isArray(ids) && ids.length) query = query.in('id', ids);
  else if (!all) return;
  const { error } = await query;
  if (error) throw error;
}

// ---------------- Aprovacao dos rascunhos ----------------

const DIA_MS = 24 * 60 * 60 * 1000;
// Intervalo padrao dos follow-ups quando o rascunho nao traz um horario proprio (em dias, a partir da 1a mensagem).
const FOLLOW_UP_DIAS = { 2: 3, 3: 8, 4: 14 };

// Prospects com mensagens em rascunho, cada um com suas mensagens em ordem de etapa.
export async function fetchDrafts() {
  const client = getSupabase();
  if (!client) return [];
  const { data: rascunhos, error } = await client
    .from('prospect_messages')
    .select('*')
    .eq('direcao', 'saida')
    .eq('status', 'rascunho')
    .order('etapa', { ascending: true })
    .limit(2000);
  if (error) throw error;
  const ids = [...new Set((rascunhos || []).map((m) => m.prospect_id))];
  if (!ids.length) return [];
  const { data: prospects, error: erroProspects } = await client.from('prospects').select('*').in('id', ids);
  if (erroProspects) throw erroProspects;
  return (prospects || [])
    .filter((p) => !['descartado', 'descadastrado', 'convertido', 'sem_interesse'].includes(p.status))
    .map((p) => ({ prospect: p, mensagens: rascunhos.filter((m) => m.prospect_id === p.id) }));
}

// Novo horario de cada etapa: a 1a sai na proxima rodada; as seguintes mantem a distancia original.
export function reagendarRascunhos(mensagens, agora = new Date()) {
  const ordenadas = [...mensagens].sort((a, b) => Number(a.etapa || 1) - Number(b.etapa || 1));
  const base = ordenadas[0]?.agendado_para ? new Date(ordenadas[0].agendado_para).getTime() : null;
  return ordenadas.map((m, i) => {
    let distancia = 0;
    if (i > 0) {
      const original = m.agendado_para && base ? new Date(m.agendado_para).getTime() - base : 0;
      distancia = original >= DIA_MS ? original : (FOLLOW_UP_DIAS[Number(m.etapa)] || 3 * i) * DIA_MS;
    }
    return { id: m.id, etapa: m.etapa, agendado_para: new Date(agora.getTime() + distancia).toISOString() };
  });
}

// Aprova a sequencia de email: rascunho -> agendado (com os textos editados, se houver).
export async function approveDrafts(prospect, mensagens, edicoes = {}) {
  const client = requireClient();
  if (!prospect?.email) throw new Error('Esse prospect não tem email para receber a sequência.');
  const agenda = reagendarRascunhos(mensagens);
  for (const item of agenda) {
    const original = mensagens.find((m) => m.id === item.id) || {};
    const edicao = edicoes[item.id] || {};
    const patch = { status: 'agendado', agendado_para: item.agendado_para, erro: null };
    if (typeof edicao.corpo === 'string' && edicao.corpo.trim() && edicao.corpo !== original.corpo) patch.corpo = edicao.corpo.trim();
    if (typeof edicao.assunto === 'string' && edicao.assunto !== original.assunto) patch.assunto = edicao.assunto.trim() || null;
    const { error } = await client.from('prospect_messages').update(patch).eq('id', item.id).eq('status', 'rascunho');
    if (error) throw error;
  }
  return agenda;
}

// Mensagem enviada a mao (DM no Instagram): marca como enviada e poe o prospect em sequencia.
export async function markDraftSentManually(prospect, mensagem, edicao = {}) {
  const client = requireClient();
  const agora = new Date().toISOString();
  const patch = { status: 'enviado', enviado_em: agora, erro: null };
  if (typeof edicao.corpo === 'string' && edicao.corpo.trim() && edicao.corpo !== mensagem.corpo) patch.corpo = edicao.corpo.trim();
  const { error } = await client.from('prospect_messages').update(patch).eq('id', mensagem.id);
  if (error) throw error;
  return updateProspect(prospect.id, {
    status: 'em_sequencia',
    ultimo_contato_em: agora,
    tentativas: Math.max(Number(prospect.tentativas || 0), Number(mensagem.etapa || 1)),
  });
}

export async function saveDraftText(mensagem, { assunto, corpo } = {}) {
  const client = requireClient();
  const patch = {};
  if (typeof corpo === 'string' && corpo.trim()) patch.corpo = corpo.trim();
  if (typeof assunto === 'string') patch.assunto = assunto.trim() || null;
  if (!Object.keys(patch).length) return;
  const { error } = await client.from('prospect_messages').update(patch).eq('id', mensagem.id).eq('status', 'rascunho');
  if (error) throw error;
}

export const MOTIVOS_REPROVACAO = [
  'Não é o perfil',
  'Já tem editor ou agência',
  'Grande demais',
  'Pequeno demais',
  'Momento errado',
  'Mensagem ruim',
];

// Reprova: descarta o prospect (cancela os rascunhos) e guarda o motivo, que ensina a busca do dia seguinte.
export async function rejectProspect(prospect, motivo) {
  const nota = `Reprovado na aprovação${motivo ? `: ${motivo}` : ''} (${new Date().toLocaleDateString('pt-BR')}).`;
  return updateProspect(prospect.id, {
    status: 'descartado',
    notas: [prospect.notas, nota].filter(Boolean).join('\n'),
  });
}

// Teste do endpoint /api/automacao com um "PostgREST" simulado em memoria.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Uso: node scripts/test-automacao-api.mjs
const endpointUrl = new URL('../functions/api/automacao/[[path]].js', import.meta.url);
const { onRequest } = await import(endpointUrl.href);

const db = {
  prospects: [], prospect_messages: [], outreach_suppression: [], automation_runs: [],
  admin_notifications: [], financial_entries: [], admin_audit_logs: [],
  deals: [{ id: randomUUID(), whatsapp: '11999990000', detalhes: { email_cliente: 'cliente@existente.com', instagram: '@clienteig' } }],
};
const uniqueKeys = { prospects: 'dedupe_key', financial_entries: 'origin_key', outreach_suppression: 'valor' };
const defaults = {
  prospects: () => ({ status: 'novo', tentativas: 0, score: 0, sinais: {}, canal: 'email', notas: null }),
  prospect_messages: () => ({ status: 'agendado', etapa: 1 }),
  admin_notifications: () => ({ lida_em: null }),
  financial_entries: () => ({}), automation_runs: () => ({}), outreach_suppression: () => ({}), admin_audit_logs: () => ({}),
};
const requests = [];

function parseList(text) {
  const inner = text.replace(/^\(/, '').replace(/\)$/, '');
  const out = []; let cur = ''; let q = false;
  for (const ch of inner) {
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function getVal(row, col) {
  if (col.includes('->>')) { const [a, b] = col.split('->>'); return row[a]?.[b] == null ? null : String(row[a][b]); }
  return row[col];
}
function cond(row, col, expr) {
  const v = getVal(row, col);
  const [op, ...rest] = expr.split('.'); const arg = rest.join('.');
  if (op === 'eq') return String(v) === arg;
  if (op === 'in') return parseList(arg).includes(String(v));
  if (op === 'is') return arg === 'null' ? v == null : false;
  if (op === 'lte') return v != null && String(v) <= arg;
  if (op === 'lt') return v != null && String(v) < arg;
  if (op === 'gte') return v != null && String(v) >= arg;
  throw new Error(`op nao suportado ${op}`);
}
function splitTop(text) {
  const out = []; let depth = 0; let cur = ''; let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function orCond(row, expr) {
  const inner = expr.replace(/^\(/, '').replace(/\)$/, '');
  return splitTop(inner).some((part) => {
    const m = part.match(/^([a-z_]+(?:->>[a-z_]+)?)\.(.*)$/);
    return cond(row, m[1], m[2]);
  });
}
function applyFilters(rows, params) {
  return rows.filter((row) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (k === 'or') { if (!orCond(row, v)) return false; continue; }
      if (!cond(row, k, v)) return false;
    }
    return true;
  });
}
function embed(table, row, select) {
  const out = { ...row };
  const m1 = select.match(/prospect:prospects\(([^)]*)\)/);
  if (m1) out.prospect = db.prospects.find((p) => p.id === row.prospect_id) || null;
  const m2 = select.match(/mensagens:prospect_messages/);
  if (m2) out.mensagens = db.prospect_messages.filter((m) => m.prospect_id === row.id);
  return out;
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const table = u.pathname.replace('/rest/v1/', '');
  const params = [...u.searchParams.entries()];
  const method = init.method || 'GET';
  const prefer = init.headers?.Prefer || '';
  const body = init.body ? JSON.parse(init.body) : null;
  requests.push({ method, table, query: u.search });
  if (!db[table]) throw new Error(`tabela desconhecida ${table}`);
  const respond = (data, status = 200, headers = {}) => new Response(data == null ? '' : JSON.stringify(data), { status, headers });

  if (method === 'GET') {
    let rows = applyFilters(db[table], params);
    const total = rows.length;
    const order = u.searchParams.get('order');
    if (order) {
      const parts = order.split(',').map((p) => p.split('.'));
      rows = [...rows].sort((a, b) => {
        for (const [col, dir] of parts) {
          const x = a[col] ?? ''; const y = b[col] ?? '';
          if (x < y) return dir === 'desc' ? 1 : -1;
          if (x > y) return dir === 'desc' ? -1 : 1;
        }
        return 0;
      });
    }
    const limit = Number(u.searchParams.get('limit') || 1e9);
    rows = rows.slice(0, limit).map((r) => embed(table, r, u.searchParams.get('select') || ''));
    return respond(rows, 200, prefer.includes('count=exact') ? { 'content-range': `0-${rows.length - 1}/${total}` } : {});
  }
  if (method === 'POST') {
    const items = Array.isArray(body) ? body : [body];
    const key = u.searchParams.get('on_conflict') || uniqueKeys[table];
    const inserted = [];
    for (const item of items) {
      if (key && db[table].some((r) => r[key] === item[key])) {
        if (prefer.includes('ignore-duplicates')) continue;
        return respond({ code: '23505', message: 'duplicate key' }, 409);
      }
      if (table === 'prospect_messages' && item.provider_message_id && db[table].some((r) => r.provider_message_id === item.provider_message_id)) {
        return respond({ code: '23505', message: 'duplicate key' }, 409);
      }
      const now = new Date().toISOString();
      const row = { id: randomUUID(), created_at: now, updated_at: now, ...defaults[table](), ...item };
      db[table].push(row); inserted.push(row);
    }
    return respond(prefer.includes('return=representation') ? inserted : null, 201);
  }
  if (method === 'PATCH') {
    const rows = applyFilters(db[table], params);
    rows.forEach((r) => Object.assign(r, body, { updated_at: new Date().toISOString() }));
    return respond(prefer.includes('return=representation') ? rows : null, 200);
  }
  throw new Error(`metodo ${method}`);
};

const TOKEN = 'x'.repeat(40);
const env = { AUTOMATION_TOKEN: TOKEN, SUPABASE_URL: 'https://fake.supabase.co', SERVICE_ROLE_KEY: 'srk', OUTREACH_DAILY_CAP: '2' };
async function call(method, path, body, token = TOKEN) {
  const request = new Request(`https://hagav.com.br/api/automacao/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const segs = path.split('?')[0].split('/').filter(Boolean);
  const res = await onRequest({ request, env, params: { path: segs }, waitUntil: () => {} });
  return { status: res.status, data: await res.json() };
}

// 1. Token errado
let r = await call('GET', 'status', null, 'errado');
assert.equal(r.status, 401);

// 2. Status
r = await call('GET', 'status');
assert.equal(r.status, 200, JSON.stringify(r.data));

// 3. Bloqueio previo
r = await call('POST', 'bloqueios', { valores: ['saiu@lista.com', '@naoquer'], motivo: 'descadastro' });
assert.equal(r.data.adicionados, 2);

// 4. Inserir prospects (com casos de borda)
const passado = new Date(Date.now() - 60000).toISOString();
r = await call('POST', 'prospects', {
  prospects: [
    { nome: 'Ana Expert', email: 'Ana@Expert.com', instagram: 'https://instagram.com/ana.expert/', score: 82, fonte: 'meta_ads',
      mensagens: [
        { etapa: 1, status: 'agendado', assunto: 'Vídeos do seu lançamento', corpo: 'Oi Ana,\n\nVi seu anúncio...', agendado_para: passado },
        { etapa: 2, status: 'agendado', assunto: 'Re: Vídeos', corpo: 'Retomando...', agendado_para: new Date(Date.now() + 3 * 864e5).toISOString() },
      ] },
    { nome: 'Bruno Coprodutor', email: 'bruno@copro.com', score: 70, mensagens: [{ etapa: 1, status: 'agendado', corpo: 'Oi Bruno', agendado_para: passado }] },
    { nome: 'Carla', email: 'carla@x.com', mensagens: [{ etapa: 1, status: 'agendado', corpo: 'Oi Carla', agendado_para: passado }] },
    { nome: 'Duplicada', email: 'ana@expert.com' },
    { nome: 'Saiu', email: 'saiu@lista.com' },
    { nome: 'Nao quer', instagram: '@naoquer' },
    { nome: 'Cliente', email: 'cliente@existente.com' },
    { nome: 'Cliente IG', instagram: 'clienteig' },
    { nome: '', email: 'semnome@x.com' },
    { nome: 'Sem contato' },
  ],
});
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.inseridos.length, 3, JSON.stringify(r.data));
assert.equal(r.data.mensagens_agendadas, 4);
assert.equal(r.data.ignorados.duplicados_no_lote.length, 1);
assert.equal(r.data.ignorados.descadastrados.length, 2);
assert.equal(r.data.ignorados.ja_no_crm.length, 2, JSON.stringify(r.data.ignorados));
assert.equal(r.data.ignorados.invalidos.length, 2);
const ana = db.prospects.find((p) => p.email === 'ana@expert.com');
assert.equal(ana.instagram, 'ana.expert');
assert.equal(ana.dedupe_key, 'email:ana@expert.com');

// 5. Reenviar o mesmo prospect -> ja_prospectados
r = await call('POST', 'prospects', { prospects: [{ nome: 'Ana de novo', email: 'ana@expert.com' }] });
assert.equal(r.data.inseridos.length, 0);
assert.equal(r.data.ignorados.ja_prospectados.length, 1);

// 6. Check
r = await call('POST', 'prospects/check', { candidatos: [{ email: 'ana@expert.com' }, { email: 'nova@pessoa.com' }, { instagram: 'naoquer' }, { email: 'cliente@existente.com' }] });
assert.deepEqual(r.data.resultados.map((x) => x.novo), [false, true, false, false]);

// 7. Fila: limite diario 2, uma por prospect, so as vencidas
r = await call('GET', 'mensagens/fila?canal=email&limit=10');
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.mensagens.length, 2, JSON.stringify(r.data));
assert.ok(r.data.mensagens.every((m) => m.status === 'agendado' || true));
const [m1, m2] = r.data.mensagens;
assert.equal(db.prospect_messages.find((m) => m.id === m1.id).status, 'enviando');

// 8. Marcar como enviada -> prospect em_sequencia
r = await call('PATCH', `mensagens/${m1.id}`, { status: 'enviado', provider_message_id: 'gmail-1', thread_id: 't-1' });
assert.equal(r.status, 200, JSON.stringify(r.data));
const p1 = db.prospects.find((p) => p.id === m1.prospect_id);
assert.equal(p1.status, 'em_sequencia');
assert.equal(p1.tentativas, 1);
r = await call('PATCH', `mensagens/${m2.id}`, { status: 'enviado', provider_message_id: 'gmail-2' });

// 9. Limite diario atingido -> fila vazia
r = await call('GET', 'mensagens/fila?canal=email');
assert.equal(r.data.enviados_hoje, 2);
assert.equal(r.data.mensagens.length, 0);

// 10. Resposta automatica nao muda nada
r = await call('POST', 'mensagens', { prospect_id: ana.id, direcao: 'entrada', corpo: 'Estou de férias', classificacao: 'resposta_automatica', provider_message_id: 'in-0' });
assert.equal(db.prospects.find((p) => p.id === ana.id).status, 'em_sequencia');
assert.equal(db.prospect_messages.filter((m) => m.prospect_id === ana.id && m.status === 'agendado').length, 1);

// 11. Resposta interessada -> quer_conversar, cancela follow-up, notifica
r = await call('POST', 'mensagens', { prospect_id: ana.id, direcao: 'entrada', corpo: 'Tenho interesse, me chama no zap', classificacao: 'interessado', resumo: 'Quer conversar, pediu WhatsApp', provider_message_id: 'in-1' });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(db.prospects.find((p) => p.id === ana.id).status, 'quer_conversar');
assert.equal(db.prospect_messages.filter((m) => m.prospect_id === ana.id && m.status === 'agendado').length, 0);
assert.equal(db.admin_notifications.filter((n) => n.tipo === 'quer_conversar').length, 1);

// 12. Mesma resposta lida de novo -> duplicada, sem nova notificacao
r = await call('POST', 'mensagens', { prospect_id: ana.id, direcao: 'entrada', corpo: 'Tenho interesse', classificacao: 'interessado', provider_message_id: 'in-1' });
assert.equal(r.data.duplicada, true);
assert.equal(db.admin_notifications.filter((n) => n.tipo === 'quer_conversar').length, 1);

// 13. Descadastro -> bloqueio permanente
const bruno = db.prospects.find((p) => p.email === 'bruno@copro.com');
r = await call('POST', 'mensagens', { prospect_id: bruno.id, direcao: 'entrada', corpo: 'Não me mande mais', classificacao: 'descadastro', provider_message_id: 'in-2' });
assert.equal(db.prospects.find((p) => p.id === bruno.id).status, 'descadastrado');
assert.ok(db.outreach_suppression.some((s) => s.valor === 'bruno@copro.com'));

// 14. Resposta sem classificacao -> respondeu + notificacao; depois reclassificada
const carla = db.prospects.find((p) => p.email === 'carla@x.com');
r = await call('POST', 'mensagens', { prospect_id: carla.id, direcao: 'entrada', corpo: 'Quanto custa?', provider_message_id: 'in-3' });
assert.equal(db.prospects.find((p) => p.id === carla.id).status, 'respondeu');
const inbound = r.data.mensagem;
r = await call('PATCH', `mensagens/${inbound.id}`, { classificacao: 'interessado', resumo: 'Perguntou preço' });
assert.equal(db.prospects.find((p) => p.id === carla.id).status, 'quer_conversar');

// 15. Equipe assumiu: resposta nova nao rebaixa status
db.prospects.find((p) => p.id === carla.id).status = 'em_conversa';
r = await call('POST', 'mensagens', { prospect_id: carla.id, direcao: 'entrada', corpo: 'Não tenho interesse mais', classificacao: 'sem_interesse', provider_message_id: 'in-4' });
assert.equal(db.prospects.find((p) => p.id === carla.id).status, 'em_conversa');

// 16. Execucao
r = await call('POST', 'execucoes', { tipo: 'prospeccao', status: 'rodando' });
const runId = r.data.execucao.id;
r = await call('PATCH', `execucoes/${runId}`, { status: 'ok', resumo: '3 novos', metricas: { novos: 3 } });
assert.equal(r.data.execucao.status, 'ok');
assert.ok(r.data.execucao.finalizado_em);

// 17. Financeiro
r = await call('POST', 'financeiro/lancamentos', { lancamentos: [
  { origin_key: 'c6:abc', tipo: 'receber', valor: 'R$ 1.500,00', descricao: 'Pix recebido - Cliente X', data: '05/11/2026', natureza: 'Empresa', fonte: 'c6_extrato', categoria: 'projeto' },
  { origin_key: 'c6:def', tipo: 'pagar', valor: -89.9, descricao: 'Adobe', data: '2026-11-06', natureza: 'Empresa', categoria: 'software' },
  { origin_key: 'c6:ghi', tipo: 'pagar', valor: 42, descricao: 'iFood', data: '2026-11-06', natureza: 'Pessoal', revisar: true },
  { origin_key: 'c6:abc', tipo: 'receber', valor: 1500, descricao: 'dup no lote', data: '2026-11-05' },
  { origin_key: 'deal:xyz', tipo: 'receber', valor: 10, descricao: 'reservado' },
  { origin_key: 'c6:zero', tipo: 'pagar', valor: 0, descricao: 'zero' },
] });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.inseridos, 3);
assert.equal(r.data.para_revisar, 1);
assert.equal(r.data.invalidos.length, 2);
const fx = db.financial_entries.find((e) => e.origin_key === 'c6:abc');
assert.equal(fx.valor, 1500);
assert.equal(fx.vencimento, '2026-11-05');
assert.equal(fx.status, 'pago');
assert.match(fx.observacoes, /natureza=Empresa/);
assert.equal(db.financial_entries.find((e) => e.origin_key === 'c6:def').valor, 89.9);
assert.match(db.financial_entries.find((e) => e.origin_key === 'c6:ghi').observacoes, /natureza=Pessoal/);
r = await call('POST', 'financeiro/lancamentos', { lancamentos: [{ origin_key: 'c6:abc', tipo: 'receber', valor: 1500, descricao: 'reimport', data: '2026-11-05' }] });
assert.equal(r.data.inseridos, 0);
assert.equal(r.data.ja_existiam, 1);

// 18. Rota inexistente e id invalido
r = await call('GET', 'nada');
assert.equal(r.status, 404);
r = await call('PATCH', 'prospects/123', { status: 'novo' });
assert.equal(r.status, 400);

// 19. PATCH prospect -> descadastrado adiciona bloqueio
const carlaRow = db.prospects.find((p) => p.id === carla.id);
r = await call('PATCH', `prospects/${carlaRow.id}`, { status: 'descadastrado' });
assert.ok(db.outreach_suppression.some((s) => s.valor === 'carla@x.com'));

// 20. Financeiro: listar e dar baixa (conciliacao com o banco)
db.financial_entries.push({ id: randomUUID(), tipo: 'receber', valor: 4000, valor_pago: 0, status: 'pendente', vencimento: '2026-10-10', descricao: 'Projeto aprovado - Escola Voila', origin_key: 'deal:abc:receber', observacoes: 'obs original' });
r = await call('GET', 'financeiro/lancamentos?de=2026-10-01&ate=2026-10-31&tipo=receber&abertos=1');
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.lancamentos.length, 1);
const aberto = r.data.lancamentos[0];
r = await call('PATCH', `financeiro/lancamentos/${aberto.id}`, { status: 'pago', pago_em: '2026-10-13T12:00:00Z', forma_pagamento: 'Pix', observacao_adicional: 'Baixa automatica: Pix C6 13/10', fonte: 'c6_email' });
assert.equal(r.status, 200, JSON.stringify(r.data));
const baixado = db.financial_entries.find((e) => e.id === aberto.id);
assert.equal(baixado.status, 'pago');
assert.equal(baixado.valor_pago, 4000);
assert.match(baixado.observacoes, /obs original\nBaixa automatica/);
r = await call('PATCH', `financeiro/lancamentos/${aberto.id}`, { status: 'inventado' });
assert.equal(r.status, 400);
r = await call('GET', 'financeiro/lancamentos?abertos=1&tipo=receber&de=2026-10-01&ate=2026-10-31');
assert.equal(r.data.lancamentos.length, 0);

// 20b. Mensagem sem status chega como rascunho (so sai depois de aprovada no painel)
r = await call('POST', 'prospects', { prospects: [{ nome: 'Eva Rascunho', email: 'eva@expert.com', mensagens: [{ etapa: 1, corpo: 'Oi Eva', agendado_para: passado }] }] });
assert.equal(r.status, 200, JSON.stringify(r.data));
const eva = db.prospects.find((p) => p.email === 'eva@expert.com');
assert.equal(db.prospect_messages.find((m) => m.prospect_id === eva.id).status, 'rascunho');

// 21. Follow-up so sai 2 dias depois da etapa anterior enviada
const ontem = new Date(Date.now() - 864e5).toISOString();
db.prospect_messages.filter((m) => m.status === 'enviado').forEach((m) => { m.enviado_em = new Date(Date.now() - 3 * 864e5).toISOString(); });
const dani = { id: randomUUID(), nome: 'Dani', email: 'dani@expert.com', status: 'em_sequencia', tentativas: 1, canal: 'email' };
db.prospects.push(dani);
db.prospect_messages.push(
  { id: randomUUID(), prospect_id: dani.id, direcao: 'saida', canal: 'email', etapa: 1, status: 'enviado', enviado_em: ontem, corpo: 'Oi Dani', agendado_para: ontem },
  { id: randomUUID(), prospect_id: dani.id, direcao: 'saida', canal: 'email', etapa: 2, status: 'agendado', corpo: 'Retomando', agendado_para: ontem },
);
r = await call('GET', 'mensagens/fila?canal=email&limit=10');
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.ok(!r.data.mensagens.some((m) => m.prospect_id === dani.id), 'follow-up saiu antes de 2 dias');
db.prospect_messages.find((m) => m.prospect_id === dani.id && m.etapa === 1).enviado_em = new Date(Date.now() - 2.5 * 864e5).toISOString();
r = await call('GET', 'mensagens/fila?canal=email&limit=10');
assert.ok(r.data.mensagens.some((m) => m.prospect_id === dani.id && m.etapa === 2), 'follow-up liberado nao saiu');

console.log(`OK - ${requests.length} chamadas ao banco simulado, todos os cenarios passaram`);

// HAGAV - API de automacoes (prospeccao, mensagens, notificacoes, importacao financeira).
//
// Autenticacao: header `Authorization: Bearer <AUTOMATION_TOKEN>`
// (ou `x-hagav-automation-token`). O token fica na variavel de ambiente
// AUTOMATION_TOKEN do Cloudflare Pages. Trocar o token revoga o acesso.
//
// Este endpoint so mexe nas tabelas de automacao. Ele nao le nem altera
// clientes (deals), exceto uma checagem de "ja e cliente/lead" antes de
// cadastrar um prospect, que devolve apenas sim/nao.

import { firstEnvValue, getSupabaseConfig, json, getClientIp } from '../../_utils/admin-auth.js';
import { logAdminRequestEvent } from '../../_utils/admin-audit.js';
import { applyRateLimit, rateLimitResponse } from '../../_utils/rate-limit.js';

const MAX_BATCH = 200;
const DEFAULT_DAILY_CAP = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const PROSPECT_STATUS = [
  'novo', 'em_sequencia', 'respondeu', 'quer_conversar', 'em_conversa', 'convertido',
  'nao_agora', 'sem_interesse', 'sem_resposta', 'descartado', 'descadastrado',
];
const SENDABLE_PROSPECT_STATUS = new Set(['novo', 'em_sequencia', 'nao_agora']);
const HUMAN_OWNED_STATUS = new Set(['em_conversa', 'convertido']);
const CANAIS = ['email', 'instagram', 'whatsapp', 'linkedin', 'outro'];
const MESSAGE_STATUS = ['rascunho', 'agendado', 'enviando', 'enviado', 'falhou', 'cancelado', 'recebido'];
const CLASSIFICACOES = [
  'interessado', 'duvida', 'nao_agora', 'sem_interesse', 'descadastro',
  'resposta_automatica', 'bounce', 'outro',
];
const RUN_STATUS = ['rodando', 'ok', 'parcial', 'erro'];
const FIN_STATUS = ['pendente', 'parcial', 'pago', 'atrasado', 'cancelado'];

// ---------------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function cleanText(value, maxLen = 240, { multiline = false } = {}) {
  if (value === null || value === undefined) return '';
  let text = String(value).normalize('NFKC').replace(/\r\n?/g, '\n');
  text = multiline
    ? text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n')
    : text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  return text.trim().slice(0, maxLen);
}

function nullableText(value, maxLen, opts) {
  const text = cleanText(value, maxLen, opts);
  return text || null;
}

function pickEnum(value, allowed, fallback = null) {
  const text = cleanText(value, 40).toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function toInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function toMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(Math.abs(value) * 100) / 100 : null;
  const raw = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) / 100 : null;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = toIso(text);
  return iso ? iso.slice(0, 10) : null;
}

function safeJsonObject(value, maxBytes = 12000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const text = JSON.stringify(value);
  if (text.length > maxBytes) return { truncado: true, raw: text.slice(0, maxBytes) };
  return value;
}

function normEmail(value) {
  const email = cleanText(value, 200).toLowerCase().replace(/^mailto:/, '');
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) ? email : '';
}

function normInstagram(value) {
  let text = cleanText(value, 200).toLowerCase();
  if (!text) return '';
  text = text
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/^instagram\.com\//, '')
    .replace(/^@/, '')
    .split(/[/?#\s]/)[0];
  return /^[a-z0-9._]{1,30}$/.test(text) ? text : '';
}

function normDomain(value) {
  const text = cleanText(value, 300).toLowerCase();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normWhatsapp(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13 ? digits : '';
}

function whatsappVariants(digits) {
  if (!digits) return [];
  return digits.startsWith('55') ? [digits, digits.slice(2)] : [digits, `55${digits}`];
}

function buildDedupeKey({ email, instagram, site }) {
  if (email) return `email:${email}`;
  if (instagram) return `ig:${instagram}`;
  if (site) return `site:${site}`;
  return '';
}

function pgList(values) {
  return `(${values.map((v) => `"${String(v).replace(/["\\]/g, '')}"`).join(',')})`;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

async function tokensMatch(provided, expected) {
  if (!provided || !expected) return false;
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function readProvidedToken(request) {
  const header = String(request.headers.get('x-hagav-automation-token') || '').trim();
  if (header) return header;
  const auth = String(request.headers.get('authorization') || '').trim();
  return /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
}

function startOfTodayBrasilia() {
  // America/Sao_Paulo = UTC-3 (sem horario de verao desde 2019)
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  now.setUTCHours(0, 0, 0, 0);
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Supabase REST
// ---------------------------------------------------------------------------

async function sb(config, path, { method = 'GET', body, prefer, count = false } = {}) {
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    'content-type': 'application/json; charset=utf-8',
  };
  const preferParts = [prefer, count ? 'count=exact' : ''].filter(Boolean);
  if (preferParts.length) headers.Prefer = preferParts.join(',');

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : 400, 'supabase_error', {
      message: data?.message || data?.hint || `supabase_${response.status}`,
      code: data?.code,
    });
  }
  if (count) {
    const range = response.headers.get('content-range') || '';
    const total = Number(range.split('/')[1]);
    return { data, total: Number.isFinite(total) ? total : 0 };
  }
  return data;
}

async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 2_000_000) throw new HttpError(413, 'payload_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

async function createNotification(config, fields) {
  const payload = {
    tipo: cleanText(fields.tipo, 40) || 'info',
    titulo: cleanText(fields.titulo, 200) || 'Aviso da automação',
    corpo: nullableText(fields.corpo, 4000, { multiline: true }),
    link: nullableText(fields.link, 500),
    prospect_id: fields.prospect_id || null,
  };
  const rows = await sb(config, 'admin_notifications', {
    method: 'POST',
    body: payload,
    prefer: 'return=representation',
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function addSuppression(config, values, motivo = 'descadastro') {
  const rows = [...new Set(values.filter(Boolean))].map((valor) => ({ valor, motivo: cleanText(motivo, 80) || 'descadastro' }));
  if (!rows.length) return 0;
  await sb(config, 'outreach_suppression?on_conflict=valor', {
    method: 'POST',
    body: rows,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  return rows.length;
}

async function fetchSuppressed(config, values) {
  const list = [...new Set(values.filter(Boolean))];
  if (!list.length) return new Set();
  const rows = await sb(config, `outreach_suppression?select=valor&valor=in.${encodeURIComponent(pgList(list))}`);
  return new Set((rows || []).map((row) => row.valor));
}

async function fetchExistingDealsContacts(config, { emails, whatsapps, instagrams }) {
  const filters = [];
  const wa = [...new Set(whatsapps.flatMap(whatsappVariants))];
  if (wa.length) filters.push(`whatsapp.in.${pgList(wa)}`);
  if (emails.length) filters.push(`detalhes->>email_cliente.in.${pgList(emails)}`);
  if (instagrams.length) {
    const igs = [...new Set(instagrams.flatMap((h) => [h, `@${h}`]))];
    filters.push(`detalhes->>instagram.in.${pgList(igs)}`);
  }
  const found = { emails: new Set(), whatsapps: new Set(), instagrams: new Set() };
  if (!filters.length) return found;

  const rows = await sb(
    config,
    `deals?select=whatsapp,detalhes&or=${encodeURIComponent(`(${filters.join(',')})`)}&limit=500`,
  );
  (rows || []).forEach((row) => {
    const w = normWhatsapp(row.whatsapp);
    whatsappVariants(w).forEach((v) => found.whatsapps.add(v));
    const e = normEmail(row?.detalhes?.email_cliente);
    if (e) found.emails.add(e);
    const ig = normInstagram(row?.detalhes?.instagram);
    if (ig) found.instagrams.add(ig);
  });
  return found;
}

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------

function normalizeProspectInput(raw = {}) {
  const email = normEmail(raw.email);
  const instagram = normInstagram(raw.instagram);
  const site = normDomain(raw.site);
  const whatsapp = normWhatsapp(raw.whatsapp);
  const dedupeKey = buildDedupeKey({ email, instagram, site });
  const nome = cleanText(raw.nome, 160);

  const row = {
    dedupe_key: dedupeKey,
    status: pickEnum(raw.status, ['novo', 'descartado'], 'novo'),
    nome,
    empresa: nullableText(raw.empresa, 160),
    perfil: nullableText(raw.perfil, 40),
    nicho: nullableText(raw.nicho, 120),
    instagram: instagram || null,
    seguidores: toInt(raw.seguidores),
    email: email || null,
    whatsapp: whatsapp || null,
    site: nullableText(raw.site, 300),
    fonte: nullableText(raw.fonte, 40),
    fonte_url: nullableText(raw.fonte_url, 600),
    score: toInt(raw.score, { min: 0, max: 100 }) ?? 0,
    score_motivos: nullableText(raw.score_motivos, 1500, { multiline: true }),
    momento: nullableText(raw.momento, 40),
    sinais: safeJsonObject(raw.sinais),
    resumo: nullableText(raw.resumo, 2000, { multiline: true }),
    canal: pickEnum(raw.canal, CANAIS, email ? 'email' : 'instagram'),
    proximo_contato_em: toIso(raw.proximo_contato_em),
    responsavel: nullableText(raw.responsavel, 80),
    notas: nullableText(raw.notas, 3000, { multiline: true }),
  };

  const errors = [];
  if (!nome) errors.push('nome_obrigatorio');
  if (!dedupeKey) errors.push('precisa_email_instagram_ou_site');
  return { row, errors, keys: { email, instagram, site, whatsapp } };
}

function normalizeOutboundMessage(raw = {}, prospect) {
  const corpo = cleanText(raw.corpo, 8000, { multiline: true });
  if (!corpo) return null;
  return {
    prospect_id: prospect.id,
    canal: pickEnum(raw.canal, CANAIS, prospect.canal || 'email'),
    direcao: 'saida',
    etapa: toInt(raw.etapa, { min: 1, max: 20 }) ?? 1,
    assunto: nullableText(raw.assunto, 200),
    corpo,
    status: pickEnum(raw.status, ['rascunho', 'agendado'], 'agendado'),
    agendado_para: toIso(raw.agendado_para) || new Date().toISOString(),
  };
}

async function handleProspectsCreate(config, body) {
  const input = Array.isArray(body?.prospects) ? body.prospects : [];
  if (!input.length) throw new HttpError(400, 'prospects_vazio');
  if (input.length > MAX_BATCH) throw new HttpError(400, 'lote_maximo_200');

  const normalized = input.map((raw, index) => ({ index, raw, ...normalizeProspectInput(raw) }));
  const invalid = normalized.filter((item) => item.errors.length);
  let valid = normalized.filter((item) => !item.errors.length);

  // Deduplica dentro do proprio lote
  const seen = new Set();
  const duplicatedInBatch = [];
  valid = valid.filter((item) => {
    if (seen.has(item.row.dedupe_key)) {
      duplicatedInBatch.push(item);
      return false;
    }
    seen.add(item.row.dedupe_key);
    return true;
  });

  // Lista de bloqueio (descadastros)
  const suppressionValues = valid.flatMap(({ keys }) => [
    keys.email,
    keys.email ? keys.email.split('@')[1] : '',
    keys.instagram ? `@${keys.instagram}` : '',
    keys.site,
  ]);
  const suppressed = await fetchSuppressed(config, suppressionValues);
  const blocked = [];
  valid = valid.filter((item) => {
    const { email, instagram, site } = item.keys;
    const hit = (email && (suppressed.has(email) || suppressed.has(email.split('@')[1])))
      || (instagram && suppressed.has(`@${instagram}`))
      || (site && suppressed.has(site));
    if (hit) blocked.push(item);
    return !hit;
  });

  // Ja e cliente ou lead no CRM?
  const existingDeals = await fetchExistingDealsContacts(config, {
    emails: valid.map((i) => i.keys.email).filter(Boolean),
    whatsapps: valid.map((i) => i.keys.whatsapp).filter(Boolean),
    instagrams: valid.map((i) => i.keys.instagram).filter(Boolean),
  });
  const alreadyInCrm = [];
  valid = valid.filter((item) => {
    const { email, whatsapp, instagram } = item.keys;
    const hit = (email && existingDeals.emails.has(email))
      || (whatsapp && existingDeals.whatsapps.has(whatsapp))
      || (instagram && existingDeals.instagrams.has(instagram));
    if (hit) alreadyInCrm.push(item);
    return !hit;
  });

  let inserted = [];
  if (valid.length) {
    inserted = await sb(config, 'prospects?on_conflict=dedupe_key', {
      method: 'POST',
      body: valid.map((item) => item.row),
      prefer: 'resolution=ignore-duplicates,return=representation',
    }) || [];
  }
  const insertedByKey = new Map(inserted.map((row) => [row.dedupe_key, row]));
  const alreadyProspects = valid.filter((item) => !insertedByKey.has(item.row.dedupe_key));

  // Mensagens que vieram junto com o prospect (ex.: primeira abordagem + follow-ups)
  const messages = [];
  valid.forEach((item) => {
    const prospect = insertedByKey.get(item.row.dedupe_key);
    if (!prospect || !Array.isArray(item.raw?.mensagens)) return;
    item.raw.mensagens.slice(0, 6).forEach((msg) => {
      const row = normalizeOutboundMessage(msg, prospect);
      if (row) messages.push(row);
    });
  });
  if (messages.length) {
    await sb(config, 'prospect_messages', { method: 'POST', body: messages, prefer: 'return=minimal' });
  }

  const ref = (item) => ({ index: item.index, nome: item.row.nome, dedupe_key: item.row.dedupe_key });
  return {
    ok: true,
    inseridos: inserted.map((row) => ({ id: row.id, nome: row.nome, dedupe_key: row.dedupe_key })),
    mensagens_agendadas: messages.length,
    ignorados: {
      ja_prospectados: alreadyProspects.map(ref),
      ja_no_crm: alreadyInCrm.map(ref),
      descadastrados: blocked.map(ref),
      duplicados_no_lote: duplicatedInBatch.map(ref),
      invalidos: invalid.map((item) => ({ index: item.index, nome: item.row.nome, erros: item.errors })),
    },
  };
}

async function handleProspectsCheck(config, body) {
  const candidates = Array.isArray(body?.candidatos) ? body.candidatos.slice(0, 500) : [];
  const items = candidates.map((raw) => {
    const email = normEmail(raw?.email);
    const instagram = normInstagram(raw?.instagram);
    const site = normDomain(raw?.site);
    const whatsapp = normWhatsapp(raw?.whatsapp);
    return { raw, email, instagram, site, whatsapp, key: buildDedupeKey({ email, instagram, site }) };
  });

  const emails = items.map((i) => i.email).filter(Boolean);
  const instagrams = items.map((i) => i.instagram).filter(Boolean);
  const keys = items.map((i) => i.key).filter(Boolean);

  const orFilters = [];
  if (keys.length) orFilters.push(`dedupe_key.in.${pgList(keys)}`);
  if (emails.length) orFilters.push(`email.in.${pgList(emails)}`);
  if (instagrams.length) orFilters.push(`instagram.in.${pgList(instagrams)}`);

  const existing = orFilters.length
    ? await sb(config, `prospects?select=id,dedupe_key,email,instagram,status&or=${encodeURIComponent(`(${orFilters.join(',')})`)}&limit=1000`)
    : [];
  const suppressed = await fetchSuppressed(config, items.flatMap((i) => [
    i.email, i.email ? i.email.split('@')[1] : '', i.instagram ? `@${i.instagram}` : '', i.site,
  ]));
  const deals = await fetchExistingDealsContacts(config, {
    emails,
    whatsapps: items.map((i) => i.whatsapp).filter(Boolean),
    instagrams,
  });

  const results = items.map((item) => {
    const prospect = (existing || []).find((row) => row.dedupe_key === item.key
      || (item.email && row.email === item.email)
      || (item.instagram && row.instagram === item.instagram));
    const isSuppressed = (item.email && (suppressed.has(item.email) || suppressed.has(item.email.split('@')[1])))
      || (item.instagram && suppressed.has(`@${item.instagram}`))
      || (item.site && suppressed.has(item.site));
    const inCrm = (item.email && deals.emails.has(item.email))
      || (item.whatsapp && deals.whatsapps.has(item.whatsapp))
      || (item.instagram && deals.instagrams.has(item.instagram));
    return {
      dedupe_key: item.key || null,
      novo: Boolean(item.key) && !prospect && !isSuppressed && !inCrm,
      ja_prospectado: prospect ? { id: prospect.id, status: prospect.status } : null,
      descadastrado: Boolean(isSuppressed),
      ja_no_crm: Boolean(inCrm),
    };
  });
  return { ok: true, resultados: results };
}

async function handleProspectsList(config, url) {
  const params = url.searchParams;
  const limit = toInt(params.get('limit'), { min: 1, max: 500 }) ?? 100;
  const filters = ['select=*'];
  const statuses = String(params.get('status') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => PROSPECT_STATUS.includes(s));
  if (statuses.length) filters.push(`status=in.${encodeURIComponent(pgList(statuses))}`);
  if (params.get('due') === '1') filters.push(`proximo_contato_em=lte.${encodeURIComponent(new Date().toISOString())}`);
  if (params.get('since')) {
    const since = toIso(params.get('since'));
    if (since) filters.push(`updated_at=gte.${encodeURIComponent(since)}`);
  }
  const order = params.get('order') === 'recentes' ? 'created_at.desc' : 'score.desc,created_at.desc';
  filters.push(`order=${order}`, `limit=${limit}`);
  const rows = await sb(config, `prospects?${filters.join('&')}`);
  return { ok: true, prospects: rows || [] };
}

async function handleProspectGet(config, id) {
  const rows = await sb(config, `prospects?select=*,mensagens:prospect_messages(*)&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows?.length) throw new HttpError(404, 'prospect_nao_encontrado');
  const prospect = rows[0];
  prospect.mensagens = (prospect.mensagens || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return { ok: true, prospect };
}

async function handleProspectPatch(config, id, body) {
  const patch = {};
  if ('status' in body) {
    const status = pickEnum(body.status, PROSPECT_STATUS);
    if (!status) throw new HttpError(400, 'status_invalido');
    patch.status = status;
  }
  const textFields = {
    nome: 160, empresa: 160, perfil: 40, nicho: 120, site: 300, fonte: 40, fonte_url: 600,
    momento: 40, responsavel: 80,
  };
  Object.entries(textFields).forEach(([field, max]) => {
    if (field in body) patch[field] = nullableText(body[field], max);
  });
  const multiline = { score_motivos: 1500, resumo: 2000, notas: 3000, resumo_resposta: 2000 };
  Object.entries(multiline).forEach(([field, max]) => {
    if (field in body) patch[field] = nullableText(body[field], max, { multiline: true });
  });
  if ('email' in body) patch.email = normEmail(body.email) || null;
  if ('instagram' in body) patch.instagram = normInstagram(body.instagram) || null;
  if ('whatsapp' in body) patch.whatsapp = normWhatsapp(body.whatsapp) || null;
  if ('seguidores' in body) patch.seguidores = toInt(body.seguidores);
  if ('score' in body) patch.score = toInt(body.score, { min: 0, max: 100 }) ?? 0;
  if ('canal' in body) patch.canal = pickEnum(body.canal, CANAIS, 'email');
  if ('sinais' in body) patch.sinais = safeJsonObject(body.sinais);
  if ('proximo_contato_em' in body) patch.proximo_contato_em = toIso(body.proximo_contato_em);
  if (!Object.keys(patch).length) throw new HttpError(400, 'nada_para_atualizar');

  const rows = await sb(config, `prospects?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });
  if (!rows?.length) throw new HttpError(404, 'prospect_nao_encontrado');

  if (patch.status && ['sem_interesse', 'descadastrado', 'descartado', 'quer_conversar', 'em_conversa', 'convertido'].includes(patch.status)) {
    await cancelPendingOutbound(config, id);
  }
  if (patch.status === 'descadastrado') {
    const p = rows[0];
    await addSuppression(config, [p.email, p.instagram ? `@${p.instagram}` : ''], 'descadastro');
  }
  return { ok: true, prospect: rows[0] };
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

async function fetchProspect(config, id) {
  const rows = await sb(config, `prospects?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows?.length) throw new HttpError(404, 'prospect_nao_encontrado');
  return rows[0];
}

async function cancelPendingOutbound(config, prospectId) {
  await sb(
    config,
    `prospect_messages?prospect_id=eq.${encodeURIComponent(prospectId)}&direcao=eq.saida&status=in.(agendado,rascunho)`,
    { method: 'PATCH', body: { status: 'cancelado', erro: 'cancelado: prospect respondeu ou saiu da sequencia' }, prefer: 'return=minimal' },
  );
}

async function applyOutboundSent(config, prospect, message) {
  if (!['novo', 'em_sequencia', 'nao_agora'].includes(prospect.status)) return;
  await sb(config, `prospects?id=eq.${encodeURIComponent(prospect.id)}`, {
    method: 'PATCH',
    body: {
      status: 'em_sequencia',
      tentativas: Math.max(Number(prospect.tentativas || 0), Number(message.etapa || 1)),
      ultimo_contato_em: message.enviado_em || new Date().toISOString(),
    },
    prefer: 'return=minimal',
  });
}

async function applyInbound(config, prospect, message, extra = {}) {
  const classificacao = message.classificacao || null;
  if (classificacao === 'resposta_automatica') return { status: prospect.status, notificado: false };

  const patch = {
    respondeu_em: message.recebido_em || new Date().toISOString(),
    ultima_resposta: cleanText(message.corpo, 4000, { multiline: true }) || null,
  };
  if (message.resumo) patch.resumo_resposta = cleanText(message.resumo, 2000, { multiline: true });

  const humanOwned = HUMAN_OWNED_STATUS.has(prospect.status);
  if (!humanOwned) {
    const map = {
      interessado: 'quer_conversar',
      duvida: 'respondeu',
      outro: 'respondeu',
      nao_agora: 'nao_agora',
      sem_interesse: 'sem_interesse',
      descadastro: 'descadastrado',
      bounce: 'descartado',
    };
    patch.status = map[classificacao] || 'respondeu';
    if (classificacao === 'nao_agora') {
      patch.proximo_contato_em = toIso(extra.proximo_contato_em) || new Date(Date.now() + 60 * DAY_MS).toISOString();
    }
    if (classificacao === 'bounce') {
      patch.notas = [prospect.notas, 'Email retornou (bounce).'].filter(Boolean).join('\n');
    }
  }

  await cancelPendingOutbound(config, prospect.id);
  await sb(config, `prospects?id=eq.${encodeURIComponent(prospect.id)}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });

  if (classificacao === 'descadastro') {
    await addSuppression(config, [prospect.email, prospect.instagram ? `@${prospect.instagram}` : ''], 'descadastro');
    return { status: patch.status || prospect.status, notificado: false };
  }
  if (classificacao === 'bounce' || classificacao === 'sem_interesse' || classificacao === 'nao_agora') {
    return { status: patch.status || prospect.status, notificado: false };
  }

  const interested = classificacao === 'interessado';
  await createNotification(config, {
    tipo: interested ? 'quer_conversar' : 'respondeu',
    titulo: interested ? `${prospect.nome} quer conversar` : `${prospect.nome} respondeu`,
    corpo: message.resumo || cleanText(message.corpo, 600, { multiline: true }),
    link: `/admin/prospeccao/?id=${prospect.id}`,
    prospect_id: prospect.id,
  });
  return { status: patch.status || prospect.status, notificado: true };
}

async function handleMessagesCreate(config, body) {
  const prospect = await fetchProspect(config, cleanText(body.prospect_id, 64));
  const direcao = pickEnum(body.direcao, ['saida', 'entrada']);
  if (!direcao) throw new HttpError(400, 'direcao_invalida');
  const corpo = cleanText(body.corpo, 8000, { multiline: true });
  if (!corpo) throw new HttpError(400, 'corpo_obrigatorio');

  const row = {
    prospect_id: prospect.id,
    canal: pickEnum(body.canal, CANAIS, prospect.canal || 'email'),
    direcao,
    etapa: direcao === 'entrada' ? 0 : (toInt(body.etapa, { min: 1, max: 20 }) ?? 1),
    assunto: nullableText(body.assunto, 200),
    corpo,
    status: direcao === 'entrada'
      ? 'recebido'
      : pickEnum(body.status, ['rascunho', 'agendado', 'enviado', 'falhou'], 'agendado'),
    agendado_para: direcao === 'saida' ? (toIso(body.agendado_para) || new Date().toISOString()) : null,
    enviado_em: toIso(body.enviado_em),
    recebido_em: direcao === 'entrada' ? (toIso(body.recebido_em) || new Date().toISOString()) : null,
    provider_message_id: nullableText(body.provider_message_id, 300),
    thread_id: nullableText(body.thread_id, 300),
    classificacao: pickEnum(body.classificacao, CLASSIFICACOES),
    resumo: nullableText(body.resumo, 2000, { multiline: true }),
    erro: nullableText(body.erro, 1000),
  };
  if (row.direcao === 'saida' && row.status === 'enviado' && !row.enviado_em) row.enviado_em = new Date().toISOString();

  let inserted;
  try {
    const rows = await sb(config, 'prospect_messages', { method: 'POST', body: row, prefer: 'return=representation' });
    inserted = rows?.[0];
  } catch (error) {
    // Mesma mensagem do provedor ja registrada (ex.: resposta lida duas vezes)
    if (error?.details?.code === '23505') return { ok: true, duplicada: true };
    throw error;
  }

  let efeito = null;
  if (row.direcao === 'saida' && row.status === 'enviado') await applyOutboundSent(config, prospect, inserted);
  if (row.direcao === 'entrada') efeito = await applyInbound(config, prospect, inserted, body);
  return { ok: true, mensagem: inserted, efeito };
}

async function handleMessagesQueue(config, env, url) {
  const cap = toInt(firstEnvValue(env, ['OUTREACH_DAILY_CAP']), { min: 0, max: 500 }) ?? DEFAULT_DAILY_CAP;
  const canal = pickEnum(url.searchParams.get('canal'), CANAIS, 'email');
  const requested = toInt(url.searchParams.get('limit'), { min: 1, max: 100 }) ?? 10;

  // Mensagens presas em "enviando" ha mais de 30 min (envio interrompido) voltam para a fila
  await sb(
    config,
    `prospect_messages?direcao=eq.saida&status=eq.enviando&updated_at=lt.${encodeURIComponent(new Date(Date.now() - 30 * 60 * 1000).toISOString())}`,
    { method: 'PATCH', body: { status: 'agendado' }, prefer: 'return=minimal' },
  );

  const sentToday = await sb(
    config,
    `prospect_messages?select=id&direcao=eq.saida&status=eq.enviado&canal=eq.${canal}&enviado_em=gte.${encodeURIComponent(startOfTodayBrasilia())}&limit=1`,
    { count: true },
  );
  const remaining = Math.max(0, cap - sentToday.total);
  if (!remaining) return { ok: true, limite_diario: cap, enviados_hoje: sentToday.total, mensagens: [] };

  const rows = await sb(
    config,
    `prospect_messages?select=*,prospect:prospects(id,nome,email,instagram,whatsapp,status,canal)`
      + `&direcao=eq.saida&status=eq.agendado&canal=eq.${canal}`
      + `&agendado_para=lte.${encodeURIComponent(new Date().toISOString())}`
      + `&order=agendado_para.asc&limit=${Math.min(remaining, requested) * 3}`,
  ) || [];

  const suppressed = await fetchSuppressed(config, rows.flatMap((m) => {
    const email = normEmail(m.prospect?.email);
    return [email, email ? email.split('@')[1] : '', m.prospect?.instagram ? `@${m.prospect.instagram}` : ''];
  }));

  const ready = [];
  const toCancel = [];
  const seenProspects = new Set();
  rows.forEach((m) => {
    const p = m.prospect;
    const email = normEmail(p?.email);
    const blocked = !p
      || !SENDABLE_PROSPECT_STATUS.has(p.status)
      || (canal === 'email' && !email)
      || (email && (suppressed.has(email) || suppressed.has(email.split('@')[1])))
      || (p.instagram && suppressed.has(`@${p.instagram}`));
    if (blocked) {
      toCancel.push(m.id);
      return;
    }
    if (seenProspects.has(p.id)) return; // uma mensagem por prospect por rodada
    seenProspects.add(p.id);
    if (ready.length < Math.min(remaining, requested)) ready.push(m);
  });

  if (toCancel.length) {
    await sb(config, `prospect_messages?id=in.${encodeURIComponent(pgList(toCancel))}`, {
      method: 'PATCH',
      body: { status: 'cancelado', erro: 'cancelado: prospect fora da sequencia, sem email ou descadastrado' },
      prefer: 'return=minimal',
    });
  }
  if (ready.length) {
    await sb(config, `prospect_messages?id=in.${encodeURIComponent(pgList(ready.map((m) => m.id)))}`, {
      method: 'PATCH',
      body: { status: 'enviando' },
      prefer: 'return=minimal',
    });
  }
  return { ok: true, limite_diario: cap, enviados_hoje: sentToday.total, mensagens: ready };
}

async function handleMessagePatch(config, id, body) {
  const rows = await sb(config, `prospect_messages?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const current = rows?.[0];
  if (!current) throw new HttpError(404, 'mensagem_nao_encontrada');

  const patch = {};
  if ('status' in body) {
    const status = pickEnum(body.status, MESSAGE_STATUS);
    if (!status) throw new HttpError(400, 'status_invalido');
    patch.status = status;
  }
  if ('provider_message_id' in body) patch.provider_message_id = nullableText(body.provider_message_id, 300);
  if ('thread_id' in body) patch.thread_id = nullableText(body.thread_id, 300);
  if ('erro' in body) patch.erro = nullableText(body.erro, 1000);
  if ('resumo' in body) patch.resumo = nullableText(body.resumo, 2000, { multiline: true });
  if ('assunto' in body) patch.assunto = nullableText(body.assunto, 200);
  if ('corpo' in body) {
    const corpo = cleanText(body.corpo, 8000, { multiline: true });
    if (corpo) patch.corpo = corpo;
  }
  if ('agendado_para' in body) patch.agendado_para = toIso(body.agendado_para);
  if ('classificacao' in body) patch.classificacao = pickEnum(body.classificacao, CLASSIFICACOES);
  if (patch.status === 'enviado') patch.enviado_em = toIso(body.enviado_em) || new Date().toISOString();
  if (!Object.keys(patch).length) throw new HttpError(400, 'nada_para_atualizar');

  const updatedRows = await sb(config, `prospect_messages?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });
  const updated = updatedRows?.[0];

  let efeito = null;
  if (updated.direcao === 'saida' && patch.status === 'enviado' && current.status !== 'enviado') {
    await applyOutboundSent(config, await fetchProspect(config, updated.prospect_id), updated);
  }
  if (updated.direcao === 'entrada' && 'classificacao' in patch && patch.classificacao !== current.classificacao) {
    efeito = await applyInbound(config, await fetchProspect(config, updated.prospect_id), updated, body);
  }
  return { ok: true, mensagem: updated, efeito };
}

// ---------------------------------------------------------------------------
// Execucoes, notificacoes, bloqueios
// ---------------------------------------------------------------------------

async function handleRunCreate(config, body) {
  const status = pickEnum(body.status, RUN_STATUS, 'rodando');
  const row = {
    tipo: cleanText(body.tipo, 60) || 'outro',
    status,
    resumo: nullableText(body.resumo, 4000, { multiline: true }),
    metricas: safeJsonObject(body.metricas),
    erro: nullableText(body.erro, 2000, { multiline: true }),
    finalizado_em: status === 'rodando' ? null : new Date().toISOString(),
  };
  const rows = await sb(config, 'automation_runs', { method: 'POST', body: row, prefer: 'return=representation' });
  return { ok: true, execucao: rows?.[0] };
}

async function handleRunPatch(config, id, body) {
  const patch = {};
  if ('status' in body) {
    patch.status = pickEnum(body.status, RUN_STATUS, 'ok');
    if (patch.status !== 'rodando') patch.finalizado_em = new Date().toISOString();
  }
  if ('resumo' in body) patch.resumo = nullableText(body.resumo, 4000, { multiline: true });
  if ('metricas' in body) patch.metricas = safeJsonObject(body.metricas);
  if ('erro' in body) patch.erro = nullableText(body.erro, 2000, { multiline: true });
  if (!Object.keys(patch).length) throw new HttpError(400, 'nada_para_atualizar');
  const rows = await sb(config, `automation_runs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });
  if (!rows?.length) throw new HttpError(404, 'execucao_nao_encontrada');
  return { ok: true, execucao: rows[0] };
}

async function handleSuppressionAdd(config, body) {
  const values = (Array.isArray(body?.valores) ? body.valores : []).slice(0, 500).map((value) => {
    const text = cleanText(value, 200).toLowerCase();
    if (text.startsWith('@')) {
      const ig = normInstagram(text);
      return ig ? `@${ig}` : '';
    }
    return normEmail(text) || normDomain(text);
  });
  const total = await addSuppression(config, values, body?.motivo);
  return { ok: true, adicionados: total };
}

// ---------------------------------------------------------------------------
// Financeiro (importacao de extrato/emails do banco)
// ---------------------------------------------------------------------------

function buildFinancialMetaBlock(natureza) {
  const value = String(natureza || '').trim().toLowerCase() === 'pessoal' ? 'Pessoal' : 'Empresa';
  return ['[HAGAV_FINANCEIRO_META]', `natureza=${value}`, 'recorrente_mensal=false', '[/HAGAV_FINANCEIRO_META]'].join('\n');
}

function normalizeFinancialInput(raw = {}) {
  const errors = [];
  const originKey = cleanText(raw.origin_key, 200);
  if (!originKey) errors.push('origin_key_obrigatoria');
  if (/^deal:/i.test(originKey)) errors.push('origin_key_reservada');

  const tipo = pickEnum(raw.tipo, ['receber', 'pagar']);
  if (!tipo) errors.push('tipo_invalido');
  const valor = toMoney(raw.valor);
  if (!valor) errors.push('valor_invalido');
  const descricao = cleanText(raw.descricao, 300);
  if (!descricao) errors.push('descricao_obrigatoria');

  const status = pickEnum(raw.status, FIN_STATUS, 'pago');
  const valorPago = status === 'pago' ? valor : (toMoney(raw.valor_pago) ?? 0);
  const vencimento = toDateOnly(raw.vencimento || raw.data);
  const pagoEm = status === 'pago' ? (toIso(raw.pago_em) || (vencimento ? `${vencimento}T12:00:00.000Z` : new Date().toISOString())) : null;
  const observacaoLivre = cleanText(raw.observacoes, 2000, { multiline: true });

  return {
    errors,
    row: {
      origin_key: originKey,
      tipo,
      categoria: cleanText(raw.categoria, 80) || 'outros',
      descricao,
      cliente_fornecedor: nullableText(raw.cliente_fornecedor, 160),
      valor,
      valor_pago: valorPago,
      status,
      vencimento,
      pago_em: pagoEm,
      forma_pagamento: nullableText(raw.forma_pagamento, 60),
      observacoes: [buildFinancialMetaBlock(raw.natureza), observacaoLivre].filter(Boolean).join('\n\n'),
      fonte: cleanText(raw.fonte, 40) || 'importacao',
      revisar: Boolean(raw.revisar),
      dados_banco: raw.dados_banco && typeof raw.dados_banco === 'object' ? safeJsonObject(raw.dados_banco, 4000) : null,
    },
  };
}

async function handleFinancialImport(config, body) {
  const input = Array.isArray(body?.lancamentos) ? body.lancamentos : [];
  if (!input.length) throw new HttpError(400, 'lancamentos_vazio');
  if (input.length > 1000) throw new HttpError(400, 'lote_maximo_1000');

  const normalized = input.map((raw, index) => ({ index, ...normalizeFinancialInput(raw) }));
  const invalid = normalized.filter((item) => item.errors.length);
  const seen = new Set();
  const valid = normalized.filter((item) => {
    if (item.errors.length || seen.has(item.row.origin_key)) return false;
    seen.add(item.row.origin_key);
    return true;
  });

  let inserted = [];
  if (valid.length && body?.simular !== true) {
    inserted = await sb(config, 'financial_entries?on_conflict=origin_key', {
      method: 'POST',
      body: valid.map((item) => item.row),
      prefer: 'resolution=ignore-duplicates,return=representation',
    }) || [];
  }
  return {
    ok: true,
    simulacao: body?.simular === true,
    validos: valid.length,
    inseridos: inserted.length,
    ja_existiam: body?.simular === true ? 0 : valid.length - inserted.length,
    para_revisar: valid.filter((item) => item.row.revisar).length,
    invalidos: invalid.map((item) => ({ index: item.index, origin_key: item.row.origin_key, erros: item.errors })),
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function handleStatus(config) {
  const count = async (path) => (await sb(config, `${path}${path.includes('?') ? '&' : '?'}select=id&limit=1`, { count: true })).total;
  const [novos, emSequencia, querConversar, notificacoes] = await Promise.all([
    count('prospects?status=eq.novo'),
    count('prospects?status=eq.em_sequencia'),
    count('prospects?status=eq.quer_conversar'),
    count('admin_notifications?lida_em=is.null'),
  ]);
  return {
    ok: true,
    agora: new Date().toISOString(),
    prospects: { novos, em_sequencia: emSequencia, quer_conversar: querConversar },
    notificacoes_nao_lidas: notificacoes,
  };
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function route(context, config, segments) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const [resource, sub] = segments;
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(request) : {};
  const requireId = (value) => {
    if (!UUID_RE.test(String(value || ''))) throw new HttpError(400, 'id_invalido');
    return value;
  };

  if (resource === 'status' && method === 'GET') return handleStatus(config);

  if (resource === 'prospects') {
    if (!sub && method === 'POST') return handleProspectsCreate(config, body);
    if (!sub && method === 'GET') return handleProspectsList(config, url);
    if (sub === 'check' && method === 'POST') return handleProspectsCheck(config, body);
    if (sub && method === 'GET') return handleProspectGet(config, requireId(sub));
    if (sub && method === 'PATCH') return handleProspectPatch(config, requireId(sub), body);
  }

  if (resource === 'mensagens') {
    if (!sub && method === 'POST') return handleMessagesCreate(config, body);
    if (sub === 'fila' && method === 'GET') return handleMessagesQueue(config, env, url);
    if (sub && method === 'PATCH') return handleMessagePatch(config, requireId(sub), body);
  }

  if (resource === 'execucoes') {
    if (!sub && method === 'POST') return handleRunCreate(config, body);
    if (sub && method === 'PATCH') return handleRunPatch(config, requireId(sub), body);
  }

  if (resource === 'notificacoes' && !sub && method === 'POST') {
    return { ok: true, notificacao: await createNotification(config, body) };
  }

  if (resource === 'bloqueios' && !sub && method === 'POST') return handleSuppressionAdd(config, body);

  if (resource === 'financeiro' && sub === 'lancamentos' && method === 'POST') return handleFinancialImport(config, body);

  throw new HttpError(404, 'rota_nao_encontrada');
}

export async function onRequest(context) {
  const { request, env, params } = context;

  const expected = firstEnvValue(env, ['AUTOMATION_TOKEN', 'HAGAV_AUTOMATION_TOKEN']);
  if (!expected || expected.length < 32) {
    return json({ ok: false, error: 'automacao_nao_configurada' }, 503);
  }

  const provided = readProvidedToken(request);
  if (!(await tokensMatch(provided, expected))) {
    const rate = applyRateLimit({
      namespace: 'automacao-auth-fail',
      key: getClientIp(request) || 'unknown',
      limit: 10,
      windowMs: 15 * 60 * 1000,
      blockMs: 60 * 60 * 1000,
    });
    if (!rate.ok) return rateLimitResponse({ ok: false, error: 'rate_limited' }, rate);
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const rate = applyRateLimit({ namespace: 'automacao', key: 'token', limit: 600, windowMs: 10 * 60 * 1000 });
  if (!rate.ok) return rateLimitResponse({ ok: false, error: 'rate_limited' }, rate);

  const config = getSupabaseConfig(env);
  if (!config.url || !config.serviceRoleKey) return json({ ok: false, error: 'supabase_not_configured' }, 503);

  const segments = (Array.isArray(params?.path) ? params.path : [params?.path]).filter(Boolean).map(String);

  try {
    const result = await route(context, config, segments);
    if (request.method !== 'GET' && typeof context.waitUntil === 'function') {
      context.waitUntil(logAdminRequestEvent(env, request, {
        action: `automacao.${segments.join('.') || 'root'}`.replace(/\.[0-9a-f-]{36}/gi, '.:id'),
        status: 'ok',
        origin: 'automacao',
        actorEmail: 'automacao@hagav',
        actorRole: 'automacao',
        resourceType: segments[0] || null,
      }).catch(() => null));
    }
    return json(result);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : 'erro_interno';
    return json({ ok: false, error: code, details: error?.details || undefined }, status);
  }
}

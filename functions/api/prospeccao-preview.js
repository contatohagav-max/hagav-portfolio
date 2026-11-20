// Previa de um site para avaliar prospects sem sair do painel.
// GET /api/prospeccao-preview?url=https://exemplo.com.br
// Devolve titulo, descricao, imagem e se o site aceita ser mostrado dentro do painel (iframe).
// Acesso: sessao do painel com perfil admin ou comercial.

import { authenticateRequest, json } from '../_utils/admin-auth.js';
import { applyRateLimit, rateLimitResponse } from '../_utils/rate-limit.js';

const MAX_BYTES = 400_000;
const TIMEOUT_MS = 8000;

// So enderecos publicos http(s): nada de IP, localhost ou nomes internos.
function urlSegura(valor) {
  let url;
  try {
    const texto = String(valor || '').trim();
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost') return null;
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  return url;
}

function decodificar(texto) {
  return String(texto || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function meta(html, nomes) {
  for (const nome of nomes) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${nome}["']`, 'i');
    const achado = html.match(re1) || html.match(re2);
    if (achado && achado[1]) return decodificar(achado[1]);
  }
  return '';
}

function podeEmbutir(headers) {
  const xfo = String(headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;
  const csp = String(headers.get('content-security-policy') || '').toLowerCase();
  const ancestors = csp.match(/frame-ancestors([^;]*)/);
  if (ancestors) {
    const valor = ancestors[1].trim();
    if (!valor.includes('*') && !valor.includes('hagav.com.br')) return false;
  }
  return true;
}

async function lerAteLimite(resposta) {
  const leitor = resposta.body?.getReader();
  if (!leitor) return '';
  const partes = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    total += value.byteLength;
  }
  try { await leitor.cancel(); } catch { /* ja terminou */ }
  const junto = new Uint8Array(Math.min(total, MAX_BYTES));
  let pos = 0;
  for (const parte of partes) {
    const pedaco = parte.subarray(0, Math.min(parte.byteLength, junto.length - pos));
    junto.set(pedaco, pos);
    pos += pedaco.byteLength;
    if (pos >= junto.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(junto);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['admin', 'comercial'],
    allowBearer: true,
    allowCookie: true,
  });
  if (!auth.ok) return json({ ok: false, error: auth.reason || 'unauthorized' }, auth.status || 401);

  const rate = applyRateLimit({
    namespace: 'prospeccao-preview',
    key: auth.actor.id || auth.actor.email || 'anon',
    limit: 80,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.ok) return rateLimitResponse({ ok: false, error: 'rate_limited' }, rate);

  const alvo = urlSegura(new URL(request.url).searchParams.get('url'));
  if (!alvo) return json({ ok: false, error: 'url_invalida' }, 400);

  let resposta;
  try {
    resposta = await fetch(alvo.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; HAGAV-Preview/1.0; +https://hagav.com.br)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-BR,pt;q=0.9',
      },
    });
  } catch {
    return json({ ok: false, error: 'site_nao_respondeu' }, 502);
  }

  const final = urlSegura(resposta.url) || alvo;
  const tipo = String(resposta.headers.get('content-type') || '');
  const html = tipo.includes('html') ? await lerAteLimite(resposta) : '';
  const titulo = meta(html, ['og:title', 'twitter:title']) || decodificar(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
  const descricao = meta(html, ['og:description', 'twitter:description', 'description']);
  let imagem = meta(html, ['og:image', 'og:image:url', 'twitter:image']);
  if (imagem) {
    try { imagem = new URL(imagem, final).toString(); } catch { imagem = ''; }
    if (!/^https:\/\//i.test(imagem)) imagem = '';
  }

  return json({
    ok: true,
    status: resposta.status,
    url: final.toString(),
    dominio: final.hostname.replace(/^www\./, ''),
    titulo: titulo.slice(0, 200),
    descricao: descricao.slice(0, 400),
    imagem,
    site: meta(html, ['og:site_name']).slice(0, 120),
    embutivel: resposta.ok && podeEmbutir(resposta.headers),
  });
}

// Exportado so para teste local (o Cloudflare usa apenas onRequestGet)
export const _teste = { urlSegura, meta, podeEmbutir };

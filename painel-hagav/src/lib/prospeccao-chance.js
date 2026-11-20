// Chance de um prospect virar cliente da HAGAV (estimativa, sem acesso a banco: funcoes puras).
// Duas metades de 0 a 50 que somam a chance (0 a 100):
//   momento = o quanto a pessoa precisa de video AGORA (procura editor, anuncios ativos, lancamento chegando)
//   perfil  = o quanto ela e um bom cliente para a HAGAV (tamanho, tipo de negocio, ticket, canal de contato)
// Os sinais vem do campo `sinais` (padrao no PLAYBOOK) e de campos do prospect; textos livres tambem sao lidos.

function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = semAcento(valor);
  if (!texto) return null;
  const m = texto.match(/(\d+(?:[.,]\d+)*)\s*(mil|k|mi|milhao|milhoes|m)?\b/);
  if (!m) return null;
  let n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (m[2] === 'mil' || m[2] === 'k') n *= 1000;
  if (['mi', 'milhao', 'milhoes', 'm'].includes(m[2])) n *= 1000000;
  return n;
}

// Maior valor em reais citado num texto ("R$ 350 a R$ 1.800" -> 1800).
function maiorPreco(texto) {
  const valores = [...String(texto || '').matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/g)]
    .map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(Number.isFinite);
  return valores.length ? Math.max(...valores) : null;
}

function verdadeiro(valor) {
  if (valor === true) return true;
  const t = semAcento(valor);
  return Boolean(t) && !['false', 'nao', 'no', '0', 'sem'].includes(t);
}

export const CHANCE_FAIXAS = {
  alta: { label: 'Alta', min: 65 },
  media: { label: 'Média', min: 45 },
  baixa: { label: 'Baixa', min: 0 },
};

export const QUADRANTES = {
  atacar: { label: 'Atacar agora', dica: 'Precisa de vídeo agora e é bom cliente' },
  nutrir: { label: 'Nutrir', dica: 'Bom cliente, mas sem urgência: acompanhar o próximo lançamento' },
  rapido: { label: 'Venda rápida, cliente menor', dica: 'Precisa agora, mas o contrato tende a ser pequeno' },
  deixar: { label: 'Deixar de lado', dica: 'Sem urgência e perfil fraco' },
};

/**
 * @returns {{ chance, momento, perfil, faixa, quadrante, fatores: Array<{label, pontos, lado}> }}
 */
export function calcularChance(prospect = {}) {
  const sinais = prospect.sinais && typeof prospect.sinais === 'object' ? prospect.sinais : {};
  const textoLivre = semAcento([
    prospect.resumo, prospect.score_motivos, prospect.perfil, prospect.nicho, prospect.empresa, prospect.fonte, prospect.fonte_url,
    ...Object.entries(sinais).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`),
  ].filter(Boolean).join(' | '));
  const fatores = [];
  const add = (lado, pontos, label) => { if (pontos) fatores.push({ lado, pontos, label }); };

  // ---------- Momento (0-50) ----------
  const procuraEditor = verdadeiro(sinais.vaga_editor) || verdadeiro(sinais.procurando_editor)
    || /workana|99freelas|vaga|procura(ndo)? editor|contrata(ndo)? editor/.test(semAcento(`${prospect.fonte} ${prospect.fonte_url}`));
  if (procuraEditor) add('momento', 22, 'Está procurando editor agora');

  const anuncios = numero(sinais.anuncios_ativos ?? sinais.anuncios ?? sinais.ads_ativos);
  if (anuncios !== null && anuncios > 0) {
    const pts = anuncios >= 10 ? 16 : anuncios >= 5 ? 13 : anuncios >= 2 ? 9 : 5;
    add('momento', pts, `${anuncios} anúncio${anuncios > 1 ? 's' : ''} em vídeo ativo${anuncios > 1 ? 's' : ''}`);
  }

  const momentoPts = { pre_lancamento: 14, captacao: 12, perpetuo: 7, carrinho_aberto: 5 }[prospect.momento] || 0;
  const momentoLabel = { pre_lancamento: 'Lançamento chegando', captacao: 'Captando agora', perpetuo: 'Vendendo no perpétuo', carrinho_aberto: 'Carrinho aberto' }[prospect.momento];
  add('momento', momentoPts, momentoLabel);

  const postsSemana = numero(sinais.posts_semana ?? sinais.videos_semana);
  if (postsSemana !== null && postsSemana >= 3) add('momento', 5, `${postsSemana} vídeos por semana`);

  const edicao = semAcento(sinais.edicao);
  if (/fraca|inconsistente|ruim|amadora/.test(edicao)) add('momento', 5, 'Edição atual fraca');

  const perfilTexto = semAcento(`${prospect.perfil} ${prospect.empresa} ${sinais.tipo || ''}`);
  const ehAgencia = /agencia|coprodu|lancador|estrategista|assessoria/.test(perfilTexto) || verdadeiro(sinais.coprodutor);
  const clientesAtivos = numero(sinais.clientes_ativos ?? sinais.experts_atendidos);
  if (ehAgencia) {
    // Agencia de lancamento lanca para clientes o ano todo: a demanda de video e continua
    if (clientesAtivos !== null && clientesAtivos >= 3) add('momento', 14, `Atende ${clientesAtivos} experts agora`);
    else add('momento', 10, 'Lança para clientes o ano todo');
  }

  // ---------- Perfil (0-50) ----------
  const seguidores = numero(prospect.seguidores ?? sinais.seguidores);
  if (seguidores !== null) {
    let pts = 0;
    let label = '';
    if (seguidores >= 20000 && seguidores <= 300000) { pts = 15; label = 'Tamanho ideal (20 mil a 300 mil)'; }
    else if (seguidores > 300000 && seguidores <= 700000) { pts = 10; label = 'Audiência grande'; }
    else if (seguidores >= 5000 && seguidores < 20000) { pts = 6; label = 'Audiência pequena'; }
    else if (seguidores > 700000 && seguidores <= 1500000) { pts = 5; label = 'Muito grande: pode ter time interno'; }
    else if (seguidores > 1500000) { pts = 1; label = 'Enorme: costuma ter time interno'; }
    add('perfil', pts, label);
  }

  // Agencia: um contrato vira video de varios experts (o tamanho do perfil dela pesa menos)
  if (ehAgencia) add('perfil', 20, 'Agência ou coprodutor: um contrato, vários experts');
  else if (/expert|infoprodutor|mentor|curso|escola|empresa/.test(perfilTexto)) add('perfil', 9, 'Expert com produto à venda');
  else if (/criador|influenc/.test(perfilTexto)) add('perfil', 4, 'Criador de conteúdo');

  const ticket = numero(sinais.ticket_max) ?? maiorPreco(`${sinais.produto || ''} ${sinais.ticket || ''} ${prospect.resumo || ''} ${prospect.score_motivos || ''}`);
  if ((ticket !== null && ticket >= 997) || /mentoria|high ticket/.test(textoLivre)) add('perfil', 8, 'Ticket alto');
  else if (ticket !== null && ticket >= 297) add('perfil', 4, 'Ticket médio');

  if (prospect.email) add('perfil', 8, 'Email comercial público');
  else if (prospect.instagram) add('perfil', 2, 'Só Instagram (DM manual)');

  if (verdadeiro(sinais.tem_time_video) || verdadeiro(sinais.tem_editor) || /ja tem (editor|agencia|time)/.test(textoLivre)) {
    add('perfil', -15, 'Já tem time de vídeo');
  }

  const somaLado = (lado) => fatores.filter((f) => f.lado === lado).reduce((a, f) => a + f.pontos, 0);
  const momento = Math.max(0, Math.min(50, somaLado('momento')));
  const perfilPts = Math.max(0, Math.min(50, somaLado('perfil')));
  const chance = momento + perfilPts;
  const faixa = chance >= CHANCE_FAIXAS.alta.min ? 'alta' : chance >= CHANCE_FAIXAS.media.min ? 'media' : 'baixa';
  const quadrante = momento >= 25 ? (perfilPts >= 25 ? 'atacar' : 'rapido') : (perfilPts >= 25 ? 'nutrir' : 'deixar');

  return { chance, momento, perfil: perfilPts, faixa, quadrante, fatores, seguidores };
}

export function ordenarPorChance(prospects = []) {
  return [...prospects]
    .map((p) => ({ p, c: calcularChance(p).chance }))
    .sort((a, b) => b.c - a.c)
    .map((x) => x.p);
}

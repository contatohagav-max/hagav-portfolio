// Encanamento da prospeccao: por onde os prospects entram, ate onde chegam, onde estao parados e onde saem.
// Funcoes puras (sem banco).

import { calcularChance } from '@/lib/prospeccao-chance';

export const FONTES_FUNIL = [
  { key: 'meta_ads', label: 'Anúncios da Meta', color: '#d95926', match: /meta|facebook|ads_library|anuncio/ },
  { key: 'vagas', label: 'Vagas de editor', color: '#199e70', match: /workana|99freela|vaga|linkedin|freela/ },
  { key: 'instagram', label: 'Instagram', color: '#c98500', match: /instagram/ },
  { key: 'marketplaces', label: 'Hotmart, Kiwify, Eduzz', color: '#d55181', match: /hotmart|kiwify|eduzz|monetizze|marketplace/ },
  { key: 'agencias', label: 'Agências e coprodutores', color: '#0ca30c', match: /agencia|coprodu/ },
  { key: 'google', label: 'Google e sites', color: '#9085e9', match: /google|site|web|busca/ },
  { key: 'outros', label: 'Outras fontes', color: '#77756f', match: null },
];

export const ETAPAS_FUNIL = [
  { key: 'encontrados', label: 'Encontrados' },
  { key: 'aprovados', label: 'Aprovados' },
  { key: 'abordados', label: 'Abordados' },
  { key: 'responderam', label: 'Responderam' },
  { key: 'conversa', label: 'Querem conversar' },
  { key: 'lead', label: 'Viraram lead' },
];

// Quem esta parado entre a etapa i e a i+1 (e qual aba da lista mostra essas pessoas).
export const ESPERAS_FUNIL = [
  { label: 'Aguardam aprovação', aba: 'aprovar' },
  { label: 'Na fila de envio', aba: 'fila' },
  { label: 'Aguardam resposta', aba: 'em_sequencia' },
  { label: 'Com dúvida', aba: 'respondeu' },
  { label: 'Em conversa', aba: 'quer_conversar' },
];

// Quem saiu do cano na etapa i.
export const RALOS_FUNIL = ['Reprovados', 'Cancelados', 'Sem resposta', 'Não quiseram ou depois', 'Não fecharam', null];

function grupoFonte(prospect) {
  const texto = `${prospect.fonte || ''} ${prospect.fonte_url || ''} ${prospect.perfil || ''}`.toLowerCase();
  const grupo = FONTES_FUNIL.find((f) => f.match && f.match.test(texto));
  return grupo ? grupo.key : 'outros';
}

// Ate qual etapa o prospect chegou e se esta esperando (no cano) ou saiu (ralo).
export function posicaoNoFunil(prospect, temRascunho = false) {
  const contatado = Boolean(prospect.ultimo_contato_em);
  const respondeu = Boolean(prospect.respondeu_em);
  switch (prospect.status) {
    case 'convertido': return { alcancou: 5, estado: 'fim' };
    case 'quer_conversar':
    case 'em_conversa': return { alcancou: 4, estado: 'espera' };
    case 'respondeu': return { alcancou: 3, estado: 'espera' };
    case 'em_sequencia': return { alcancou: 2, estado: 'espera' };
    case 'sem_resposta': return { alcancou: 2, estado: 'ralo' };
    case 'nao_agora':
    case 'sem_interesse':
    case 'descadastrado':
    case 'descartado':
      if (respondeu) return { alcancou: 3, estado: 'ralo' };
      if (contatado) return { alcancou: 2, estado: 'ralo' };
      return { alcancou: 0, estado: 'ralo' };
    case 'novo':
    default:
      return temRascunho ? { alcancou: 0, estado: 'espera' } : { alcancou: 1, estado: 'espera' };
  }
}

export function montarFunil(prospects = [], idsComRascunho = new Set()) {
  const n = ETAPAS_FUNIL.length;
  const alcance = Array(n).fill(0);
  const espera = Array(n - 1).fill(0);
  const ralo = Array(n).fill(0);
  const porFonte = new Map(FONTES_FUNIL.map((f) => [f.key, 0]));
  const porFaixa = { alta: { total: 0, abordados: 0, responderam: 0, conversa: 0 }, media: { total: 0, abordados: 0, responderam: 0, conversa: 0 }, baixa: { total: 0, abordados: 0, responderam: 0, conversa: 0 } };

  prospects.forEach((p) => {
    const pos = posicaoNoFunil(p, idsComRascunho.has(p.id));
    for (let i = 0; i <= pos.alcancou; i += 1) alcance[i] += 1;
    if (pos.estado === 'espera' && pos.alcancou < n - 1) espera[pos.alcancou] += 1;
    if (pos.estado === 'ralo') ralo[pos.alcancou] += 1;
    porFonte.set(grupoFonte(p), (porFonte.get(grupoFonte(p)) || 0) + 1);

    const faixa = porFaixa[calcularChance(p).faixa];
    faixa.total += 1;
    if (pos.alcancou >= 2) faixa.abordados += 1;
    if (pos.alcancou >= 3) faixa.responderam += 1;
    if (pos.alcancou >= 4) faixa.conversa += 1;
  });

  const fontes = FONTES_FUNIL.map((f) => ({ ...f, valor: porFonte.get(f.key) || 0 }));
  const conversao = alcance.slice(1).map((v, i) => (alcance[i] > 0 ? v / alcance[i] : null));
  return { total: prospects.length, alcance, espera, ralo, fontes, conversao, porFaixa };
}

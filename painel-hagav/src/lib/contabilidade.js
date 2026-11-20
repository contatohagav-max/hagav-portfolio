// Contabilidade HAGAV: calculos da aba de visao financeira (sem acesso a banco, so funcoes puras).
// Entrada: lancamentos do Financeiro, metas/reservas, demandas de producao e configuracoes.

const META_REGEX = /\[HAGAV_FINANCEIRO_META\][\s\S]*?\[\/HAGAV_FINANCEIRO_META\]/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Cores: paleta categorica validada (modo escuro, superficie #1C1C1C). Entradas usam o slot 1 (azul);
// os grupos de saida usam os slots 2-8 na ordem validada, e "Outros" fica em cinza neutro.
export const COR_ENTRADA = '#3987e5';
export const COR_SOBRA = '#e7e5df';
export const COR_OUTROS = '#77756f';

export const GRUPOS_SAIDA = [
  { key: 'equipe', label: 'Equipe e freelancers', color: '#d95926', match: /freela|prestador|terceir|editor|equipe|jalber|pablo/ },
  { key: 'escritorio', label: 'Escritório e contas', color: '#199e70', match: /aluguel|moradia|escritorio|agua|energia|\bluz\b|internet|\bconta\b|coelba|embasa|sigaon|neoenergia/ },
  { key: 'ferramentas', label: 'Ferramentas e software', color: '#c98500', match: /software|adobe|chatgpt|google|ferramenta|assinatura|capcut|canva|pagar\.me|ebanx/ },
  { key: 'impostos', label: 'Impostos e MEI', color: '#d55181', match: /\bmei\b|\bdas\b|imposto|tribut|inss|receita federal/ },
  { key: 'marketing', label: 'Marketing e anúncios', color: '#0ca30c', match: /marketing|anuncio|\bads\b|trafego|viral media/ },
  { key: 'dia_a_dia', label: 'Dia a dia (transporte e comida)', color: '#9085e9', match: /transporte|uber|\b99\b|alimenta|ifood|food|mercado|racao|entretenimento|compra|\bpet\b|saude|cinema/ },
  { key: 'socios', label: 'Retirada dos sócios', color: '#e66767', match: /retirada|\bsoci|pro.?labore|transferencia interna|reserva financeira|hilla/ },
  { key: 'outros', label: 'Outros', color: COR_OUTROS, match: null },
];

// Clientes que aparecem com nomes diferentes no banco e no painel.
const CLIENTE_APELIDOS = [
  [/pontalti|kersting/, 'Pontalti / Kersting'],
  [/voila/, 'Escola Voilà'],
  [/daiane/, 'Daiane Viana'],
];

export const STATUS_SAUDE = {
  bom: { label: 'Saudável', color: '#0ca30c' },
  atencao: { label: 'Atenção', color: '#fab219' },
  critico: { label: 'Crítico', color: '#d03b3b' },
  sem_dados: { label: 'Sem dados', color: '#77756f' },
};

export function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function lerNatureza(observacoes) {
  const bloco = String(observacoes || '').match(META_REGEX)?.[0] || '';
  return /natureza=Pessoal/.test(bloco) ? 'Pessoal' : 'Empresa';
}

function ehRecorrente(observacoes) {
  const bloco = String(observacoes || '').match(META_REGEX)?.[0] || '';
  return /recorrente_mensal=true/.test(bloco);
}

export function dataValida(valor) {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const ano = Number(texto.slice(0, 4));
  if (ano < 2000 || ano > 2100) return null;
  const data = new Date(`${texto}T12:00:00`);
  return Number.isFinite(data.getTime()) ? data : null;
}

export function chaveMes(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rotuloMes(chave) {
  const [ano, mes] = chave.split('-').map(Number);
  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`;
}

function valorDe(entry) {
  const v = Number(entry?.valor || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

// Quanto efetivamente entrou/saiu (pagos usam valor_pago quando houver; parciais usam o pago).
export function valorRealizado(entry) {
  const status = String(entry?.status || '').toLowerCase();
  const pago = Number(entry?.valor_pago || 0);
  if (status === 'pago') return pago > 0 ? Math.min(pago, valorDe(entry) || pago) : valorDe(entry);
  if (status === 'parcial') return Math.max(0, Math.min(pago, valorDe(entry)));
  return 0;
}

function valorEmAberto(entry) {
  return Math.max(0, valorDe(entry) - valorRealizado(entry));
}

function cancelado(entry) {
  return String(entry?.status || '').toLowerCase() === 'cancelado';
}

function aberto(entry) {
  return ['pendente', 'parcial', 'atrasado'].includes(String(entry?.status || '').toLowerCase());
}

export function classificarSaida(entry) {
  const texto = semAcento(`${entry?.categoria || ''} | ${entry?.descricao || ''} | ${entry?.cliente_fornecedor || ''}`);
  const grupo = GRUPOS_SAIDA.find((g) => g.match && g.match.test(texto));
  return grupo ? grupo.key : 'outros';
}

export const NOME_SOCIOS = 'Sócios (aportes e ajustes)';

export function nomeCliente(entry) {
  if (/soci/.test(semAcento(entry?.categoria))) return NOME_SOCIOS;
  let nome = String(entry?.cliente_fornecedor || '').trim();
  if (!nome) {
    nome = String(entry?.descricao || '')
      .replace(/^pix recebido de\s+/i, '')
      .replace(/^projeto aprovado\s*-\s*/i, '')
      .replace(/^projeto\s+/i, '')
      .trim();
  }
  const chave = semAcento(nome);
  const apelido = CLIENTE_APELIDOS.find(([re]) => re.test(chave));
  if (apelido) return apelido[1];
  return nome || 'Sem nome';
}

export function intervaloPeriodo(periodo, agora = new Date()) {
  const meses = { mes: 1, '3m': 3, '6m': 6, '12m': 12 }[periodo] || 1;
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - (meses - 1), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const rotulos = { mes: 'Este mês', '3m': 'Últimos 3 meses', '6m': 'Últimos 6 meses', '12m': 'Últimos 12 meses' };
  return { inicio, fim, meses, rotulo: rotulos[periodo] || rotulos.mes };
}

function noPeriodo(data, intervalo) {
  return Boolean(data) && data >= intervalo.inicio && data < intervalo.fim;
}

function somar(lista, fn) {
  return lista.reduce((acc, item) => acc + fn(item), 0);
}

function agruparTop(itens, limite) {
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor);
  if (ordenados.length <= limite) return ordenados;
  const top = ordenados.slice(0, limite - 1);
  const resto = ordenados.slice(limite - 1);
  top.push({ nome: `Outros (${resto.length})`, valor: somar(resto, (i) => i.valor), agrupado: true });
  return top;
}

function statusPorFaixa(valor, { bom, atencao, maiorMelhor = true }) {
  if (!Number.isFinite(valor)) return 'sem_dados';
  if (maiorMelhor) {
    if (valor >= bom) return 'bom';
    if (valor >= atencao) return 'atencao';
    return 'critico';
  }
  if (valor <= bom) return 'bom';
  if (valor <= atencao) return 'atencao';
  return 'critico';
}

export function formatarBRL(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

export function formatarCompacto(valor) {
  const n = Number(valor || 0);
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return formatarBRL(n);
}

// ---------------- Limite anual do MEI ----------------
// Soma o que entrou na empresa no ano (pelo dia em que o dinheiro caiu) e projeta ate dezembro.
// Meses fechados sem nenhum lancamento entram na projecao pela media dos meses que tem dados.
export const LIMITE_MEI_PADRAO = 81000;
export const TOLERANCIA_MEI = 0.2;

export function calcularLimiteMei(entries = [], config = {}, agora = new Date()) {
  const ano = agora.getFullYear();
  const mesAtual = agora.getMonth();
  const limite = Number(config.limite_mei_anual) > 0 ? Number(config.limite_mei_anual) : LIMITE_MEI_PADRAO;
  const tolerancia = limite * (1 + TOLERANCIA_MEI);
  const porMes = Array(12).fill(0);
  const aReceberPorMes = Array(12).fill(0);

  entries.forEach((e) => {
    if (cancelado(e) || e.tipo !== 'receber' || nomeCliente(e) === NOME_SOCIOS || lerNatureza(e.observacoes) === 'Pessoal') return;
    const realizado = valorRealizado(e);
    if (realizado > 0) {
      const data = dataValida(e.pago_em) || dataValida(e.vencimento);
      if (data && data.getFullYear() === ano) porMes[data.getMonth()] += realizado;
    }
    const emAberto = aberto(e) ? valorEmAberto(e) : 0;
    const venc = dataValida(e.vencimento);
    if (emAberto > 0 && venc && venc.getFullYear() === ano && venc.getMonth() > mesAtual) aReceberPorMes[venc.getMonth()] += emAberto;
  });

  const fechados = porMes.slice(0, mesAtual);
  const comDado = fechados.filter((v) => v > 0);
  const media = comDado.length ? comDado.reduce((a, v) => a + v, 0) / comDado.length : porMes[mesAtual];
  const mesesSemDado = fechados.map((v, i) => (v > 0 ? null : i)).filter((i) => i !== null);
  const registrado = porMes.reduce((a, v) => a + v, 0);

  const meses = porMes.map((valor, i) => {
    let tipo = 'registrado';
    let estimado = 0;
    if (i < mesAtual && valor <= 0) { tipo = 'sem_dado'; estimado = media; }
    if (i === mesAtual) { tipo = 'atual'; estimado = Math.max(0, media - valor); }
    if (i > mesAtual) { tipo = 'futuro'; estimado = Math.max(media, aReceberPorMes[i]); }
    return { mes: i, rotulo: MESES_CURTOS[i], valor, estimado, tipo };
  });
  const projecao = registrado + meses.reduce((a, m) => a + m.estimado, 0);

  let status = 'bom';
  if (registrado > limite || projecao > tolerancia) status = 'critico';
  else if (projecao > limite * 0.85) status = 'atencao';
  if (registrado <= 0 && projecao <= 0) status = 'sem_dados';

  let resumo;
  if (registrado > tolerancia) resumo = `Já passou de ${formatarCompacto(tolerancia)} (limite + 20%). Pelas regras do MEI, isso tira a empresa do MEI desde 1º de janeiro. Fale com o contador agora.`;
  else if (registrado > limite) resumo = `Já passou do limite de ${formatarCompacto(limite)}, mas ainda dentro dos 20% de tolerância. A empresa paga a diferença e sai do MEI no ano que vem. Fale com o contador.`;
  else if (projecao > tolerancia) resumo = `No ritmo atual, o ano fecha perto de ${formatarCompacto(projecao)}, acima de ${formatarCompacto(tolerancia)} (limite + 20%). Fale com o contador ainda este mês.`;
  else if (projecao > limite) resumo = `No ritmo atual, o ano fecha perto de ${formatarCompacto(projecao)}: acima do limite, mas dentro dos 20% de tolerância. Planeje com o contador a saída do MEI.`;
  else if (status === 'atencao') resumo = `No ritmo atual, o ano fecha perto de ${formatarCompacto(projecao)}, perto do limite de ${formatarCompacto(limite)}.`;
  else if (status === 'sem_dados') resumo = 'Ainda não há entradas deste ano no painel.';
  else resumo = `No ritmo atual, o ano fecha perto de ${formatarCompacto(projecao)}, dentro do limite de ${formatarCompacto(limite)}.`;

  return {
    ano,
    limite,
    tolerancia,
    registrado,
    projecao,
    media,
    meses,
    mesesSemDado: mesesSemDado.map((i) => MESES_CURTOS[i]),
    status,
    resumo,
    usoPct: limite > 0 ? registrado / limite : 0,
  };
}

/**
 * Monta tudo que a aba Contabilidade mostra.
 * @param {object} p
 * @param {Array} p.entries lancamentos (financial_entries)
 * @param {Array} p.goals metas (goals)
 * @param {Array} p.contributions depositos nas metas (goal_contributions)
 * @param {Array} p.jobs demandas de producao (production_jobs)
 * @param {object} p.config { meta_mensal, degrau, ticket_medio, valor_hora_minimo }
 * @param {string} p.periodo 'mes' | '3m' | '6m' | '12m'
 * @param {Date} p.agora
 */
export function montarContabilidade({ entries = [], goals = [], contributions = [], jobs = [], config = {}, periodo = 'mes', agora = new Date() }) {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const intervalo = intervaloPeriodo(periodo, agora);
  const validos = entries.filter((e) => !cancelado(e));
  // Pago conta no dia em que o dinheiro entrou/saiu (bate com o extrato); em aberto, no vencimento.
  const comData = validos.map((e) => ({
    e,
    data: (String(e.status || '').toLowerCase() === 'pago' && dataValida(e.pago_em)) || dataValida(e.vencimento),
  }));
  const semData = comData.filter((x) => !x.data).map((x) => x.e);

  // ---------------- Realizado no periodo ----------------
  const doPeriodo = comData.filter((x) => noPeriodo(x.data, intervalo));
  const entradasLanc = doPeriodo.filter((x) => x.e.tipo === 'receber' && valorRealizado(x.e) > 0).map((x) => x.e);
  const saidasLanc = doPeriodo.filter((x) => x.e.tipo === 'pagar' && valorRealizado(x.e) > 0).map((x) => x.e);

  const totalEntradas = somar(entradasLanc, valorRealizado);
  const totalSaidas = somar(saidasLanc, valorRealizado);
  const sobra = totalEntradas - totalSaidas;

  const porClienteMapa = new Map();
  entradasLanc.forEach((e) => {
    const nome = nomeCliente(e);
    porClienteMapa.set(nome, (porClienteMapa.get(nome) || 0) + valorRealizado(e));
  });
  const porClienteCompleto = [...porClienteMapa.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  const porCliente = agruparTop(porClienteCompleto, 6);

  const porGrupo = GRUPOS_SAIDA.map((g) => {
    const itensLanc = saidasLanc.filter((e) => classificarSaida(e) === g.key);
    const itensMapa = new Map();
    itensLanc.forEach((e) => {
      const nome = String(e.cliente_fornecedor || e.descricao || 'Sem nome').trim();
      itensMapa.set(nome, (itensMapa.get(nome) || 0) + valorRealizado(e));
    });
    const itens = [...itensMapa.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
    return { key: g.key, label: g.label, color: g.color, valor: somar(itensLanc, valorRealizado), itens, quantidade: itensLanc.length };
  }).filter((g) => g.valor > 0);

  // ---------------- Em aberto ----------------
  const abertos = comData.filter((x) => aberto(x.e));
  const aReceber = somar(abertos.filter((x) => x.e.tipo === 'receber' && noPeriodo(x.data, intervalo)), (x) => valorEmAberto(x.e));
  const aPagar = somar(abertos.filter((x) => x.e.tipo === 'pagar' && noPeriodo(x.data, intervalo)), (x) => valorEmAberto(x.e));

  // ---------------- Serie mensal (ultimos 6 meses) ----------------
  const mensal = [];
  for (let i = 5; i >= 0; i -= 1) {
    const ref = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const chave = chaveMes(ref);
    const doMes = comData.filter((x) => x.data && chaveMes(x.data) === chave);
    const ent = somar(doMes.filter((x) => x.e.tipo === 'receber'), (x) => valorRealizado(x.e));
    const sai = somar(doMes.filter((x) => x.e.tipo === 'pagar'), (x) => valorRealizado(x.e));
    mensal.push({ chave, rotulo: rotuloMes(chave), entradas: ent, saidas: sai, sobra: ent - sai, atual: i === 0 });
  }
  const mesesFechados = mensal.filter((m) => !m.atual);
  const ultimos3 = mesesFechados.slice(-3);
  const receitaMediaMensal = ultimos3.length ? somar(ultimos3, (m) => m.entradas) / ultimos3.length : 0;
  const custoMedioMensal = ultimos3.length ? somar(ultimos3, (m) => m.saidas) / ultimos3.length : 0;

  // Custo fixo: escritorio + ferramentas + impostos dos ultimos 3 meses fechados
  const inicio3 = ultimos3.length ? new Date(`${ultimos3[0].chave}-01T00:00:00`) : null;
  const fim3 = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fixos = inicio3 ? comData.filter((x) => x.e.tipo === 'pagar' && x.data && x.data >= inicio3 && x.data < fim3
    && ['escritorio', 'ferramentas', 'impostos'].includes(classificarSaida(x.e))) : [];
  const custoFixoMensal = ultimos3.length ? somar(fixos, (x) => valorRealizado(x.e) || valorDe(x.e)) / ultimos3.length : 0;
  const retiradasPeriodo = porGrupo.find((g) => g.key === 'socios')?.valor || 0;

  // ---------------- Reservas e metas de crescimento ----------------
  const guardadoPorMeta = new Map();
  contributions.forEach((c) => guardadoPorMeta.set(c.goal_id, (guardadoPorMeta.get(c.goal_id) || 0) + Number(c.amount || 0)));
  const reservas = goals
    .filter((g) => g.status !== 'archived' && ['financial', 'equipment'].includes(g.category))
    .map((g) => {
      const alvo = Number(g.target_value || 0);
      const guardado = guardadoPorMeta.get(g.id) || 0;
      return { id: g.id, titulo: g.title, categoria: g.category, alvo, guardado, pct: alvo > 0 ? Math.min(1, guardado / alvo) : 0, principal: Boolean(g.is_primary) };
    });
  const totalReservado = somar(reservas.filter((r) => r.categoria === 'financial'), (r) => r.guardado);
  const reservaIdeal = custoMedioMensal * 6;
  const mesesFolego = custoMedioMensal > 0 ? totalReservado / custoMedioMensal : null;

  // ---------------- Saude ----------------
  const margem = totalEntradas > 0 ? sobra / totalEntradas : null;
  const maiorCliente = porClienteCompleto.find((c) => c.nome !== NOME_SOCIOS);
  const dependencia = totalEntradas > 0 && maiorCliente ? maiorCliente.valor / totalEntradas : null;
  const pesoFixo = receitaMediaMensal > 0 ? custoFixoMensal / receitaMediaMensal : null;
  const lucroAntesRetiradas = totalEntradas - (totalSaidas - retiradasPeriodo);

  const vencidosPagar = abertos.filter((x) => x.e.tipo === 'pagar' && x.data && x.data < hoje);
  const vencidosReceber = abertos.filter((x) => x.e.tipo === 'receber' && x.data && x.data < hoje);
  const impostosVencidos = vencidosPagar.filter((x) => classificarSaida(x.e) === 'impostos');

  const saude = [
    {
      key: 'sobra',
      titulo: 'Sobra do período',
      valorTexto: margem === null ? '—' : `${Math.round(margem * 100)}%`,
      status: margem === null ? 'sem_dados' : statusPorFaixa(margem, { bom: 0.25, atencao: 0.1 }),
      explicacao: margem === null
        ? 'Ainda não entrou dinheiro neste período.'
        : `De tudo que entrou, ${margem >= 0 ? `sobraram ${Math.round(margem * 100)}%` : `faltaram ${Math.abs(Math.round(margem * 100))}%`} depois de pagar as contas.`,
      dica: 'Saudável: sobrar pelo menos 25% do que entra.',
    },
    {
      key: 'dependencia',
      titulo: 'Dependência do maior cliente',
      valorTexto: dependencia === null ? '—' : `${Math.round(dependencia * 100)}%`,
      status: dependencia === null ? 'sem_dados' : statusPorFaixa(dependencia, { bom: 0.35, atencao: 0.6, maiorMelhor: false }),
      explicacao: dependencia === null ? 'Sem entradas no período.' : `${maiorCliente.nome} trouxe ${Math.round(dependencia * 100)}% do faturamento.`,
      dica: 'Se um cliente passa de 35%, perder ele derruba o mês. Diversificar protege.',
    },
    {
      key: 'fixo',
      titulo: 'Peso do custo fixo',
      valorTexto: pesoFixo === null ? '—' : `${Math.round(pesoFixo * 100)}%`,
      status: pesoFixo === null ? 'sem_dados' : statusPorFaixa(pesoFixo, { bom: 0.4, atencao: 0.6, maiorMelhor: false }),
      explicacao: pesoFixo === null
        ? 'Sem histórico dos últimos 3 meses.'
        : `Escritório, ferramentas e impostos custam ~${formatarCompacto(custoFixoMensal)} por mês, ${Math.round(pesoFixo * 100)}% do que entra em média.`,
      dica: 'Custo fixo é o que vence mesmo sem cliente. Ideal: até 40% da receita média.',
    },
    {
      key: 'folego',
      titulo: 'Fôlego (reserva)',
      valorTexto: mesesFolego === null ? '—' : `${mesesFolego.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`,
      status: mesesFolego === null ? 'sem_dados' : statusPorFaixa(mesesFolego, { bom: 6, atencao: 3 }),
      explicacao: mesesFolego === null
        ? 'Sem custo médio para comparar.'
        : `Com ${formatarCompacto(totalReservado)} guardados, a empresa aguenta ~${mesesFolego.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses sem faturar.`,
      dica: `Meta de reserva: 6 meses de custo (~${formatarCompacto(reservaIdeal)}).`,
    },
    {
      key: 'atrasos',
      titulo: 'Contas em atraso',
      valorTexto: vencidosPagar.length ? formatarCompacto(somar(vencidosPagar, (x) => valorEmAberto(x.e))) : 'Nenhuma',
      status: impostosVencidos.length ? 'critico' : (vencidosPagar.length ? 'atencao' : 'bom'),
      explicacao: vencidosPagar.length
        ? `${vencidosPagar.length} conta(s) vencida(s)${impostosVencidos.length ? `, incluindo ${impostosVencidos.length} de imposto/MEI` : ''}.`
        : 'Nada vencido a pagar.',
      dica: 'Imposto atrasado gera multa e juros todo mês. Prioridade máxima.',
    },
    {
      key: 'retiradas',
      titulo: 'Retiradas x lucro',
      valorTexto: retiradasPeriodo > 0 ? formatarCompacto(retiradasPeriodo) : 'Sem retiradas',
      status: totalEntradas <= 0 ? 'sem_dados' : (retiradasPeriodo <= Math.max(0, lucroAntesRetiradas) ? 'bom' : 'critico'),
      explicacao: totalEntradas <= 0
        ? 'Sem entradas no período.'
        : `Lucro antes das retiradas: ${formatarCompacto(lucroAntesRetiradas)}. ${retiradasPeriodo > lucroAntesRetiradas ? 'Estão retirando mais do que a empresa lucrou.' : 'As retiradas cabem no lucro.'}`,
      dica: 'Retirar mais do que sobra consome o caixa da empresa.',
    },
  ];

  // De cada R$ 100 que entraram
  const base = totalEntradas > 0 ? totalEntradas : 0;
  const cada100 = base > 0 ? [
    ...porGrupo.map((g) => ({ key: g.key, label: g.label, color: g.color, valor: (g.valor / base) * 100 })),
    ...(sobra > 0 ? [{ key: 'sobra', label: 'Sobra', color: COR_SOBRA, valor: (sobra / base) * 100 }] : []),
  ] : [];

  // ---------------- Alarmes ----------------
  const mei = calcularLimiteMei(entries, config, agora);
  const alarmes = [];
  if (mei.status === 'critico' || mei.status === 'atencao') {
    alarmes.push({
      nivel: mei.status,
      titulo: `Limite do MEI em ${mei.ano}: ${formatarCompacto(mei.registrado)} de ${formatarCompacto(mei.limite)} registrados`,
      detalhe: `${mei.resumo}${mei.mesesSemDado.length ? ` Sem lançamentos no painel em: ${mei.mesesSemDado.join(', ')} (estimados pela média).` : ''}`,
      valor: 0,
    });
  }
  if (impostosVencidos.length) {
    const maisAntigo = impostosVencidos.reduce((a, x) => (x.data < a.data ? x : a), impostosVencidos[0]);
    const dias = Math.round((hoje - maisAntigo.data) / DAY_MS);
    const total = somar(impostosVencidos, (x) => valorEmAberto(x.e));
    alarmes.push({
      nivel: 'critico',
      titulo: impostosVencidos.length === 1
        ? `${maisAntigo.e.descricao} atrasado há ${dias} dia(s)`
        : `${impostosVencidos.length} pagamentos de imposto/MEI atrasados (${formatarBRL(total)})`,
      detalhe: `${impostosVencidos.length > 1 ? `O mais antigo venceu há ${dias} dias. ` : ''}Imposto atrasado gera multa e juros. Se já pagou, marque como pago no Financeiro.`,
      valor: total,
    });
  }
  const outrosVencidos = vencidosPagar.filter((x) => classificarSaida(x.e) !== 'impostos');
  if (outrosVencidos.length) {
    alarmes.push({ nivel: 'atencao', titulo: `${outrosVencidos.length} conta(s) a pagar vencida(s)`, detalhe: outrosVencidos.slice(0, 3).map((x) => `${x.e.descricao} (${formatarBRL(valorEmAberto(x.e))})`).join(' · '), valor: somar(outrosVencidos, (x) => valorEmAberto(x.e)) });
  }
  const em7 = abertos.filter((x) => x.e.tipo === 'pagar' && x.data && x.data >= hoje && (x.data - hoje) / DAY_MS <= 7);
  if (em7.length) {
    alarmes.push({ nivel: 'info', titulo: `${em7.length} conta(s) vencem nos próximos 7 dias`, detalhe: em7.slice(0, 3).map((x) => `${x.e.descricao} em ${x.data.toLocaleDateString('pt-BR')}`).join(' · '), valor: somar(em7, (x) => valorEmAberto(x.e)) });
  }
  if (vencidosReceber.length) {
    alarmes.push({ nivel: 'atencao', titulo: `${vencidosReceber.length} recebimento(s) atrasado(s)`, detalhe: vencidosReceber.slice(0, 3).map((x) => `${nomeCliente(x.e)} (${formatarBRL(valorEmAberto(x.e))})`).join(' · '), valor: somar(vencidosReceber, (x) => valorEmAberto(x.e)) });
  }
  const paraRevisar = validos.filter((e) => e.revisar).length;
  if (paraRevisar || semData.length) {
    alarmes.push({ nivel: 'info', titulo: `${paraRevisar} lançamento(s) para revisar`, detalhe: semData.length ? `${semData.length} sem data. Abra o Financeiro e use o filtro "Revisar".` : 'Abra o Financeiro e use o filtro "Revisar".', valor: 0 });
  }

  const pesoNivel = { critico: 0, atencao: 1, info: 2 };
  alarmes.sort((a, b) => (pesoNivel[a.nivel] ?? 3) - (pesoNivel[b.nivel] ?? 3));

  // ---------------- Clientes: receita x horas ----------------
  const horasPorCliente = new Map();
  jobs.forEach((j) => {
    const nome = nomeCliente({ cliente_fornecedor: j.cliente_nome });
    const atual = horasPorCliente.get(nome) || { realizadas: 0, estimadas: 0 };
    atual.realizadas += Number(j.horas_realizadas || 0);
    atual.estimadas += Number(j.horas_estimadas || 0);
    horasPorCliente.set(nome, atual);
  });
  const valorHoraMinimo = Number(config.valor_hora_minimo || 60);
  const clientes = porClienteCompleto.filter((c) => c.nome !== NOME_SOCIOS).map((c) => {
    const horas = horasPorCliente.get(c.nome) || { realizadas: 0, estimadas: 0 };
    const horasBase = horas.realizadas || horas.estimadas;
    const porHora = horasBase > 0 ? c.valor / horasBase : null;
    return {
      ...c,
      pct: totalEntradas > 0 ? c.valor / totalEntradas : 0,
      horas: horasBase,
      horasFonte: horas.realizadas ? 'realizadas' : (horas.estimadas ? 'estimadas' : null),
      porHora,
      rendeBem: porHora === null ? null : porHora >= valorHoraMinimo,
    };
  });

  // ---------------- Metas em degraus ----------------
  const metaMensal = Number(config.meta_mensal || 10000);
  const degrau = Math.max(500, Number(config.degrau || 3000));
  const ticket = Math.max(100, Number(config.ticket_medio || 1500));
  const atual = receitaMediaMensal;
  const degraus = [];
  let alvo = Math.max(degrau, Math.ceil((atual + 1) / degrau) * degrau);
  while (alvo < metaMensal && degraus.length < 10) {
    degraus.push(alvo);
    alvo += degrau;
  }
  degraus.push(metaMensal);
  const passos = degraus.map((valorAlvo, i) => {
    const falta = Math.max(0, valorAlvo - atual);
    // Tamanho do pulo deste degrau em relacao ao anterior (o primeiro parte do faturamento atual)
    const pulo = Math.round((i === 0 ? falta : valorAlvo - degraus[i - 1]) / 10) * 10;
    const porTicket = Math.max(1, Math.ceil(pulo / ticket));
    const sugestao = pulo <= 0
      ? 'Já alcançado'
      : (pulo > ticket
        ? `+${formatarCompacto(pulo)}/mês: 1 cliente de ${formatarCompacto(pulo)} ou ${porTicket} de ${formatarCompacto(ticket)}`
        : `+${formatarCompacto(pulo)}/mês: 1 cliente novo (ticket médio ${formatarCompacto(ticket)})`);
    return {
      alvo: valorAlvo,
      falta,
      pulo,
      atingido: atual >= valorAlvo,
      ehMeta: i === degraus.length - 1,
      sugestao,
    };
  });

  return {
    periodo: { ...intervalo, chave: periodo },
    totalEntradas,
    totalSaidas,
    sobra,
    aReceber,
    aPagar,
    porCliente,
    porClienteCompleto,
    porGrupo,
    mensal,
    receitaMediaMensal,
    custoMedioMensal,
    custoFixoMensal,
    saude,
    cada100,
    alarmes,
    clientes,
    reservas,
    totalReservado,
    reservaIdeal,
    mesesFolego,
    metas: { metaMensal, degrau, ticket, atual, passos, valorHoraMinimo },
    mei,
    semData: semData.length,
  };
}

// Resumo em texto para o chat (o que a pessoa ve na tela, sem dados pessoais desnecessarios).
export function resumoParaChat(c) {
  const linhas = [];
  linhas.push(`Período analisado: ${c.periodo.rotulo}.`);
  linhas.push(`Entradas realizadas: ${formatarBRL(c.totalEntradas)}. Saídas realizadas: ${formatarBRL(c.totalSaidas)}. Sobra: ${formatarBRL(c.sobra)}.`);
  linhas.push(`Ainda a receber no período: ${formatarBRL(c.aReceber)}. Ainda a pagar no período: ${formatarBRL(c.aPagar)}.`);
  linhas.push(`Receita média mensal (últimos 3 meses fechados): ${formatarBRL(c.receitaMediaMensal)}. Custo médio mensal: ${formatarBRL(c.custoMedioMensal)}. Custo fixo mensal (escritório, ferramentas, impostos): ${formatarBRL(c.custoFixoMensal)}.`);
  linhas.push('Meses (entradas / saídas): ' + c.mensal.map((m) => `${m.rotulo}${m.atual ? ' (parcial)' : ''} ${formatarCompacto(m.entradas)} / ${formatarCompacto(m.saidas)}`).join('; ') + '.');
  if (c.porClienteCompleto.length) {
    linhas.push('Entradas por cliente no período: ' + c.porClienteCompleto.slice(0, 8).map((x) => `${x.nome} ${formatarCompacto(x.valor)}`).join('; ') + '.');
  }
  if (c.porGrupo.length) {
    linhas.push('Saídas por grupo no período: ' + c.porGrupo.map((g) => `${g.label} ${formatarCompacto(g.valor)}`).join('; ') + '.');
  }
  linhas.push('Sinais de saúde: ' + c.saude.map((s) => `${s.titulo}: ${s.valorTexto} (${STATUS_SAUDE[s.status].label})`).join('; ') + '.');
  if (c.reservas.length) {
    linhas.push('Reservas e metas: ' + c.reservas.map((r) => `${r.titulo} ${formatarCompacto(r.guardado)} de ${formatarCompacto(r.alvo)}`).join('; ') + `. Total em reserva financeira: ${formatarBRL(c.totalReservado)}. Reserva ideal (6 meses de custo): ${formatarBRL(c.reservaIdeal)}.`);
  }
  linhas.push(`Meta de faturamento mensal: ${formatarBRL(c.metas.metaMensal)}. Degrau de crescimento: ${formatarBRL(c.metas.degrau)}. Ticket médio: ${formatarBRL(c.metas.ticket)}.`);
  if (c.mei) {
    linhas.push(`Limite anual do MEI (${c.mei.ano}): limite configurado ${formatarBRL(c.mei.limite)}; tolerância de 20% até ${formatarBRL(c.mei.tolerancia)}. Entradas da empresa registradas no ano: ${formatarBRL(c.mei.registrado)}. Projeção até dezembro: ${formatarBRL(c.mei.projecao)} (média mensal usada ${formatarBRL(c.mei.media)}).${c.mei.mesesSemDado.length ? ` Meses sem lançamentos no painel (estimados pela média, o valor real pode ser outro): ${c.mei.mesesSemDado.join(', ')}.` : ''}`);
  }
  if (c.alarmes.length) linhas.push('Alarmes: ' + c.alarmes.map((a) => a.titulo).join('; ') + '.');
  return linhas.join('\n');
}

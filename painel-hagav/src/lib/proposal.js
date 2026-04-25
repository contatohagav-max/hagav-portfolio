import { buildComparativeProposalPricing } from '@/lib/commercial';
import { fmtBRL } from '@/lib/utils';

const DEFAULT_NEXT_STEPS = [
  '01 - Aprovação da proposta via WhatsApp.',
  '02 - Envio dos materiais e referências pelo cliente.',
  '03 - Início da edição conforme prazo combinado.',
];

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseQuantityNumber(value, fallback = 1) {
  const match = String(value || '').match(/(\d{1,5})/);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, parsed);
}

function parseCurrencyNumber(value, fallback = 0) {
  const raw = normalizeText(value);
  if (!raw) return fallback;
  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getServiceItems(orc = {}) {
  const itens = Array.isArray(orc?.itens_servico) ? orc.itens_servico.filter(Boolean) : [];
  if (itens.length > 0) return itens;
  const servico = normalizeText(orc?.servico);
  if (!servico) return [];
  return [
    {
      servico,
      quantidade: normalizeText(orc?.quantidade) || '1',
    },
  ];
}

function inferUnitLabels(orc = {}) {
  const items = getServiceItems(orc);
  if (items.length !== 1) {
    return {
      singular: 'unidade',
      plural: 'unidades',
    };
  }

  const serviceKey = normalizeText(items[0]?.servico)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/motion|vinheta/.test(serviceKey)) {
    return {
      singular: 'projeto',
      plural: 'projetos',
    };
  }

  if (/videoaula|modulo/.test(serviceKey)) {
    return {
      singular: 'modulo',
      plural: 'modulos',
    };
  }

  return {
    singular: 'video',
    plural: 'videos',
  };
}

function ensureMensalValue(value) {
  const clean = normalizeText(value);
  if (!clean) return '';
  return /\/m[eê]s/i.test(clean) ? clean : `${clean}/mês`;
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function normalizeRevisoesText(rawValue) {
  const clean = normalizeText(rawValue);
  if (!clean) return '1 rodada de ajustes inclusa.';
  const qty = parseQuantityNumber(clean, 1);
  if (qty <= 1) return '1 rodada de ajustes inclusa.';
  return `${qty} rodadas de ajustes inclusas.`;
}

export function buildCommercialScopeText(orc = {}, revisoesText = '') {
  const items = getServiceItems(orc);
  const revisoes = normalizeRevisoesText(revisoesText);

  if (items.length <= 1) {
    const single = items[0] || {
      servico: normalizeText(orc?.servico) || 'conteudo audiovisual',
      quantidade: parseQuantityNumber(orc?.quantidade, 1),
    };
    const quantity = parseQuantityNumber(single?.quantidade, 1);
    const unitLabels = inferUnitLabels({ itens_servico: [single] });
    const unit = quantity === 1 ? unitLabels.singular : unitLabels.plural;

    return [
      `Edição e finalização de ${quantity} ${unit} de ${single?.servico || 'conteudo audiovisual'} conforme briefing aprovado.`,
      'Inclui organização do material, cortes, ritmo, acabamento visual e exportação final em MP4.',
      `O projeto contempla ${revisoes.toLowerCase()}`,
    ].join(' ');
  }

  const total = items.reduce((sum, item) => sum + parseQuantityNumber(item?.quantidade, 1), 0);
  const compact = items
    .slice(0, 4)
    .map((item) => `${parseQuantityNumber(item?.quantidade, 1)} ${item?.servico || 'item'}`)
    .join(' + ');

  return [
    `Edição e finalização de ${total} itens (${compact}) conforme briefing aprovado.`,
    'Inclui organização do material, cortes, ritmo, acabamento visual e exportação final em MP4.',
    `O projeto contempla ${revisoes.toLowerCase()}`,
  ].join(' ');
}

export function buildAutoOptionDraft({ orc, quantityText, totalText }) {
  const unitLabels = inferUnitLabels(orc);
  const requestedQuantity = parseQuantityNumber(quantityText, 1);
  const requestedTotal = parseCurrencyNumber(totalText, 0);
  const pricing = buildComparativeProposalPricing(orc, {
    baseQuantity: requestedQuantity,
    baseTotal: requestedTotal,
  });
  const [pedidoAtual, maisVolume, melhorCustoBeneficio] = pricing.scenarios || [];

  const formatQuantityLabel = (scenario, overrideText = '') => {
    const manualText = normalizeText(overrideText);
    if (manualText) return manualText;
    if (!scenario?.quantity) return '';
    const unit = scenario.quantity === 1 ? unitLabels.singular : unitLabels.plural;
    return `${scenario.quantity} ${unit}`;
  };

  const formatUnitPrice = (scenario) => {
    if (!Number.isFinite(Number(scenario?.unitPrice))) return '';
    return `${fmtBRL(scenario.unitPrice)} por ${unitLabels.singular}`;
  };

  const buildDescription = (scenario, fallbackText) => {
    if (!scenario) return fallbackText;
    if (Number(scenario.discountPercent || 0) > 0) {
      return `Desconto aplicado: ${scenario.discountPercent}%`;
    }
    return fallbackText;
  };

  return {
    opcao1_titulo: pedidoAtual?.title || 'Pedido atual',
    opcao1_qtd: formatQuantityLabel(pedidoAtual, quantityText),
    opcao1_preco: fmtBRL(Number(pedidoAtual?.total || requestedTotal || 0)),
    opcao1_unitario: formatUnitPrice(pedidoAtual),
    opcao1_desc: buildDescription(pedidoAtual, 'Sem desconto aplicado'),
    opcao1_desconto: '',
    opcao2_titulo: maisVolume?.title || 'Mais volume',
    opcao2_qtd: formatQuantityLabel(maisVolume),
    opcao2_preco: fmtBRL(Number(maisVolume?.total || 0)),
    opcao2_unitario: formatUnitPrice(maisVolume),
    opcao2_desc: buildDescription(maisVolume, 'Sem desconto aplicado'),
    opcao2_desconto: Number(maisVolume?.discountPercent || 0) > 0 ? `-${maisVolume.discountPercent}%` : '',
    opcao3_titulo: melhorCustoBeneficio?.title || 'Melhor custo-beneficio',
    opcao3_qtd: formatQuantityLabel(melhorCustoBeneficio),
    opcao3_preco: fmtBRL(Number(melhorCustoBeneficio?.total || 0)),
    opcao3_unitario: formatUnitPrice(melhorCustoBeneficio),
    opcao3_desc: buildDescription(melhorCustoBeneficio, 'Sem desconto aplicado'),
    opcao3_desconto: Number(melhorCustoBeneficio?.discountPercent || 0) > 0 ? `-${melhorCustoBeneficio.discountPercent}%` : '',
    texto_comparativo: '',
  };
}

export function buildProposalPreviewModel({ orc, proposalMode, proposalDraft }) {
  const draft = proposalDraft && typeof proposalDraft === 'object' ? proposalDraft : {};
  const mode = normalizeText(proposalMode) || 'direta';
  const conditions = splitLines(draft.condicoes_comerciais);
  const optionCards = [1, 2, 3].map((index) => ({
    title: normalizeText(draft[`opcao${index}_titulo`]),
    quantity: normalizeText(draft[`opcao${index}_qtd`]),
    total: normalizeText(draft[`opcao${index}_preco`]),
    unitPrice: normalizeText(draft[`opcao${index}_unitario`]),
    description: normalizeText(draft[`opcao${index}_desc`]),
    discount: normalizeText(draft[`opcao${index}_desconto`]),
  })).filter((card) => card.title || card.total || card.quantity || card.unitPrice);

  const directValue = normalizeText(draft.valor_total_moeda);
  const mensalValue = ensureMensalValue(draft.valor_mensal_moeda || draft.valor_total_moeda);
  const customValue = normalizeText(draft.valor_personalizado_moeda || draft.valor_total_moeda);

  let investmentLabel = 'Valor total';
  let investmentValue = directValue;
  if (mode === 'mensal') {
    investmentLabel = 'Valor mensal';
    investmentValue = mensalValue;
  } else if (mode === 'personalizada') {
    investmentLabel = 'Valor total';
    investmentValue = customValue;
  }

  return {
    mode,
    title: 'PROPOSTA COMERCIAL',
    subtitle: 'Proposta objetiva para validação de escopo, investimento e início da produção.',
    proposalNumber: normalizeText(draft.numero_proposta),
    emissionDate: normalizeText(draft.data_emissao),
    validityDate: normalizeText(draft.data_validade),
    paymentMethod: normalizeText(draft.forma_pagamento),
    client: {
      name: normalizeText(draft.cliente_nome),
      whatsapp: normalizeText(draft.whatsapp),
      company: normalizeText(draft.empresa),
      instagram: normalizeText(draft.instagram),
      email: normalizeText(draft.email_cliente),
    },
    summary: {
      service: normalizeText(draft.servico_principal),
      quantity: normalizeText(mode === 'mensal' ? (draft.quantidade_mensal || draft.quantidade) : draft.quantidade),
      deadline: normalizeText(draft.prazo),
    },
    scope: normalizeText(mode === 'mensal' ? (draft.escopo_mensal || draft.escopo_comercial) : draft.escopo_comercial),
    investment: {
      label: investmentLabel,
      value: investmentValue,
      visible: mode !== 'opcoes' && Boolean(investmentValue),
    },
    monthly: {
      visible: mode === 'mensal',
      quantity: normalizeText(draft.quantidade_mensal || draft.quantidade),
      duration: normalizeText(draft.duracao_contrato_meses),
      value: mensalValue,
      scope: normalizeText(draft.escopo_mensal || draft.escopo_comercial),
    },
    options: {
      visible: mode === 'opcoes' && optionCards.length > 0,
      items: optionCards,
      footnote: normalizeText(draft.texto_comparativo),
    },
    conditions,
    reference: normalizeText(draft.referencia_texto),
    observation: normalizeText(draft.observacao_adicional),
    cta: normalizeText(draft.cta_aprovacao) || 'Aprovar proposta no WhatsApp',
    nextSteps: DEFAULT_NEXT_STEPS,
    source: {
      leadId: normalizeText(orc?.id),
    },
  };
}

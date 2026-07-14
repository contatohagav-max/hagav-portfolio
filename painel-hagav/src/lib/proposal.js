import { buildComparativeProposalPricing, normalizePrazoLabel } from '@/lib/commercial';
import { fmtBRL } from '@/lib/utils';

const DEFAULT_NEXT_STEPS = [
  '01 Aprovação',
  '02 Recebimento dos materiais',
  '03 Início da produção',
];

const PROPOSAL_SUBTITLE = 'Documento com escopo, investimento, condições comerciais e próximos passos para início do projeto.';

const OPTION_STRATEGY = {
  pedido_atual: {
    title: 'Pedido atual',
    subtitle: 'Escopo solicitado inicialmente.',
  },
  mais_volume: {
    title: 'Plano Crescimento',
    subtitle: 'Mais indicado para quem publica com frequência.',
  },
  melhor_custo_beneficio: {
    title: 'Plano Escala',
    subtitle: 'Ideal para operações maiores e maior economia por entrega.',
  },
};

function normalizePlaceholderKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function looksLikeTemplateVariable(value) {
  const normalized = normalizePlaceholderKey(value);
  if (!normalized) return false;
  return /^[a-z][a-z0-9_]*$/.test(normalized);
}

function unwrapTemplateToken(value) {
  const inner = String(value || '').trim();
  if (!inner) return '';
  return looksLikeTemplateVariable(inner) ? '' : inner;
}

function stripTemplateArtifacts(value) {
  return String(value ?? '')
    .replace(/{{\s*([^{}]+)\s*}}/g, (_, inner) => unwrapTemplateToken(inner))
    .replace(/\[\[\s*([^[\]]+)\s*\]\]/g, (_, inner) => unwrapTemplateToken(inner))
    .replace(/%%\s*([^%]+)\s*%%/g, (_, inner) => unwrapTemplateToken(inner))
    .replace(/__\s*([A-Za-z0-9_.-]+)\s*__/g, (_, inner) => unwrapTemplateToken(inner));
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return stripTemplateArtifacts(value)
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
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
function parseDiscountPercent(value, fallback = 0) {
  const raw = normalizeText(value);
  if (!raw) return fallback;

  const normalized = raw
    .replace('%', '')
    .replace('-', '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;

  return Math.max(0, Math.min(100, parsed));
}

function formatPercentBadge(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '';

  const rounded = Math.round(number * 100) / 100;
  return `-${String(rounded).replace('.', ',')}%`;
}

function inferUnitLabelFromUnitPrice(value, fallback = 'vídeo') {
  const match = normalizeText(value).match(/\spor\s+(.+)$/i);
  return normalizeText(match?.[1]) || fallback;
}
function formatProposalNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(2, '0');
}

function formatDiscountBadge(value) {
  const clean = normalizeText(value);
  if (!clean) return '';
  const number = Number(clean.replace('%', '').replace('-', '').replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return clean;
  return `-${Math.round(number)}%`;
}

function buildEconomyText(scenario, baseUnitPrice) {
  const quantity = Number(scenario?.quantity || 0);
  const total = Number(scenario?.total || 0);
  const unitPrice = Number(scenario?.unitPrice || 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(total) || quantity <= 0 || total <= 0) return '';

  const referenceTotal = Number(baseUnitPrice || 0) > 0 ? baseUnitPrice * quantity : 0;
  const economy = Math.max(0, referenceTotal - total);
  const discountPercent = Number(scenario?.discountPercent || 0);
  if (economy > 0 && discountPercent > 0) {
    return `Economia: ${fmtBRL(economy)} (${Math.round(discountPercent)}%).`;
  }
  if (economy > 0) return `Economia: ${fmtBRL(economy)}.`;
  if (discountPercent > 0) return `Economia: ${Math.round(discountPercent)}%.`;
  if (unitPrice > 0 && baseUnitPrice > 0 && unitPrice < baseUnitPrice) {
    return 'Economia por entrega em relação ao pedido atual.';
  }
  return '';
}

function syncEconomyDescription(description, economy, discountPercent) {
  const clean = normalizeText(description);
  if (!(Number(economy || 0) > 0) || !(Number(discountPercent || 0) > 0)) return clean;

  const economyText = `Economia: ${fmtBRL(economy)} (${Math.round(discountPercent)}%).`;
  if (/Economia:/i.test(clean)) {
    const updated = clean.replace(/Economia:\s*.*?(?:\(\s*[\d.,]+\s*%\s*\)|\.)\.?/i, economyText);
    return (updated === clean ? clean.replace(/Economia:\s*.*$/i, economyText) : updated).trim();
  }
  return [clean, economyText].filter(Boolean).join(' ');
}

function formatQuantityLabelFromNumber(quantity, unitLabels) {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const unit = safeQuantity === 1 ? unitLabels.singular : unitLabels.plural;
  return `${safeQuantity} ${unit}`;
}

function buildComparativeOptionCalculation({ baseTotal, baseQuantity, optionQuantity, discountPercent }) {
  const safeBaseTotal = Number(baseTotal || 0);
  const safeBaseQuantity = Math.max(1, Number(baseQuantity || 1));
  const safeOptionQuantity = Math.max(1, Number(optionQuantity || 1));
  const safeDiscountPercent = Math.max(0, Math.min(100, Math.abs(Number(discountPercent || 0))));
  const baseUnit = safeBaseQuantity > 0 ? safeBaseTotal / safeBaseQuantity : 0;
  const totalWithoutDiscount = baseUnit * safeOptionQuantity;
  const economy = totalWithoutDiscount * (safeDiscountPercent / 100);
  const total = totalWithoutDiscount - economy;
  const unitPrice = safeOptionQuantity > 0 ? total / safeOptionQuantity : 0;

  return {
    quantity: safeOptionQuantity,
    discountPercent: safeDiscountPercent,
    totalWithoutDiscount,
    economy,
    total,
    unitPrice,
  };
}

export function buildComparativeCalculatedDraft({ orc, proposalDraft }) {
  const draft = proposalDraft && typeof proposalDraft === 'object' ? proposalDraft : {};
  const unitLabels = inferUnitLabels(orc);
  const baseQuantity = parseQuantityNumber(draft.opcao1_qtd || draft.quantidade, 1);
  const baseTotal = parseCurrencyNumber(draft.opcao1_preco || draft.valor_total_moeda, 0);
  const baseCalculation = buildComparativeOptionCalculation({
    baseTotal,
    baseQuantity,
    optionQuantity: baseQuantity,
    discountPercent: 0,
  });
  const next = {
    ...draft,
    opcao1_qtd: formatQuantityLabelFromNumber(baseCalculation.quantity, unitLabels),
    opcao1_preco: baseTotal > 0 ? fmtBRL(baseTotal) : normalizeText(draft.opcao1_preco),
    opcao1_unitario: baseCalculation.unitPrice > 0 ? `${fmtBRL(baseCalculation.unitPrice)} por ${unitLabels.singular}` : normalizeText(draft.opcao1_unitario),
    opcao1_desconto: '',
  };

  [2, 3].forEach((index) => {
    const optionQuantity = parseQuantityNumber(draft[`opcao${index}_qtd`], 1);
    const discountPercent = parseDiscountPercent(draft[`opcao${index}_desconto`], 0);
    const calculation = buildComparativeOptionCalculation({
      baseTotal,
      baseQuantity,
      optionQuantity,
      discountPercent,
    });

    next[`opcao${index}_qtd`] = formatQuantityLabelFromNumber(calculation.quantity, unitLabels);
    next[`opcao${index}_preco`] = calculation.total > 0 ? fmtBRL(calculation.total) : '';
    next[`opcao${index}_unitario`] = calculation.unitPrice > 0 ? `${fmtBRL(calculation.unitPrice)} por ${unitLabels.singular}` : '';
    next[`opcao${index}_desconto`] = formatPercentBadge(calculation.discountPercent);
    next[`opcao${index}_desc`] = syncEconomyDescription(
      draft[`opcao${index}_desc`],
      calculation.economy,
      calculation.discountPercent
    );
    next[`opcao${index}_economia`] = calculation.economy > 0 ? fmtBRL(calculation.economy) : '';
    next[`opcao${index}_total_sem_desconto`] = calculation.totalWithoutDiscount > 0 ? fmtBRL(calculation.totalWithoutDiscount) : '';
  });

  return next;
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
      singular: 'módulo',
      plural: 'módulos',
    };
  }

  return {
    singular: 'vídeo',
    plural: 'vídeos',
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
      servico: normalizeText(orc?.servico) || 'conteúdo audiovisual',
      quantidade: parseQuantityNumber(orc?.quantidade, 1),
    };
    const quantity = parseQuantityNumber(single?.quantidade, 1);
    const unitLabels = inferUnitLabels({ itens_servico: [single] });
    const unit = quantity === 1 ? unitLabels.singular : unitLabels.plural;

    return [
      `Edição e finalização de ${quantity} ${unit} de ${single?.servico || 'conteúdo audiovisual'} conforme briefing aprovado.`,
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

export function buildAutoOptionDraft({ orc, quantityText, totalText, pricingRules }) {
  const unitLabels = inferUnitLabels(orc);
  const serviceItems = getServiceItems(orc);
  const inferredQuantity = serviceItems.reduce((sum, item) => (
    sum + parseQuantityNumber(item?.quantidade, 1)
  ), 0) || 1;
  const requestedQuantity = serviceItems.length > 1
    ? inferredQuantity
    : parseQuantityNumber(quantityText, inferredQuantity);
  const requestedTotal = parseCurrencyNumber(totalText, 0);
  const pricing = buildComparativeProposalPricing(orc, {
    baseQuantity: requestedQuantity,
    baseTotal: requestedTotal,
    pricingRules,
  });
  const [pedidoAtual, maisVolume, melhorCustoBeneficio] = pricing.scenarios || [];
  const baseUnitPrice = Number(pedidoAtual?.unitPrice || 0);

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
    const strategy = OPTION_STRATEGY[scenario?.key] || {};
    const lines = [
      strategy.subtitle || fallbackText,
      buildEconomyText(scenario, baseUnitPrice),
    ].filter(Boolean);
    return lines.join(' ');
  };

  return {
    opcao1_titulo: OPTION_STRATEGY.pedido_atual.title,
    opcao1_qtd: formatQuantityLabel(pedidoAtual, quantityText),
    opcao1_preco: fmtBRL(Number(pedidoAtual?.total || requestedTotal || 0)),
    opcao1_unitario: formatUnitPrice(pedidoAtual),
    opcao1_desc: buildDescription(pedidoAtual, 'Sem desconto aplicado'),
    opcao1_desconto: '',
    opcao2_titulo: OPTION_STRATEGY.mais_volume.title,
    opcao2_qtd: formatQuantityLabel(maisVolume),
    opcao2_preco: fmtBRL(Number(maisVolume?.total || 0)),
    opcao2_unitario: formatUnitPrice(maisVolume),
    opcao2_desc: buildDescription(maisVolume, 'Sem desconto aplicado'),
    opcao2_desconto: formatDiscountBadge(maisVolume?.discountPercent),
    opcao3_titulo: OPTION_STRATEGY.melhor_custo_beneficio.title,
    opcao3_qtd: formatQuantityLabel(melhorCustoBeneficio),
    opcao3_preco: fmtBRL(Number(melhorCustoBeneficio?.total || 0)),
    opcao3_unitario: formatUnitPrice(melhorCustoBeneficio),
    opcao3_desc: buildDescription(melhorCustoBeneficio, 'Sem desconto aplicado'),
    opcao3_desconto: formatDiscountBadge(melhorCustoBeneficio?.discountPercent),
    texto_comparativo: 'Comparativo pensado para orientar a decisão pelo melhor equilíbrio entre volume, investimento e custo por entrega.',
  };
}

export function buildProposalPreviewModel({ orc, proposalMode, proposalDraft }) {
  const mode = normalizeText(proposalMode) || 'direta';
  const rawDraft = proposalDraft && typeof proposalDraft === 'object' ? proposalDraft : {};
  const draft = mode === 'opcoes'
    ? buildComparativeCalculatedDraft({ orc, proposalDraft: rawDraft })
    : rawDraft;
  const conditions = splitLines(draft.condicoes_comerciais);
    const unitLabels = inferUnitLabels(orc);
  const baseQuantity = parseQuantityNumber(draft.opcao1_qtd || draft.quantidade, 1);
  const baseTotal = parseCurrencyNumber(draft.opcao1_preco || draft.valor_total_moeda, 0);

  const optionCards = [1, 2, 3].map((index) => {
    const title = normalizeText(draft[`opcao${index}_titulo`]);
    const quantity = normalizeText(draft[`opcao${index}_qtd`]);
    let description = normalizeText(draft[`opcao${index}_desc`]);
    const manualDiscountText = normalizeText(draft[`opcao${index}_desconto`]);

    let total = normalizeText(draft[`opcao${index}_preco`]);
    let unitPrice = normalizeText(draft[`opcao${index}_unitario`]);
    let discount = manualDiscountText;

    const optionQuantity = parseQuantityNumber(quantity, 0);
    const discountPercent = index > 1 ? parseDiscountPercent(manualDiscountText, 0) : 0;

    if (index > 1 && discountPercent > 0 && baseQuantity > 0 && optionQuantity > 0 && baseTotal > 0) {
      const totalWithoutDiscount = (baseTotal / baseQuantity) * optionQuantity;
      const recalculatedTotal = totalWithoutDiscount * (1 - (discountPercent / 100));
      const unitLabel = inferUnitLabelFromUnitPrice(unitPrice, unitLabels.singular);
      const economy = Math.max(0, totalWithoutDiscount - recalculatedTotal);

      total = fmtBRL(recalculatedTotal);
      unitPrice = `${fmtBRL(recalculatedTotal / optionQuantity)} por ${unitLabel}`;
      discount = formatPercentBadge(discountPercent);
      description = syncEconomyDescription(description, economy, discountPercent);
    }

    return {
      title,
      quantity,
      total,
      unitPrice,
      description,
      discount,
    };
  }).filter((card) => card.title || card.total || card.quantity || card.unitPrice);

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
    subtitle: PROPOSAL_SUBTITLE,
    proposalNumber: formatProposalNumber(draft.numero_proposta),
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
      deadline: normalizePrazoLabel(draft.prazo, ''),
    },
    scope: normalizeText(mode === 'mensal' ? (draft.escopo_mensal || draft.escopo_comercial) : draft.escopo_comercial),
    investment: {
      label: investmentLabel,
      value: investmentValue,
      visible: mode !== 'opcoes' && mode !== 'mensal' && Boolean(investmentValue),
    },
    monthly: {
      visible: mode === 'mensal',
      quantity: normalizeText(draft.quantidade_mensal || draft.quantidade),
      duration: normalizeText(draft.duracao_contrato_meses),
      value: mensalValue,
      scope: normalizeText(draft.escopo_mensal || draft.escopo_comercial),
      structure: 'Produção recorrente com organização mensal, recebimento de materiais, edição, revisão e entrega final conforme cronograma aprovado.',
    },
    options: {
      visible: mode === 'opcoes' && optionCards.length > 0,
      items: optionCards,
      footnote: normalizeText(draft.texto_comparativo),
    },
    conditions,
    reference: mode === 'direta' ? '' : normalizeText(draft.referencia_texto),
    observation: mode === 'direta' ? '' : normalizeText(draft.observacao_adicional),
    cta: normalizeText(draft.cta_aprovacao) || 'Aprovar proposta no WhatsApp',
    nextSteps: DEFAULT_NEXT_STEPS,
    source: {
      leadId: normalizeText(orc?.id),
    },
  };
}

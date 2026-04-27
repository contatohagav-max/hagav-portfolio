'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Loader2, MessageCircle, ExternalLink, AlertTriangle, CheckCircle2, Send, Ban, RotateCw, Eye, Download, Plus, Trash2 } from 'lucide-react';
import { OrcStatusBadge, PrioridadeBadge, UrgenciaBadge, TemperaturaBadge } from '@/components/ui/StatusBadge';
import EduTooltip from '@/components/ui/EduTooltip';
import CollapsibleActionBlock from '@/components/ui/CollapsibleActionBlock';
import useAdaptivePanelWidth from '@/components/ui/useAdaptivePanelWidth';
import ProposalPreview from '@/components/orcamentos/ProposalPreview';
import { fetchCommercialSettings, generateDealPdf, updateOrcamento } from '@/lib/supabase';
import {
  COMMERCIAL_DEFAULTS,
  computePricingSnapshot,
  deriveFinancialMetricsFromFinalPrice,
  extractPricingItemsFromRecord,
  formatDurationCompact,
  PRAZO_OPTIONS,
  getCommercialServiceLabel,
  getCommercialServiceOptions,
  getCommercialServicePreset,
  getDefaultCommercialServiceLabel,
  normalizePrazoLabel,
  normalizePricingRules,
  parseDurationToHours,
} from '@/lib/commercial';
import { buildAutoOptionDraft, buildCommercialScopeText, buildProposalPreviewModel } from '@/lib/proposal';
import { fmtDateTime, fmtBRL, whatsappLink, ORC_STATUS_LABELS } from '@/lib/utils';

const ORC_STATUSES = ['orcamento', 'proposta_enviada', 'ajustando', 'aprovado', 'perdido'];
const WHATSAPP_TOOLTIP = {
  title: 'WhatsApp',
  whatIs: 'Abre o contato direto do cliente no WhatsApp.',
  purpose: 'Acelerar negociacao e confirmacoes de proposta.',
  observe: 'Use mensagem objetiva com proximo passo claro.',
};
const SEND_PROPOSTA_TOOLTIP = {
  title: 'Enviar proposta',
  whatIs: 'Envia a mensagem no WhatsApp com o link da proposta.',
  purpose: 'Garantir envio comercial padrao e rastreavel.',
  observe: 'Gere a proposta PDF antes de enviar no WhatsApp.',
};
const PROPOSAL_MODE_OPTIONS = [
  { value: 'direta', label: 'Modo 1 - Direta' },
  { value: 'opcoes', label: 'Modo 2 - Com opcoes' },
  { value: 'mensal', label: 'Modo 3 - Mensal' },
  { value: 'personalizada', label: 'Modo 4 - Personalizada' },
];

const DEFAULT_CONDICOES_COMERCIAIS = [
  'Forma de pagamento: PIX / Transferencia / Conforme combinado.',
  'Proposta valida ate [data].',
  'O projeto inicia apos aprovacao e envio dos materiais.',
  'Inclui 1 rodada de ajustes por entrega. Alteracoes de estrutura, roteiro, estilo ou escopo podem gerar novo orcamento.',
].join('\n');

const PROPOSAL_MODE_PRESETS = {
  direta: {
    servico_principal: 'Conteudo para redes sociais',
    quantidade: '10 videos',
    prazo: 'Urgente',
    escopo_comercial: 'Edicao estrategica com acabamento profissional, ritmo otimizado para retencao e entrega pronta para publicacao em MP4. Inclui 1 rodada de ajustes.',
    quantidade_mensal: '',
    duracao_contrato_meses: '',
    valor_mensal_moeda: '',
    valor_personalizado_moeda: '',
  },
  opcoes: {
    servico_principal: 'Conteudo para redes sociais',
    quantidade: '10 videos',
    prazo: 'Urgente',
    escopo_comercial: 'Comparativo comercial com pedido atual e duas opcoes de maior volume para reduzir custo medio por entrega.',
    quantidade_mensal: '',
    duracao_contrato_meses: '',
    valor_mensal_moeda: '',
    valor_personalizado_moeda: '',
  },
  mensal: {
    servico_principal: 'Plano mensal de conteudo',
    quantidade: '12 videos mensais',
    prazo: 'Este mês',
    escopo_comercial: 'Operacao mensal de edicao com padrao visual consistente, organizacao de entregas e acompanhamento por cronograma aprovado.',
    quantidade_mensal: '12 videos por mes',
    duracao_contrato_meses: '3',
    valor_mensal_moeda: '',
    valor_personalizado_moeda: '',
  },
  personalizada: {
    servico_principal: 'Proposta personalizada',
    quantidade: 'Escopo sob medida',
    prazo: 'Sem prazo definido',
    escopo_comercial: 'Estrutura personalizada para atender necessidades especificas, com planejamento de escopo, organizacao de materiais e execucao premium.',
    quantidade_mensal: '',
    duracao_contrato_meses: '',
    valor_mensal_moeda: '',
    valor_personalizado_moeda: '',
  },
};

const PROPOSAL_DRAW_FIELDS = [
  'cliente_nome',
  'whatsapp',
  'empresa',
  'instagram',
  'email_cliente',
  'servico_principal',
  'quantidade',
  'quantidade_mensal',
  'prazo',
  'escopo_comercial',
  'escopo_mensal',
  'condicoes_comerciais',
  'referencia_texto',
  'observacao_adicional',
  'valor_total_moeda',
  'valor_mensal_moeda',
  'valor_personalizado_moeda',
  'forma_pagamento',
  'data_validade',
  'duracao_contrato_meses',
  'numero_proposta',
  'data_emissao',
  'cta_aprovacao',
  'opcao1_titulo',
  'opcao1_qtd',
  'opcao1_preco',
  'opcao1_unitario',
  'opcao1_desc',
  'opcao1_desconto',
  'opcao2_titulo',
  'opcao2_qtd',
  'opcao2_preco',
  'opcao2_unitario',
  'opcao2_desc',
  'opcao2_desconto',
  'opcao3_titulo',
  'opcao3_qtd',
  'opcao3_preco',
  'opcao3_unitario',
  'opcao3_desc',
  'opcao3_desconto',
  'texto_comparativo',
];

const ITEM_MATERIAL_OPTIONS = ['Sim', 'Não', 'Parcial'];

const AUTO_SYNC_PROPOSAL_FIELDS = [
  'cliente_nome',
  'whatsapp',
  'empresa',
  'instagram',
  'email_cliente',
  'servico_principal',
  'quantidade',
  'quantidade_mensal',
  'prazo',
  'escopo_comercial',
  'escopo_mensal',
  'referencia_texto',
  'valor_total_moeda',
  'valor_mensal_moeda',
  'valor_personalizado_moeda',
  'opcao1_titulo',
  'opcao1_qtd',
  'opcao1_preco',
  'opcao1_unitario',
  'opcao1_desc',
  'opcao1_desconto',
  'opcao2_titulo',
  'opcao2_qtd',
  'opcao2_preco',
  'opcao2_unitario',
  'opcao2_desc',
  'opcao2_desconto',
  'opcao3_titulo',
  'opcao3_qtd',
  'opcao3_preco',
  'opcao3_unitario',
  'opcao3_desc',
  'opcao3_desconto',
  'texto_comparativo',
];

function InfoRow({ label, value }) {
  return (
    <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
      <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-hagav-light font-medium break-words">{value || '—'}</p>
    </div>
  );
}

function toDateTimeLocal(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateBr(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeServicePrefix(rawValue, serviceNames = []) {
  const raw = normalizeText(rawValue);
  if (!raw || serviceNames.length === 0) return raw;

  let cleaned = raw;
  serviceNames.forEach((service) => {
    const name = normalizeText(service);
    if (!name) return;
    const prefixRegex = new RegExp(`^${escapeRegExp(name)}\\s*:\\s*`, 'i');
    cleaned = cleaned.replace(prefixRegex, '');
  });

  return cleaned.trim();
}

function extractReferenceUrl(value) {
  const match = String(value || '').match(/https?:\/\/\S+/i);
  if (!match) return '';
  return match[0].replace(/[),.;]+$/, '');
}

function parseDetalhes(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function firstFilledText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
}

function inferProposalModeFromFlow(record, fallback = 'direta') {
  const flow = normalizeText(record?.fluxo || record?.Fluxo).toUpperCase();
  if (flow === 'DR') return 'mensal';
  if (flow === 'DU') return fallback;
  return fallback;
}

function readAnswersFromDetalhes(detalhes = {}) {
  const rawAnswers = detalhes?.respostasCompletas
    || detalhes?.answers
    || detalhes?.respostas
    || null;
  return parseDetalhes(rawAnswers);
}

function normalizeProposalMode(value) {
  const key = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (key.includes('opco')) return 'opcoes';
  if (key.includes('mensal') || key.includes('recorrente')) return 'mensal';
  if (key.includes('personal')) return 'personalizada';
  if (key.includes('direta')) return 'direta';
  return '';
}

function parseQuantityNumber(value, fallback = 10) {
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

function summarizeDraftField(items = [], getValue, fallback = '') {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (safeItems.length === 0) return normalizeText(fallback);
  if (safeItems.length === 1) return normalizeText(getValue(safeItems[0]) || fallback);
  return safeItems
    .map((item) => {
      const service = normalizeText(item?.servico || 'Serviço');
      const value = normalizeText(getValue(item) || '-');
      return `${service}: ${value}`;
    })
    .join(' | ');
}

function getFirstItemValue(items = [], field, fallback = '') {
  const safeItems = Array.isArray(items) ? items : [];
  const firstValue = safeItems.find((item) => normalizeText(item?.[field]))?.[field];
  return normalizeText(firstValue || fallback);
}

function normalizePricingItemDraft(item = {}, fallback = {}, pricingRules = COMMERCIAL_DEFAULTS.pricing) {
  const defaultService = getDefaultCommercialServiceLabel(pricingRules);
  const rawService = normalizeText(item?.servico || fallback?.servico);
  const normalizedService = rawService
    && !/^servi[cç]o$/i.test(rawService)
    ? getCommercialServiceLabel(rawService, pricingRules)
    : defaultService;
  const servicePreset = getCommercialServicePreset(normalizedService, pricingRules);
  const tempoRaw = normalizeText(item?.horas_estimadas || item?.tempo_bruto || fallback?.tempo_bruto);
  const horas = normalizeText(item?.horas_estimadas || '');
  const presetDuration = normalizeText(servicePreset?.presetDuration || '');
  return {
    servico: normalizedService,
    quantidade: normalizeText(item?.quantidade || fallback?.quantidade || '1') || '1',
    material_gravado: normalizeText(item?.material_gravado || fallback?.material_gravado || 'Sim') || 'Sim',
    horas_estimadas: horas || tempoRaw || presetDuration,
    tempo_bruto: tempoRaw || horas || presetDuration,
    prazo: normalizePrazoLabel(item?.prazo || fallback?.prazo, ''),
    referencia: normalizeText(item?.referencia || fallback?.referencia),
  };
}

function buildInitialPricingItems(record, pricingRules = COMMERCIAL_DEFAULTS.pricing) {
  const extracted = extractPricingItemsFromRecord(record)
    .map((item) => normalizePricingItemDraft(item, record, pricingRules))
    .filter((item) => normalizeText(item?.servico));

  if (extracted.length > 0) return extracted;
  return [normalizePricingItemDraft({
    servico: normalizeText(record?.servico || getDefaultCommercialServiceLabel(pricingRules)),
    quantidade: normalizeText(record?.quantidade || '1'),
    material_gravado: normalizeText(record?.material_gravado || 'Sim'),
    tempo_bruto: normalizeText(record?.tempo_bruto || ''),
    prazo: normalizePrazoLabel(record?.prazo || '', ''),
    referencia: normalizeText(record?.referencia || ''),
  }, record, pricingRules)];
}

function buildSavedProposalDirtyMap(record) {
  const detalhes = parseDetalhes(record?.detalhes);
  const comercial = parseDetalhes(detalhes?.comercial);
  const dirty = {};
  AUTO_SYNC_PROPOSAL_FIELDS.forEach((field) => {
    if (normalizeText(comercial?.[field])) {
      dirty[field] = true;
    }
  });
  return dirty;
}

function isLikelyInternalObservation(value) {
  const key = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    key.includes('du |')
    || key.includes('dr |')
    || key.includes('material gravado')
    || key.includes('tempo bruto')
    || key.includes('respostascompletas')
  );
}

function pickClientObservationText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    if (normalized.length < 8 || normalized.length > 260) continue;
    if (isLikelyInternalObservation(normalized)) continue;
    const separators = (normalized.match(/\|/g) || []).length;
    if (separators >= 2) continue;
    return normalized;
  }
  return '';
}

function buildProposalDraftFromRecord(record, forcedMode, options = {}) {
  const detalhes = parseDetalhes(record?.detalhes);
  const comercial = parseDetalhes(detalhes?.comercial);
  const respostas = readAnswersFromDetalhes(detalhes);
  const pricingRules = options?.pricingRules;
  const preferLiveRecord = Boolean(options?.preferLiveRecord);
  const pickStoredOrLive = (storedValue, liveValue, ...fallbackValues) => firstFilledText(
    preferLiveRecord ? liveValue : storedValue,
    preferLiveRecord ? storedValue : liveValue,
    ...fallbackValues
  );
  const savedMode = normalizeProposalMode(
    forcedMode || comercial?.proposta_modo || comercial?.proposal_mode || ''
  );
  const proposalMode = savedMode || inferProposalModeFromFlow(record, 'direta');
  const modePreset = PROPOSAL_MODE_PRESETS[proposalMode] || PROPOSAL_MODE_PRESETS.direta;
  const dataValidade = firstFilledText(
    comercial?.data_validade,
    detalhes?.data_validade,
    formatDateBr(record?.validade_ate),
    ''
  );
  const valorBase = Number(
    options?.priceReference
    || record?.preco_final
    || record?.valor_sugerido
    || record?.preco_base
    || 0
  );
  const quantidadePadrao = pickStoredOrLive(
    comercial?.quantidade,
    record?.quantidade,
    modePreset.quantidade
  );
  const quantityNumber = parseQuantityNumber(
    pickStoredOrLive(
      comercial?.quantidade,
      record?.quantidade,
      comercial?.opcao1_qtd,
      modePreset.quantidade
    ),
    10
  );
  const defaultValor = fmtBRL(valorBase || quantityNumber * 170);
  const optionDefaults = buildAutoOptionDraft({
    orc: record,
    quantityText: quantidadePadrao,
    totalText: defaultValor,
    pricingRules,
  });
  const escopoDefault = buildCommercialScopeText(
    record,
    firstFilledText(comercial?.revisoes_inclusas, detalhes?.revisoes_inclusas, '1 rodada')
  );
  const referencia = firstFilledText(
    record?.referencia,
    comercial?.referencia_texto,
    detalhes?.referencia,
    respostas?.flow_referencia,
    respostas?.unica_referencia,
    respostas?.rec_referencia,
    respostas?.referencia
  );
  const empresa = firstFilledText(
    comercial?.empresa,
    detalhes?.empresa,
    respostas?.empresa,
    record?.empresa
  );
  const instagram = firstFilledText(
    comercial?.instagram,
    detalhes?.instagram,
    respostas?.instagram,
    record?.instagram
  );
  const email = firstFilledText(
    comercial?.email_cliente,
    comercial?.email,
    detalhes?.email_cliente,
    detalhes?.email,
    respostas?.email_cliente,
    respostas?.email,
    record?.email
  );
  const observacaoAdicional = firstFilledText(
    comercial?.observacao_adicional,
    pickClientObservationText(
      detalhes?.observacao_adicional,
      respostas?.extras,
      record?.observacoes,
      ''
    )
  );
  const prazo = pickStoredOrLive(
    comercial?.prazo,
    record?.prazo,
    respostas?.flow_prazo,
    respostas?.unica_prazo,
    respostas?.rec_inicio,
    respostas?.recorrente_prazo,
    modePreset.prazo
  );
  const condicoesComerciaisDefault = DEFAULT_CONDICOES_COMERCIAIS.replace('[data]', dataValidade || '[data]');
  const valorMensalPadrao = pickStoredOrLive(
    comercial?.valor_mensal_moeda,
    defaultValor,
    proposalMode === 'mensal' ? defaultValor : ''
  );
  const valorPersonalizadoPadrao = pickStoredOrLive(
    comercial?.valor_personalizado_moeda,
    defaultValor,
    proposalMode === 'personalizada' ? defaultValor : ''
  );
  const escopoMensalPadrao = firstFilledText(
    proposalMode === 'mensal' ? escopoDefault : '',
    proposalMode === 'mensal' ? modePreset.escopo_comercial : ''
  );

  return {
    cliente_nome: normalizeText(pickStoredOrLive(
      firstFilledText(comercial?.cliente_nome, comercial?.nome_cliente),
      record?.nome
    )),
    whatsapp: normalizeText(pickStoredOrLive(comercial?.whatsapp, record?.whatsapp)),
    empresa: normalizeText(pickStoredOrLive(comercial?.empresa, empresa)),
    instagram: normalizeText(pickStoredOrLive(comercial?.instagram, instagram)),
    email_cliente: normalizeText(pickStoredOrLive(comercial?.email_cliente || comercial?.email, email)),
    servico_principal: normalizeText(pickStoredOrLive(
      comercial?.servico_principal,
      record?.servico,
      modePreset.servico_principal
    )),
    quantidade: normalizeText(quantidadePadrao),
    quantidade_mensal: normalizeText(pickStoredOrLive(
      comercial?.quantidade_mensal,
      proposalMode === 'mensal' ? quantidadePadrao : '',
      proposalMode === 'mensal' ? quantidadePadrao : '',
      modePreset.quantidade_mensal
    )),
    prazo: normalizePrazoLabel(prazo, modePreset.prazo || 'Sem prazo definido'),
    escopo_comercial: normalizeText(pickStoredOrLive(
      comercial?.escopo_comercial,
      escopoDefault,
      comercial?.descricao_escopo,
      modePreset.escopo_comercial
    )),
    escopo_mensal: normalizeText(pickStoredOrLive(
      comercial?.escopo_mensal,
      escopoMensalPadrao,
      proposalMode === 'mensal' ? comercial?.escopo_comercial : '',
      proposalMode === 'mensal' ? modePreset.escopo_comercial : ''
    )),
    condicoes_comerciais: normalizeText(firstFilledText(comercial?.condicoes_comerciais, condicoesComerciaisDefault)),
    referencia_texto: normalizeText(pickStoredOrLive(comercial?.referencia_texto, referencia)),
    observacao_adicional: normalizeText(observacaoAdicional),
    valor_total_moeda: normalizeText(pickStoredOrLive(comercial?.valor_total_moeda, defaultValor)),
    valor_mensal_moeda: normalizeText(valorMensalPadrao),
    valor_personalizado_moeda: normalizeText(valorPersonalizadoPadrao),
    forma_pagamento: normalizeText(comercial?.forma_pagamento || 'PIX / Transferencia / Conforme combinado'),
    data_validade: normalizeText(dataValidade),
    duracao_contrato_meses: normalizeText(firstFilledText(
      comercial?.duracao_contrato_meses,
      proposalMode === 'mensal' ? modePreset.duracao_contrato_meses : ''
    )),
    numero_proposta: normalizeText(comercial?.numero_proposta || `PROP-${record?.id || ''}`),
    data_emissao: normalizeText(comercial?.data_emissao || ''),
    cta_aprovacao: normalizeText(comercial?.cta_aprovacao || 'Aprovar proposta no WhatsApp'),
    opcao1_titulo: normalizeText(pickStoredOrLive(comercial?.opcao1_titulo, optionDefaults.opcao1_titulo)),
    opcao1_qtd: normalizeText(pickStoredOrLive(comercial?.opcao1_qtd, optionDefaults.opcao1_qtd)),
    opcao1_preco: normalizeText(pickStoredOrLive(comercial?.opcao1_preco, optionDefaults.opcao1_preco)),
    opcao1_unitario: normalizeText(pickStoredOrLive(comercial?.opcao1_unitario, optionDefaults.opcao1_unitario)),
    opcao1_desc: normalizeText(pickStoredOrLive(comercial?.opcao1_desc, optionDefaults.opcao1_desc)),
    opcao1_desconto: normalizeText(pickStoredOrLive(comercial?.opcao1_desconto, optionDefaults.opcao1_desconto)),
    opcao2_titulo: normalizeText(pickStoredOrLive(comercial?.opcao2_titulo, optionDefaults.opcao2_titulo)),
    opcao2_qtd: normalizeText(pickStoredOrLive(comercial?.opcao2_qtd, optionDefaults.opcao2_qtd)),
    opcao2_preco: normalizeText(pickStoredOrLive(comercial?.opcao2_preco, optionDefaults.opcao2_preco)),
    opcao2_unitario: normalizeText(pickStoredOrLive(comercial?.opcao2_unitario, optionDefaults.opcao2_unitario)),
    opcao2_desc: normalizeText(pickStoredOrLive(comercial?.opcao2_desc, optionDefaults.opcao2_desc)),
    opcao2_desconto: normalizeText(pickStoredOrLive(comercial?.opcao2_desconto, optionDefaults.opcao2_desconto)),
    opcao3_titulo: normalizeText(pickStoredOrLive(comercial?.opcao3_titulo, optionDefaults.opcao3_titulo)),
    opcao3_qtd: normalizeText(pickStoredOrLive(comercial?.opcao3_qtd, optionDefaults.opcao3_qtd)),
    opcao3_preco: normalizeText(pickStoredOrLive(comercial?.opcao3_preco, optionDefaults.opcao3_preco)),
    opcao3_unitario: normalizeText(pickStoredOrLive(comercial?.opcao3_unitario, optionDefaults.opcao3_unitario)),
    opcao3_desc: normalizeText(pickStoredOrLive(comercial?.opcao3_desc, optionDefaults.opcao3_desc)),
    opcao3_desconto: normalizeText(pickStoredOrLive(comercial?.opcao3_desconto, optionDefaults.opcao3_desconto)),
    texto_comparativo: normalizeText(pickStoredOrLive(comercial?.texto_comparativo, optionDefaults.texto_comparativo || '')),
  };
}

function buildTemplateOverridesFromDraft(draft = {}) {
  return Object.fromEntries(
    PROPOSAL_DRAW_FIELDS
      .map((field) => [field, normalizeText(draft?.[field])])
      .filter(([, value]) => Boolean(value))
  );
}

function readPropostaPdfMeta(record) {
  const detalhes = parseDetalhes(record?.detalhes);
  const comercial = parseDetalhes(detalhes?.comercial);
  const renderMode = String(
    comercial?.proposta_pdf_render_mode
    || record?.render_mode
    || ''
  ).trim();
  const pdfEngine = String(
    comercial?.proposta_pdf_engine
    || record?.pdf_engine
    || ''
  ).trim();
  const fallbackRaw = comercial?.proposta_pdf_fallback_used;
  const fallbackByRawValue = (
    fallbackRaw === true
    || String(fallbackRaw || '').toLowerCase() === 'true'
    || String(fallbackRaw || '') === '1'
  );
  const fallbackByModeOrEngine = (
    renderMode === 'native_text_fallback'
    || !pdfEngine
    || pdfEngine === 'native_text'
  );
  return {
    renderMode,
    pdfEngine,
    pdfFallbackUsed: fallbackByRawValue || fallbackByModeOrEngine,
    fallbackReason: String(comercial?.proposta_pdf_fallback_reason || '').trim(),
    fallbackFrom: String(comercial?.proposta_pdf_fallback_from || '').trim(),
  };
}

function isHtmlPdfReady(meta) {
  const renderMode = String(meta?.renderMode || '').trim();
  const pdfEngine = String(meta?.pdfEngine || '').trim();
  const fallbackUsed = Boolean(meta?.pdfFallbackUsed);
  if (!pdfEngine) return false;
  if (pdfEngine === 'native_text') return false;
  if (!renderMode || renderMode === 'native_text_fallback') return false;
  if (fallbackUsed) return false;
  return true;
}

function getPdfEngineBlockedMessage(meta) {
  const renderMode = String(meta?.renderMode || '').trim();
  const pdfEngine = String(meta?.pdfEngine || '').trim();
  const fallbackUsed = Boolean(meta?.pdfFallbackUsed);
  if (!pdfEngine) {
    return 'PDF bloqueado para uso comercial: engine HTML/CSS nao detectada. Configure PDF_ENGINE + BROWSERLESS_TOKEN (ou PDFSHIFT_API_KEY) no deploy.';
  }
  if (renderMode === 'native_text_fallback' || pdfEngine === 'native_text' || fallbackUsed) {
    return 'PDF bloqueado para uso comercial: documento gerado em modo fallback/texto. Ative engine HTML real no deploy e gere novamente.';
  }
  return '';
}

async function openOrDownloadPropostaPdf(link, fileName = 'proposta-hagav.pdf') {
  if (typeof window === 'undefined' || !link) return 'none';

  try {
    const response = await fetch(link, { method: 'GET' });
    if (!response.ok) throw new Error(`download_http_${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    return 'download';
  } catch {
    const popup = window.open(link, '_blank', 'noopener,noreferrer');
    if (popup) return 'new_tab';
    window.location.href = link;
    return 'same_tab';
  }
}

function downloadPdfFromBase64(base64, fileName = 'proposta-hagav.pdf') {
  if (typeof window === 'undefined' || !base64) return false;
  try {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      arr[i] = bytes.charCodeAt(i);
    }
    const blob = new Blob([arr], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    return true;
  } catch {
    return false;
  }
}

export default function OrcamentoDrawer({ orc, onClose, onUpdated }) {
  const initialStoredSuggested = Number(orc?.valor_sugerido ?? orc?.preco_base ?? 0);
  const initialFinalPrice = Number(orc?.preco_final ?? initialStoredSuggested ?? 0);
  const [statusOrc, setStatusOrc] = useState(orc?.status_orcamento ?? 'orcamento');
  const [precoFinal, setPrecoFinal] = useState(initialFinalPrice);
  const [precoFinalTouched, setPrecoFinalTouched] = useState(() => Math.abs(initialFinalPrice - initialStoredSuggested) > 0.009);
  const [obsInternas, setObsInternas] = useState(orc?.observacoes_internas ?? '');
  const [urgencia, setUrgencia] = useState(orc?.urgencia ?? 'media');
  const [prioridade, setPrioridade] = useState(orc?.prioridade ?? 'media');
  const [proximaAcao, setProximaAcao] = useState(orc?.proxima_acao ?? '');
  const [responsavel, setResponsavel] = useState(orc?.responsavel ?? '');
  const [followup, setFollowup] = useState(toDateTimeLocal(orc?.proximo_followup_em));
  const [referenceExpanded, setReferenceExpanded] = useState(false);
  const [obsExpanded, setObsExpanded] = useState(false);
  const [propostaLink, setPropostaLink] = useState(String(orc?.link_pdf || '').trim());
  const [propostaGeradaEm, setPropostaGeradaEm] = useState(orc?.proposta_gerada_em || null);
  const [propostaPdfMeta, setPropostaPdfMeta] = useState(() => readPropostaPdfMeta(orc));
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pricingRules, setPricingRules] = useState(() => normalizePricingRules(COMMERCIAL_DEFAULTS.pricing));
  const [pricingRulesLoading, setPricingRulesLoading] = useState(true);
  const [pricingItems, setPricingItems] = useState(() => buildInitialPricingItems(orc, COMMERCIAL_DEFAULTS.pricing));
  const [proposalMode, setProposalMode] = useState(() => {
    const detalhes = parseDetalhes(orc?.detalhes);
    const comercial = parseDetalhes(detalhes?.comercial);
    return normalizeProposalMode(comercial?.proposta_modo || comercial?.proposal_mode || '')
      || inferProposalModeFromFlow(orc, 'direta');
  });
  const [proposalDirtyFields, setProposalDirtyFields] = useState(() => buildSavedProposalDirtyMap(orc));
  const [showLiveProposalPreview, setShowLiveProposalPreview] = useState(false);
  const adaptivePanel = useAdaptivePanelWidth({
    storageKey: showLiveProposalPreview
      ? 'hagav-drawer-orcamento-preview'
      : 'hagav-drawer-orcamento',
    widths: showLiveProposalPreview
      ? { base: 1180, large: 1360, ultrawide: 1560 }
      : { base: 780, large: 920, ultrawide: 1080 },
    minWidth: showLiveProposalPreview ? 1040 : 720,
    maxWidth: showLiveProposalPreview ? 1660 : 1160,
  });
  const [proposalContactCollapsed, setProposalContactCollapsed] = useState(false);
  const [operationCollapsed, setOperationCollapsed] = useState(false);
  const [proposalDraft, setProposalDraft] = useState(() => buildProposalDraftFromRecord(orc, undefined, {
    pricingRules: COMMERCIAL_DEFAULTS.pricing,
    priceReference: initialFinalPrice,
  }));

  if (!orc) return null;
  const pricingRecord = useMemo(() => ({
    ...orc,
    itens_servico: pricingItems,
    servico: pricingItems.map((item) => normalizeText(item?.servico)).filter(Boolean).join(' | ') || orc?.servico || '',
    quantidade: summarizeDraftField(pricingItems, (item) => item?.quantidade, orc?.quantidade),
    material_gravado: summarizeDraftField(pricingItems, (item) => item?.material_gravado, orc?.material_gravado),
    tempo_bruto: summarizeDraftField(
      pricingItems,
      (item) => item?.horas_estimadas || item?.tempo_bruto || formatDurationCompact(parseDurationToHours(item?.horas_estimadas || item?.tempo_bruto, 0)),
      orc?.tempo_bruto
    ),
    prazo: normalizePrazoLabel(getFirstItemValue(pricingItems, 'prazo', orc?.prazo), 'Sem prazo definido'),
    referencia: getFirstItemValue(pricingItems, 'referencia', orc?.referencia),
  }), [orc, pricingItems]);
  const parsedPrecoFinal = Number(precoFinal || 0);
  const autoPricing = useMemo(
    () => computePricingSnapshot(pricingRecord, pricingRules),
    [pricingRecord, pricingRules]
  );
  const financialMetrics = useMemo(
    () => deriveFinancialMetricsFromFinalPrice(pricingRecord, parsedPrecoFinal, pricingRules),
    [parsedPrecoFinal, pricingRecord, pricingRules]
  );
  const itensServico = Array.isArray(autoPricing?.itensServico) && autoPricing.itensServico.length > 0
    ? autoPricing.itensServico
    : pricingItems;
  const proposalRecord = useMemo(() => ({
    ...pricingRecord,
    servico: pricingItems.map((item) => normalizeText(item?.servico)).filter(Boolean).join(' | ') || pricingRecord?.servico || orc?.servico || '',
    quantidade: pricingItems.length > 1
      ? `${Number(autoPricing?.totalQuantidade || pricingItems.length || 1)} itens`
      : summarizeDraftField(pricingItems, (item) => item?.quantidade, orc?.quantidade),
    prazo: normalizePrazoLabel(getFirstItemValue(pricingItems, 'prazo', pricingRecord?.prazo || orc?.prazo), 'Sem prazo definido'),
    referencia: pricingItems.length > 1
      ? summarizeDraftField(pricingItems, (item) => item?.referencia, pricingRecord?.referencia || orc?.referencia)
      : getFirstItemValue(pricingItems, 'referencia', pricingRecord?.referencia || orc?.referencia),
    preco_base: Number(autoPricing?.precoBase || orc?.preco_base || 0),
    valor_sugerido: Number(autoPricing?.valorSugerido || orc?.valor_sugerido || 0),
    preco_final: parsedPrecoFinal > 0 ? parsedPrecoFinal : Number(autoPricing?.precoFinal || orc?.preco_final || 0),
  }), [autoPricing, orc, parsedPrecoFinal, pricingItems, pricingRecord]);
  const pricingServiceOptions = useMemo(() => {
    const officialOptions = getCommercialServiceOptions(pricingRules);
    const knownLabels = new Set(officialOptions.map((option) => normalizeText(option.label).toLowerCase()));
    const legacyOptions = pricingItems
      .map((item) => normalizeText(item?.servico))
      .filter((label) => label && !knownLabels.has(label.toLowerCase()))
      .filter((label, index, list) => list.indexOf(label) === index)
      .map((label) => ({
        key: `legacy:${label}`,
        label,
        presetDuration: '',
      }));
    return [...legacyOptions, ...officialOptions];
  }, [pricingItems, pricingRules]);
  const defaultPricingServiceLabel = pricingServiceOptions[0]?.label || getDefaultCommercialServiceLabel(pricingRules);
  const autoProposalDraft = useMemo(
    () => buildProposalDraftFromRecord(proposalRecord, proposalMode, {
      pricingRules,
      preferLiveRecord: true,
      priceReference: parsedPrecoFinal > 0 ? parsedPrecoFinal : Number(autoPricing?.precoFinal || 0),
    }),
    [autoPricing?.precoFinal, parsedPrecoFinal, pricingRules, proposalMode, proposalRecord]
  );
  const serviceNames = [
    ...new Set(
      [
        ...itensServico.map((item) => normalizeText(item?.servico)),
        ...normalizeText(orc.servico)
          .split('|')
          .map((part) => normalizeText(part))
      ].filter(Boolean)
    )
  ];
  const hasMultipleServices = serviceNames.length > 1;

  const cleanSingleServiceField = (value) => {
    const raw = normalizeText(value);
    if (!raw) return '';
    if (hasMultipleServices) return raw;
    return removeServicePrefix(raw, serviceNames);
  };

  const servicoResumo = itensServico.length > 0
    ? itensServico.map((item) => item?.servico).filter(Boolean).join(' | ')
    : (proposalRecord.servico || orc.servico || '');
  const quantidadeResumo = itensServico.length > 0
    ? (
      itensServico.length === 1
        ? normalizeText(itensServico[0]?.quantidade || '-')
        : itensServico.map((item) => `${item?.servico || 'Servico'}: ${item?.quantidade || '-'}`).join(' | ')
    )
    : cleanSingleServiceField(proposalRecord.quantidade || orc.quantidade || '');
  const materialResumo = itensServico.length > 0
    ? summarizeDraftField(itensServico, (item) => item?.material_gravado, orc.material_gravado)
    : cleanSingleServiceField(orc.material_gravado);
  const tempoResumo = itensServico.length > 0
    ? summarizeDraftField(
      itensServico,
      (item) => item?.horas_estimadas || item?.tempo_bruto || formatDurationCompact(Number(item?.horas_por_unidade || 0)),
      orc.tempo_bruto
    )
    : cleanSingleServiceField(orc.tempo_bruto);
  const referenciaResumo = itensServico.length > 0
    ? summarizeDraftField(itensServico, (item) => item?.referencia, orc.referencia)
    : cleanSingleServiceField(orc.referencia);
  const referenceText = referenciaResumo || '—';
  const referenceUrl = extractReferenceUrl(referenceText);
  const canExpandReference = referenceText.length > 84 || Boolean(referenceUrl);
  const referencePreview = !referenceExpanded && referenceText.length > 84
    ? `${referenceText.slice(0, 84)}...`
    : referenceText;
  const observacoesText = normalizeText(orc.observacoes || '');
  const canExpandObs = observacoesText.length > 220;
  const observacoesPreview = !obsExpanded && canExpandObs
    ? `${observacoesText.slice(0, 220)}...`
    : observacoesText;
  const statusOptions = Array.from(new Set([...ORC_STATUSES, statusOrc || 'orcamento']));
  const canApproveOrcamento = ['orcamento', 'proposta_enviada', 'ajustando'].includes(String(statusOrc || '').toLowerCase());
  const hasWhatsapp = Boolean(normalizeText(orc.whatsapp));
  const propostaPdfLiberada = isHtmlPdfReady(propostaPdfMeta);
  const hasPropostaGerada = Boolean(propostaLink) || Boolean(propostaGeradaEm);
  const propostaPdfBlockedMessage = getPdfEngineBlockedMessage(propostaPdfMeta);
  const showPropostaPdfBlockedWarning = hasPropostaGerada && !propostaPdfLiberada;
  const canSendProposta = Boolean(propostaLink) && propostaPdfLiberada && hasWhatsapp;
  const marginStatus = financialMetrics.margem_status || autoPricing.margemStatus || null;
  const proposalPreview = useMemo(
    () => buildProposalPreviewModel({
      orc: proposalRecord,
      proposalMode,
      proposalDraft,
    }),
    [proposalDraft, proposalMode, proposalRecord]
  );

  function buildProposalDraftForMode(mode, currentDraft = proposalDraft) {
    const normalizedMode = normalizeProposalMode(mode) || inferProposalModeFromFlow(proposalRecord, 'direta');
    const preset = PROPOSAL_MODE_PRESETS[normalizedMode] || PROPOSAL_MODE_PRESETS.direta;
    const next = {
      ...buildProposalDraftFromRecord(proposalRecord, normalizedMode, {
        pricingRules,
        preferLiveRecord: true,
        priceReference: parsedPrecoFinal > 0 ? parsedPrecoFinal : Number(autoPricing?.precoFinal || 0),
      }),
      ...(currentDraft && typeof currentDraft === 'object' ? currentDraft : {}),
    };
    const valueReference = parseCurrencyNumber(
      next.valor_total_moeda,
      Number(financialMetrics.preco_final || autoPricing?.valorSugerido || proposalRecord?.preco_final || proposalRecord?.preco_base || 0)
    );

    if (normalizedMode === 'opcoes') {
      Object.assign(next, buildAutoOptionDraft({
        orc: proposalRecord,
        quantityText: next.quantidade,
        totalText: next.valor_total_moeda,
        pricingRules,
      }));
    }

    if (normalizedMode === 'mensal') {
      next.quantidade_mensal = next.quantidade_mensal || next.quantidade || preset.quantidade_mensal;
      next.duracao_contrato_meses = next.duracao_contrato_meses || preset.duracao_contrato_meses || '3';
      next.escopo_mensal = next.escopo_mensal || next.escopo_comercial || buildCommercialScopeText(proposalRecord);
      next.valor_mensal_moeda = next.valor_mensal_moeda || next.valor_total_moeda || fmtBRL(valueReference || 0);
    }

    if (normalizedMode === 'personalizada') {
      next.valor_personalizado_moeda = next.valor_personalizado_moeda || next.valor_total_moeda || fmtBRL(valueReference || 0);
    }

    next.servico_principal = next.servico_principal || preset.servico_principal;
    next.quantidade = next.quantidade || preset.quantidade;
    next.prazo = next.prazo || preset.prazo;
    next.escopo_comercial = next.escopo_comercial || preset.escopo_comercial;
    return next;
  }

  function buildProposalDraftCommercialState() {
    const values = {};
    PROPOSAL_DRAW_FIELDS.forEach((field) => {
      values[field] = normalizeText(proposalDraft?.[field]);
    });
    return {
      proposal_mode: proposalMode,
      proposta_modo: proposalMode,
      proposta_ultima_edicao_em: new Date().toISOString(),
      ...values,
    };
  }

  function buildProposalTemplateOverrides() {
    const mode = normalizeProposalMode(proposalMode) || inferProposalModeFromFlow(proposalRecord, 'direta');
    const nextDraft = {
      ...proposalDraft,
    };
    const validade = normalizeText(nextDraft.data_validade || '[data]');
    if (!normalizeText(nextDraft.condicoes_comerciais)) {
      nextDraft.condicoes_comerciais = DEFAULT_CONDICOES_COMERCIAIS.replace('[data]', validade);
    }

    if (mode === 'mensal') {
      const valorMensal = normalizeText(nextDraft.valor_mensal_moeda || nextDraft.valor_total_moeda);
      if (valorMensal) {
        nextDraft.valor_total_moeda = /\/m[eê]s/i.test(valorMensal)
          ? valorMensal
          : `${valorMensal}/mês`;
      }
      nextDraft.quantidade_mensal = normalizeText(nextDraft.quantidade_mensal || nextDraft.quantidade);
    }

    if (mode === 'personalizada') {
      const valorCustom = normalizeText(nextDraft.valor_personalizado_moeda || nextDraft.valor_total_moeda);
      if (valorCustom) nextDraft.valor_total_moeda = valorCustom;
    }

    return buildTemplateOverridesFromDraft(nextDraft);
  }

  function syncPreviewDraft(modeValue, draftValue, previewValue) {
    if (typeof window === 'undefined') return;
    const safeMode = normalizeProposalMode(modeValue) || inferProposalModeFromFlow(proposalRecord, 'direta');
    const payload = {
      mode: safeMode,
      source: 'orcamento_drawer',
      deal_id: orc?.id,
      draft: draftValue,
      preview: previewValue,
      updated_at: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    try {
      window.sessionStorage.setItem('hagav_proposta_preview_draft', serialized);
      window.localStorage.setItem('hagav_proposta_preview_draft_live', serialized);
      if (typeof window.BroadcastChannel === 'function') {
        const channel = new window.BroadcastChannel('hagav_proposta_preview');
        channel.postMessage(payload);
        channel.close();
      }
    } catch (err) {
      console.warn('[Orcamentos][PDF][PreviewSync]', err);
    }
  }

  function updatePricingItem(index, field, value) {
    setPricingItems((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === 'servico') {
        const servicePreset = getCommercialServicePreset(value, pricingRules);
        const nextService = normalizeText(servicePreset?.label || value || defaultPricingServiceLabel) || defaultPricingServiceLabel;
        const nextDuration = normalizeText(servicePreset?.presetDuration || '');
        return {
          ...item,
          servico: nextService,
          horas_estimadas: nextDuration,
          tempo_bruto: nextDuration,
        };
      }
      if (field === 'horas_estimadas' || field === 'tempo_bruto') {
        return {
          ...item,
          horas_estimadas: value,
          tempo_bruto: value,
        };
      }
      if (field === 'prazo') {
        return {
          ...item,
          prazo: normalizePrazoLabel(value, defaultPricingServiceLabel ? 'Em até 7 dias' : ''),
        };
      }
      return {
        ...item,
        [field]: value,
      };
    }));
  }

  function addPricingItem() {
    const seed = pricingItems[pricingItems.length - 1] || pricingItems[0] || {};
    const seedService = normalizeText(seed?.servico || defaultPricingServiceLabel) || defaultPricingServiceLabel;
    setPricingItems((prev) => [
      ...prev,
      normalizePricingItemDraft({
        servico: seedService,
        quantidade: '1',
        material_gravado: seed.material_gravado || 'Sim',
        prazo: normalizePrazoLabel(seed.prazo || proposalRecord?.prazo || '', 'Sem prazo definido'),
        referencia: seed.referencia || proposalRecord?.referencia || '',
        horas_estimadas: '',
        tempo_bruto: '',
      }, proposalRecord, pricingRules),
    ]);
  }

  function removePricingItem(index) {
    setPricingItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function applyProposalMode(mode) {
    const normalizedMode = normalizeProposalMode(mode) || inferProposalModeFromFlow(proposalRecord, 'direta');
    setProposalMode(normalizedMode);
    setProposalDirtyFields({});
    setProposalDraft(buildProposalDraftForMode(normalizedMode, {}));
  }

  function updateProposalDraftField(field, value) {
    setProposalDirtyFields((prev) => ({ ...prev, [field]: true }));
    setProposalDraft((prev) => {
      const nextValue = field === 'prazo'
        ? normalizePrazoLabel(value, 'Sem prazo definido')
        : value;
      const nextDraft = {
        ...prev,
        [field]: nextValue,
      };
      if (proposalMode === 'opcoes' && ['quantidade', 'valor_total_moeda'].includes(field)) {
        Object.assign(nextDraft, buildAutoOptionDraft({
          orc: proposalRecord,
          quantityText: field === 'quantidade' ? nextValue : nextDraft.quantidade,
          totalText: field === 'valor_total_moeda' ? nextValue : nextDraft.valor_total_moeda,
          pricingRules,
        }));
      }
      return nextDraft;
    });
  }

  function hydrateProposalDraft() {
    setError('');
    setProposalDirtyFields({});
    const nextDraft = buildProposalDraftForMode(proposalMode, {});
    setProposalDraft(nextDraft);
    setInfo('Campos da proposta preenchidos automaticamente com os dados do orçamento.');
  }

  function buildFinancialPersistencePatch(finalPriceOverride = null) {
    const detalhesAtual = parseDetalhes(orc?.detalhes);
    const comercialAtual = parseDetalhes(detalhesAtual?.comercial);
    const nowIso = new Date().toISOString();
    const proposalState = buildProposalDraftCommercialState();
    const finalPriceValue = Number(
      finalPriceOverride
      ?? financialMetrics.preco_final
      ?? autoPricing.precoFinal
      ?? 0
    ) || 0;
    const itemDrafts = Array.isArray(autoPricing?.itensServico) && autoPricing.itensServico.length > 0
      ? autoPricing.itensServico
      : pricingItems;
    const calculationSnapshot = {
      ...autoPricing,
      precoFinalEditado: finalPriceValue,
      margemComercial: Number(financialMetrics.margem_percentual || 0),
      lucroComercial: Number(financialMetrics.lucro_estimado || 0),
      margemStatus: financialMetrics.margem_status || autoPricing.margemStatus || null,
      itensServico: itemDrafts,
      atualizado_em: nowIso,
    };

    return {
      preco_base: Number(autoPricing.precoBase || 0),
      valor_sugerido: Number(autoPricing.valorSugerido || 0),
      preco_final: finalPriceValue,
      valor_estimado: Number(financialMetrics.valor_estimado || autoPricing.valorEstimado || 0),
      margem_estimada: Number(autoPricing.margemEstimada || 0),
      faixa_sugerida: String(autoPricing.faixaSugerida || ''),
      desconto_volume_percent: Number(autoPricing.descontoVolumePercent || 0),
      multiplicador_urgencia: Number(autoPricing.multiplicadorUrgencia || 0),
      multiplicador_complexidade: Number(autoPricing.multiplicadorComplexidade || 0),
      complexidade_nivel: String(autoPricing.complexidadeNivel || ''),
      ajuste_referencia_percent: Number(autoPricing.ajusteReferenciaPercent || 0),
      ajuste_multicamera_percent: Number(autoPricing.ajusteMulticameraPercent || 0),
      revisao_manual: Boolean(autoPricing.revisaoManual),
      alerta_capacidade: Boolean(autoPricing.alertaCapacidade),
      operacao_especial: Boolean(autoPricing.operacaoEspecial),
      pacote_sugerido: String(autoPricing.pacoteSugerido || ''),
      motivo_calculo: String(autoPricing.motivoCalculo || ''),
      detalhes: {
        ...detalhesAtual,
        calculoAutomatico: calculationSnapshot,
        comercial: {
          ...comercialAtual,
          ...proposalState,
          pricing_rule_version: Number(autoPricing.pricingRuleVersion || 0),
          margem_automatica: Number(autoPricing.margemEstimada || 0),
          margem_percentual: Number(financialMetrics.margem_percentual || 0),
          margem_comercial: Number(financialMetrics.margem_percentual || 0),
          lucro_estimado: Number(financialMetrics.lucro_estimado || 0),
          potencial_total: Number(financialMetrics.potencial_total || financialMetrics.valor_estimado || autoPricing.valorEstimado || 0),
          custo_real: Number(autoPricing.custoReal || autoPricing.custoEstimado || 0),
          preco_base: Number(autoPricing.precoBase || 0),
          valor_sugerido: Number(autoPricing.valorSugerido || 0),
          preco_final: finalPriceValue,
          pacote_sugerido: String(autoPricing.pacoteSugerido || ''),
          atualizado_em: nowIso,
        },
      },
    };
  }

  useEffect(() => {
    let active = true;
    async function loadPricingRules() {
      setPricingRulesLoading(true);
      try {
        const settings = await fetchCommercialSettings();
        if (!active) return;
        setPricingRules(normalizePricingRules(settings?.pricing || COMMERCIAL_DEFAULTS.pricing));
      } catch (err) {
        console.warn('[Orcamentos][PricingSettings]', err);
        if (active) {
          setPricingRules(normalizePricingRules(COMMERCIAL_DEFAULTS.pricing));
        }
      } finally {
        if (active) setPricingRulesLoading(false);
      }
    }

    loadPricingRules();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setStatusOrc(orc?.status_orcamento ?? 'orcamento');
    const nextStoredSuggested = Number(orc?.valor_sugerido ?? orc?.preco_base ?? 0);
    const nextFinalPrice = Number(orc?.preco_final ?? nextStoredSuggested ?? 0);
    setPrecoFinal(nextFinalPrice);
    setPrecoFinalTouched(Math.abs(nextFinalPrice - nextStoredSuggested) > 0.009);
    setObsInternas(orc?.observacoes_internas ?? '');
    setUrgencia(orc?.urgencia ?? 'media');
    setPrioridade(orc?.prioridade ?? 'media');
    setProximaAcao(orc?.proxima_acao ?? '');
    setResponsavel(orc?.responsavel ?? '');
    setFollowup(toDateTimeLocal(orc?.proximo_followup_em));
    setPropostaLink(String(orc?.link_pdf || '').trim());
    setPropostaGeradaEm(orc?.proposta_gerada_em || null);
    setPropostaPdfMeta(readPropostaPdfMeta(orc));
    const detalhes = parseDetalhes(orc?.detalhes);
    const comercial = parseDetalhes(detalhes?.comercial);
    const nextMode = normalizeProposalMode(comercial?.proposta_modo || comercial?.proposal_mode || '')
      || inferProposalModeFromFlow(orc, 'direta');
    const nextDraft = buildProposalDraftFromRecord(orc, nextMode, {
      pricingRules: COMMERCIAL_DEFAULTS.pricing,
      priceReference: nextFinalPrice,
    });
    setPricingItems(buildInitialPricingItems(orc, COMMERCIAL_DEFAULTS.pricing));
    setProposalDirtyFields(buildSavedProposalDirtyMap(orc));
    setShowLiveProposalPreview(false);
    setProposalContactCollapsed(false);
    setOperationCollapsed(false);
    setProposalMode(nextMode);
    setProposalDraft(nextDraft);
  }, [
    orc?.id,
    orc?.status_orcamento,
    orc?.preco_final,
    orc?.observacoes_internas,
    orc?.urgencia,
    orc?.prioridade,
    orc?.proxima_acao,
    orc?.responsavel,
    orc?.proximo_followup_em,
    orc?.link_pdf,
    orc?.proposta_gerada_em,
    orc?.detalhes,
  ]);

  useEffect(() => {
    setProposalDraft((prev) => {
      const current = prev && typeof prev === 'object' ? prev : {};
      const nextDraft = { ...current };
      let changed = false;

      AUTO_SYNC_PROPOSAL_FIELDS.forEach((field) => {
        if (proposalDirtyFields[field]) return;
        const desired = normalizeText(autoProposalDraft?.[field] || '');
        if (normalizeText(nextDraft[field]) !== desired) {
          nextDraft[field] = desired;
          changed = true;
        }
      });

      return changed ? nextDraft : prev;
    });
  }, [autoProposalDraft, proposalDirtyFields]);

  useEffect(() => {
    if (precoFinalTouched) return;
    const suggested = Number(autoPricing?.precoFinal || autoPricing?.valorSugerido || 0);
    if (!Number.isFinite(suggested) || suggested <= 0) return;
    setPrecoFinal((current) => {
      const currentNumber = Number(current || 0);
      return Math.abs(currentNumber - suggested) > 0.009 ? suggested : current;
    });
  }, [autoPricing?.precoFinal, autoPricing?.valorSugerido, precoFinalTouched]);

  useEffect(() => {
    syncPreviewDraft(proposalMode, proposalDraft, proposalPreview);
  }, [orc?.id, proposalMode, proposalDraft, proposalPreview]);

  async function handleSaveProposalDraft() {
    setDraftSaving(true);
    setError('');
    setInfo('');
    try {
      const updated = await updateOrcamento(orc.id, buildFinancialPersistencePatch());
      onUpdated?.(updated);
      setPrecoFinal(updated?.preco_final ?? Number(financialMetrics.preco_final || 0));
      setInfo('Rascunho da proposta salvo no orçamento.');
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar rascunho da proposta.');
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento: statusOrc,
        ...buildFinancialPersistencePatch(),
        observacoes_internas: obsInternas,
        urgencia,
        prioridade,
        proxima_acao: proximaAcao,
        responsavel,
        proximo_followup_em: fromDateTimeLocal(followup),
      });
      onUpdated?.(updated);
      setPrecoFinal(updated?.preco_final ?? Number(financialMetrics.preco_final || 0));
      setPrecoFinalTouched(
        Math.abs(
          Number(updated?.preco_final ?? 0) - Number(updated?.valor_sugerido ?? autoPricing?.valorSugerido ?? 0)
        ) > 0.009
      );
      setInfo('Orcamento salvo com campos financeiros atualizados.');
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(nextStatus) {
    setStatusOrc(nextStatus);
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento: nextStatus,
        ...buildFinancialPersistencePatch(),
        observacoes_internas: obsInternas,
        urgencia,
        prioridade,
        proxima_acao: proximaAcao,
        responsavel,
        proximo_followup_em: fromDateTimeLocal(followup),
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao atualizar status.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf() {
    setPdfLoading(true);
    setError('');
    setInfo('Gerando proposta PDF em modo teste...');
    try {
      const templateOverrides = buildProposalTemplateOverrides();
      const result = await generateDealPdf(orc.id, {
        payload: {
          test_mode: true,
          proposal_mode: proposalMode,
          template_overrides: templateOverrides,
        },
      });
      console.info('[Orcamentos][PDF][Resultado]', {
        deal_id: orc.id,
        request_id: String(result?.request_id || ''),
        template_path: String(result?.template_path || ''),
        template_source: String(result?.template_source || ''),
        placeholders_total: Number(result?.placeholders_total || 0),
        placeholders_substituidos: Number(result?.placeholders_substituidos || 0),
        placeholders_restantes: Array.isArray(result?.placeholders_restantes) ? result.placeholders_restantes : [],
        html_rendered_preview: String(result?.html_rendered_preview || ''),
        uploaded: Boolean(result?.uploaded),
        upload_reason: String(result?.upload_reason || ''),
        has_link_pdf: Boolean(String(result?.link_pdf || '').trim()),
      });

      const nextLink = String(result?.link_pdf || '').trim();
      if (!nextLink) {
        const requestId = String(result?.request_id || '').trim();
        setError(`Falha ao gerar link da proposta PDF.${requestId ? ` RID: ${requestId}.` : ''}`);
        return;
      }

      const nextPdfMeta = {
        renderMode: String(result?.render_mode || '').trim(),
        pdfEngine: String(result?.pdf_engine || '').trim(),
        pdfFallbackUsed: (
          result?.pdf_fallback_used === true
          || String(result?.pdf_fallback_used || '').toLowerCase() === 'true'
          || String(result?.render_mode || '').trim() === 'native_text_fallback'
          || String(result?.pdf_engine || '').trim() === 'native_text'
          || !String(result?.pdf_engine || '').trim()
        ),
        fallbackReason: String(result?.pdf_fallback_reason || '').trim(),
        fallbackFrom: String(result?.pdf_fallback_from || '').trim(),
      };
      const nowIso = new Date().toISOString();
      const detalhesAtual = parseDetalhes(orc?.detalhes);
      const comercialAtual = parseDetalhes(detalhesAtual?.comercial);
      const proposalState = buildProposalDraftCommercialState();
      setPropostaPdfMeta(nextPdfMeta);
      if (!isHtmlPdfReady(nextPdfMeta)) {
        setPropostaLink('');
        setPropostaGeradaEm(null);
        onUpdated?.({
          ...orc,
          link_pdf: nextLink,
          proposta_gerada_em: nowIso,
          detalhes: {
            ...detalhesAtual,
            comercial: {
              ...comercialAtual,
              ...proposalState,
              proposta_link: nextLink,
              proposta_gerada_em: nowIso,
              proposta_pdf_render_mode: nextPdfMeta.renderMode,
              proposta_pdf_engine: nextPdfMeta.pdfEngine,
              proposta_pdf_fallback_used: nextPdfMeta.pdfFallbackUsed,
              proposta_pdf_fallback_from: nextPdfMeta.fallbackFrom,
              proposta_pdf_fallback_reason: nextPdfMeta.fallbackReason,
              proposta_pdf_comercial_liberado: false,
              proposal_mode: proposalMode,
              proposta_modo: proposalMode,
              ...templateOverrides,
            },
          },
        });
        setError(getPdfEngineBlockedMessage(nextPdfMeta));
        return;
      }

      const fileName = String(result?.fileName || `proposta-${orc.id}.pdf`);
      const base64Content = String(result?.pdf_base64 || '').trim();
      const downloadedFromPayload = base64Content
        ? downloadPdfFromBase64(base64Content, fileName)
        : false;
      const openMode = downloadedFromPayload
        ? 'download'
        : await openOrDownloadPropostaPdf(nextLink, fileName);

      setPropostaLink(nextLink);
      setPropostaGeradaEm(nowIso);
      onUpdated?.({
        ...orc,
        link_pdf: nextLink,
        proposta_gerada_em: nowIso,
        detalhes: {
          ...detalhesAtual,
          comercial: {
            ...comercialAtual,
            ...proposalState,
            proposta_link: nextLink,
            proposta_gerada_em: nowIso,
            proposta_pdf_render_mode: nextPdfMeta.renderMode,
            proposta_pdf_engine: nextPdfMeta.pdfEngine,
            proposta_pdf_fallback_used: nextPdfMeta.pdfFallbackUsed,
            proposta_pdf_fallback_from: nextPdfMeta.fallbackFrom,
            proposta_pdf_fallback_reason: nextPdfMeta.fallbackReason,
            proposta_pdf_comercial_liberado: true,
            proposal_mode: proposalMode,
            proposta_modo: proposalMode,
            ...templateOverrides,
          },
        },
      });

      let openedLabel = 'disponibilizada para abertura';
      if (openMode === 'download') openedLabel = 'baixada';
      if (openMode === 'new_tab') openedLabel = 'aberta em nova aba';
      if (openMode === 'same_tab') openedLabel = 'aberta';

      setInfo(`Proposta PDF gerada com sucesso e ${openedLabel}. Envio no WhatsApp habilitado.`);
    } catch (err) {
      console.error('[Orcamentos][PDF][Erro]', {
        deal_id: orc.id,
        message: String(err?.message || ''),
      });
      setError(err.message || 'Falha ao gerar PDF.');
    } finally {
      setPdfLoading(false);
    }
  }

  function handleOpenProposalPreview() {
    if (typeof window === 'undefined') return;
    const url = new URL('/templates/proposta-hagav-preview-modos', window.location.origin);
    url.searchParams.set('modo', proposalMode);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  async function handleDownloadPropostaPdf() {
    if (!propostaLink) {
      setError('Nenhuma proposta PDF disponivel para download.');
      return;
    }
    if (!propostaPdfLiberada) {
      setError(propostaPdfBlockedMessage || 'PDF bloqueado para uso comercial.');
      return;
    }
    setError('');
    const fileName = `proposta-${orc.id}.pdf`;
    const mode = await openOrDownloadPropostaPdf(propostaLink, fileName);
    if (mode === 'none') {
      setError('Nao foi possivel abrir o PDF agora.');
      return;
    }
    setInfo('PDF aberto para download.');
  }

  async function handleEnviarProposta() {
    if (!propostaLink || !propostaPdfLiberada) {
      setError('Gere a proposta PDF antes de enviar no WhatsApp.');
      if (!propostaPdfLiberada) {
        setError(propostaPdfBlockedMessage || 'PDF bloqueado para uso comercial: gere novamente com engine HTML real.');
      }
      return;
    }
    if (!hasWhatsapp) {
      setError('WhatsApp do cliente indisponivel para envio da proposta.');
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const nowIso = new Date().toISOString();
      const detalhesAtual = parseDetalhes(orc.detalhes);
      const comercialAtual = parseDetalhes(detalhesAtual?.comercial);
      const mensagem = `Ola, ${orc.nome || 'cliente'}. Preparei sua proposta da HAGAV. Segue o link para visualizar: ${propostaLink}. Qualquer ajuste, me chama aqui.`;

      if (typeof window !== 'undefined') {
        const target = whatsappLink(orc.whatsapp, mensagem);
        window.open(target, '_blank', 'noopener,noreferrer');
      }

      const updated = await updateOrcamento(orc.id, {
        status_orcamento: 'proposta_enviada',
        ultimo_contato_em: nowIso,
        detalhes: {
          ...detalhesAtual,
          comercial: {
            ...comercialAtual,
            proposta_enviada_em: nowIso,
            proposta_link: propostaLink,
          },
        },
      });
      setStatusOrc('proposta_enviada');
      onUpdated?.(updated);
      setInfo('Proposta enviada no WhatsApp e status atualizado.');
    } catch (err) {
      setError(err.message || 'Falha ao enviar proposta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalculateValues() {
    const nextPrecoFinal = Number(autoPricing?.precoFinal || autoPricing?.valorSugerido || autoPricing?.precoBase || precoFinal || 0);
    if (!Number.isFinite(nextPrecoFinal) || nextPrecoFinal <= 0) {
      setError('Nao foi possivel recalcular: valor sugerido indisponivel.');
      return;
    }

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento: statusOrc,
        ...buildFinancialPersistencePatch(nextPrecoFinal),
        recalcular_pricing: true,
        observacoes_internas: obsInternas,
        urgencia,
        prioridade,
        proxima_acao: proximaAcao,
        responsavel,
        proximo_followup_em: fromDateTimeLocal(followup),
      });
      setPrecoFinal(nextPrecoFinal);
      setPrecoFinalTouched(false);
      onUpdated?.(updated);
      setInfo('Valores recalculados e sincronizados.');
    } catch (err) {
      setError(err.message || 'Falha ao recalcular valores.');
    } finally {
      setSaving(false);
    }
  }

  const waLink = whatsappLink(orc.whatsapp, `Ola ${orc.nome || ''}, aqui e a HAGAV Studio.`);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside
        className="drawer-panel flex flex-col"
        style={adaptivePanel.panelStyle}
      >
        {adaptivePanel.showResizeHandle ? (
          <div className="panel-resize-handle" aria-hidden="true" {...adaptivePanel.resizeHandleProps} />
        ) : null}
        <div className="drawer-head">
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-1">Orcamento #{orc.id}</p>
            <h2 className="text-lg font-bold text-hagav-white">{orc.nome || 'Sem nome'}</h2>
            <p className="text-sm text-hagav-gray">{servicoResumo || '—'}</p>
          </div>
          <button onClick={onClose} className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className={showLiveProposalPreview
          ? 'flex-1 min-h-0 grid gap-4 max-h-[min(72vh,940px)] grid-rows-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:grid-cols-[minmax(0,1.06fr)_minmax(340px,0.94fr)] xl:grid-rows-1'
          : 'flex-1 min-h-0 flex flex-col'
        }>
          <div className={showLiveProposalPreview ? 'min-h-0 overflow-y-auto pr-1 space-y-3' : 'flex flex-col flex-1 min-h-0 overflow-y-auto space-y-3'}>
            <div className="px-4 py-5 space-y-5 md:px-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-hagav-surface border border-hagav-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Preco base</p>
              <p className="text-2xl font-bold text-hagav-white">{fmtBRL(autoPricing.precoBase || orc.preco_base || 0)}</p>
            </div>
            <div className="bg-hagav-gold/5 border border-hagav-gold/20 rounded-xl p-4 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Valor sugerido</p>
              <p className="text-2xl font-bold text-hagav-gold">{fmtBRL(autoPricing.valorSugerido || orc.valor_sugerido || orc.preco_base || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <InfoRow label="Preco final editavel" value={fmtBRL(financialMetrics.preco_final || 0)} />
            <InfoRow label="Margem automatica (motor)" value={`${Number(autoPricing.margemEstimada ?? orc.margem_automatica ?? orc.margem_estimada ?? 0).toFixed(1)}%`} />
            <InfoRow label="Margem comercial (preco final)" value={`${Number(financialMetrics.margem_percentual || 0).toFixed(1)}%`} />
            <InfoRow label="Lucro estimado" value={fmtBRL(financialMetrics.lucro_estimado || 0)} />
            <InfoRow label="Custo real" value={fmtBRL(autoPricing.custoReal || autoPricing.custoEstimado || 0)} />
            <InfoRow label="Horas totais" value={`${Number(autoPricing.totalHoras || 0).toFixed(2)}h`} />
            <InfoRow label="Pacote sugerido" value={autoPricing.pacoteSugerido || orc.pacote_sugerido || '—'} />
            <InfoRow label="Faixa sugerida" value={autoPricing.faixaSugerida || orc.faixa_sugerida || '—'} />
            <InfoRow label="Proposta PDF" value={propostaLink ? 'Gerada' : 'Pendente'} />
            <InfoRow label="Proposta gerada em" value={propostaGeradaEm ? fmtDateTime(propostaGeradaEm) : '—'} />
          </div>

          {marginStatus && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              marginStatus.tone === 'red'
                ? 'bg-red-500/10 border-red-500/25 text-red-200'
                : marginStatus.tone === 'yellow'
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
            }`}>
              <p className="font-medium">{marginStatus.label}</p>
              <p className="text-xs opacity-90 mt-1">{marginStatus.description}</p>
            </div>
          )}

          {showPropostaPdfBlockedWarning && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
              {propostaPdfBlockedMessage}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <OrcStatusBadge status={statusOrc} />
            <UrgenciaBadge urgencia={urgencia} />
            <PrioridadeBadge prioridade={prioridade} />
            <TemperaturaBadge temperatura={orc.temperatura} />
            <span className="badge bg-hagav-gold/15 text-hagav-gold border-hagav-gold/30">Score {orc.score_lead ?? 0}</span>
          </div>

          {orc.incompleto && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} />
                Campos incompletos detectados
              </div>
              <p className="text-xs">{(orc.incompleto_campos || []).join(', ') || 'Dados incompletos para precificacao.'}</p>
            </div>
          )}

          {(autoPricing.motivoCalculo || orc.resumo_orcamento) && (
            <div className="bg-hagav-surface border border-hagav-gold/20 rounded-lg p-4">
              <p className="text-[10px] text-hagav-gold uppercase tracking-wider mb-1.5">Resumo de precificacao</p>
              <p className="text-sm text-hagav-light whitespace-pre-wrap leading-relaxed">{autoPricing.motivoCalculo || orc.resumo_orcamento}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <p className="text-xs text-hagav-gray uppercase tracking-wider">Dados para operacao</p>
                <p className="text-[11px] text-hagav-gray">Edite quantidade, prazo, referencia e tempo real por item.</p>
              </div>
              <button type="button" onClick={addPricingItem} className="btn-ghost btn-sm">
                <Plus size={13} />
                Adicionar item
              </button>
            </div>

            {pricingRulesLoading && (
              <p className="text-[11px] text-hagav-gray mb-2">Carregando regras comerciais salvas no admin...</p>
            )}

            <div className="space-y-3">
              {pricingItems.map((item, idx) => {
                const itemResult = itensServico[idx] || {};
                const parsedHours = parseDurationToHours(item?.horas_estimadas || item?.tempo_bruto, 0);
                const effectiveHours = Number(itemResult?.horas_por_unidade || parsedHours || 0);
                return (
                  <div key={`pricing-item-${idx}`} className="bg-hagav-surface border border-hagav-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-hagav-gold uppercase tracking-wider">Item {idx + 1}</p>
                      <button
                        type="button"
                        onClick={() => removePricingItem(idx)}
                        disabled={pricingItems.length <= 1}
                        className={`btn-ghost btn-sm ${pricingItems.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Trash2 size={13} />
                        Remover
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
                      <div className="xl:col-span-2">
                        <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Serviço</label>
                        <select
                          value={item?.servico || defaultPricingServiceLabel}
                          onChange={(e) => updatePricingItem(idx, 'servico', e.target.value)}
                          className="hselect w-full"
                        >
                          {pricingServiceOptions.map((option) => (
                            <option key={option.key || option.label} value={option.label}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Quantidade</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item?.quantidade || '1'}
                          onChange={(e) => updatePricingItem(idx, 'quantidade', e.target.value)}
                          className="hinput w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Material</label>
                        <select
                          value={item?.material_gravado || 'Sim'}
                          onChange={(e) => updatePricingItem(idx, 'material_gravado', e.target.value)}
                          className="hselect w-full"
                        >
                          {ITEM_MATERIAL_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Tempo estimado</label>
                        <input
                          type="text"
                          value={item?.horas_estimadas || item?.tempo_bruto || ''}
                          onChange={(e) => updatePricingItem(idx, 'horas_estimadas', e.target.value)}
                          className="hinput w-full"
                          placeholder="1h, 1:30, 2h30, 0:45"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Prazo</label>
                        <select
                          value={normalizePrazoLabel(item?.prazo, 'Em até 7 dias')}
                          onChange={(e) => updatePricingItem(idx, 'prazo', e.target.value)}
                          className="hselect w-full"
                        >
                          {PRAZO_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-2">
                      <div>
                        <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Referencia do item</label>
                        <textarea
                          value={item?.referencia || ''}
                          onChange={(e) => updatePricingItem(idx, 'referencia', e.target.value)}
                          rows={2}
                          className="hinput w-full resize-none"
                          placeholder="Link, observacao ou briefing desse item"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <InfoRow label="Horas/un" value={effectiveHours > 0 ? `${effectiveHours.toFixed(2)}h` : '—'} />
                        <InfoRow label="Custo real" value={fmtBRL(itemResult?.custo_real_item || 0)} />
                        <InfoRow label="Sugerido" value={fmtBRL(itemResult?.valor_sugerido_item || 0)} />
                        <InfoRow label="Margem" value={Number.isFinite(Number(itemResult?.margem_item)) ? `${Number(itemResult.margem_item).toFixed(1)}%` : '—'} />
                      </div>
                    </div>

                    <p className="text-[11px] text-hagav-gray">
                      {parsedHours > 0
                        ? `Tempo informado reconhecido: ${formatDurationCompact(parsedHours) || `${parsedHours.toFixed(2)}h`}.`
                        : `Sem tempo informado válido: usando preset operacional de ${effectiveHours > 0 ? `${effectiveHours.toFixed(2)}h` : '0h'} para este serviço.`}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              <InfoRow label="Servico/Operacao" value={servicoResumo} />
              <InfoRow label="Quantidade" value={quantidadeResumo} />
              <InfoRow label="Material gravado" value={materialResumo} />
              <InfoRow label="Tempo estimado" value={tempoResumo} />
              <InfoRow label="Prazo" value={proposalRecord.prazo || '—'} />
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 md:col-span-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-0.5">Referencia</p>
                    <p className="text-sm text-hagav-light font-medium break-all whitespace-pre-wrap">{referencePreview}</p>
                  </div>
                  {canExpandReference && (
                    <button
                      type="button"
                      onClick={() => setReferenceExpanded((prev) => !prev)}
                      className="text-[11px] px-2 py-1 rounded-md border border-hagav-border text-hagav-gold hover:text-hagav-gold-light hover:border-hagav-gold/30 transition-colors shrink-0"
                    >
                      {referenceExpanded ? 'Ocultar' : 'Ver referencia'}
                    </button>
                  )}
                </div>
                {referenceExpanded && (
                  <div className="mt-2 pt-2 border-t border-hagav-border/70">
                    <p className="text-xs text-hagav-light whitespace-pre-wrap break-all">{referenceText}</p>
                    {referenceUrl && (
                      <a
                        href={referenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-xs text-hagav-gold hover:text-hagav-gold-light"
                      >
                        Abrir link
                        <ExternalLink size={11} className="opacity-70" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <InfoRow label="Fluxo" value={orc.fluxo} />
              <InfoRow label="Origem" value={orc.origem} />
              <InfoRow label="Criado em" value={fmtDateTime(orc.created_at)} />
            </div>
          </div>

          {observacoesText && (
            <div>
              <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Observacoes do cliente</p>
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-sm text-hagav-light whitespace-pre-wrap">
                {observacoesPreview}
                {canExpandObs && (
                  <button
                    type="button"
                    onClick={() => setObsExpanded((prev) => !prev)}
                    className="block mt-2 text-xs text-hagav-gold hover:text-hagav-gold-light"
                  >
                    {obsExpanded ? 'Ocultar observacoes' : 'Ver observacoes completas'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-hagav-surface border border-hagav-gold/25 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-hagav-gold uppercase tracking-wider">Proposta comercial</p>
                <span className="text-[11px] text-hagav-gray">Revise e complete os dados antes de gerar o PDF.</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLiveProposalPreview((prev) => !prev)}
                className={`btn-ghost btn-sm ${showLiveProposalPreview ? 'border-hagav-gold/70 text-hagav-gold bg-hagav-gold/10' : ''}`}
              >
                <Eye size={13} />
                {showLiveProposalPreview ? 'Ocultar preview ao vivo' : 'Preview ao vivo'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {PROPOSAL_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => applyProposalMode(mode.value)}
                  className={`btn-ghost btn-sm ${proposalMode === mode.value ? 'border-hagav-gold/70 text-hagav-gold bg-hagav-gold/10' : ''}`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Nome do cliente</label>
                <input
                  type="text"
                  value={proposalDraft.cliente_nome || ''}
                  onChange={(e) => updateProposalDraftField('cliente_nome', e.target.value)}
                  className="hinput w-full"
                  placeholder="Nome do cliente"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">WhatsApp</label>
                <input
                  type="text"
                  value={proposalDraft.whatsapp || ''}
                  onChange={(e) => updateProposalDraftField('whatsapp', e.target.value)}
                  className="hinput w-full"
                  placeholder="WhatsApp com DDD"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Empresa</label>
                <input
                  type="text"
                  value={proposalDraft.empresa || ''}
                  onChange={(e) => updateProposalDraftField('empresa', e.target.value)}
                  className="hinput w-full"
                  placeholder="Empresa ou marca"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Instagram</label>
                <input
                  type="text"
                  value={proposalDraft.instagram || ''}
                  onChange={(e) => updateProposalDraftField('instagram', e.target.value)}
                  className="hinput w-full"
                  placeholder="@instagram do cliente"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">E-mail</label>
                <input
                  type="text"
                  value={proposalDraft.email_cliente || ''}
                  onChange={(e) => updateProposalDraftField('email_cliente', e.target.value)}
                  className="hinput w-full"
                  placeholder="E-mail para envio da proposta"
                />
              </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Número da proposta</label>
                <input
                  type="text"
                  value={proposalDraft.numero_proposta || ''}
                  onChange={(e) => updateProposalDraftField('numero_proposta', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: PROP-001"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Data de emissão</label>
                <input
                  type="text"
                  value={proposalDraft.data_emissao || ''}
                  onChange={(e) => updateProposalDraftField('data_emissao', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: 27/04/2026"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Validade da proposta</label>
                <input
                  type="text"
                  value={proposalDraft.data_validade || ''}
                  onChange={(e) => updateProposalDraftField('data_validade', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: 04/05/2026"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Forma de pagamento</label>
                <input
                  type="text"
                  value={proposalDraft.forma_pagamento || ''}
                  onChange={(e) => updateProposalDraftField('forma_pagamento', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: PIX, cartao ou parcelado"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Duração do contrato</label>
                <input
                  type="text"
                  value={proposalDraft.duracao_contrato_meses || ''}
                  onChange={(e) => updateProposalDraftField('duracao_contrato_meses', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: 3"
                />
              </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Serviço</label>
                <input
                  type="text"
                  value={proposalDraft.servico_principal || ''}
                  onChange={(e) => updateProposalDraftField('servico_principal', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: Reels / Shorts / TikTok"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Quantidade</label>
                <input
                  type="text"
                  value={proposalDraft.quantidade || ''}
                  onChange={(e) => updateProposalDraftField('quantidade', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: 10 videos"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Prazo</label>
                <select
                  value={normalizePrazoLabel(proposalDraft.prazo, 'Sem prazo definido')}
                  onChange={(e) => updateProposalDraftField('prazo', e.target.value)}
                  className="hselect w-full"
                >
                  {PRAZO_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor total</label>
                <input
                  type="text"
                  value={proposalDraft.valor_total_moeda || ''}
                  onChange={(e) => updateProposalDraftField('valor_total_moeda', e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: R$ 1.500,00"
                />
              </div>
                </div>

                {proposalMode === 'mensal' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Quantidade mensal</label>
                      <input
                        type="text"
                        value={proposalDraft.quantidade_mensal || ''}
                        onChange={(e) => updateProposalDraftField('quantidade_mensal', e.target.value)}
                        className="hinput w-full"
                        placeholder="Ex.: 12 videos por mes"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor mensal</label>
                      <input
                        type="text"
                        value={proposalDraft.valor_mensal_moeda || ''}
                        onChange={(e) => updateProposalDraftField('valor_mensal_moeda', e.target.value)}
                        className="hinput w-full"
                        placeholder="Ex.: R$ 1.500,00/mês"
                      />
                    </div>
                    <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Escopo mensal</label>
                      <input
                        type="text"
                        value={proposalDraft.escopo_mensal || ''}
                        onChange={(e) => updateProposalDraftField('escopo_mensal', e.target.value)}
                        className="hinput w-full"
                        placeholder="Resumo da operação mensal"
                      />
                    </div>
                  </div>
                )}

                {proposalMode === 'personalizada' && (
                  <div>
                    <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor personalizado</label>
                    <input
                      type="text"
                      value={proposalDraft.valor_personalizado_moeda || ''}
                      onChange={(e) => updateProposalDraftField('valor_personalizado_moeda', e.target.value)}
                      className="hinput w-full"
                      placeholder="Ex.: R$ 2.350,00"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Escopo / descricao da proposta</label>
                  <textarea
                    value={proposalDraft.escopo_comercial || ''}
                    onChange={(e) => updateProposalDraftField('escopo_comercial', e.target.value)}
                    rows={3}
                    className="hinput w-full resize-none"
                    placeholder="Descreva o escopo da proposta"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Condições comerciais</label>
                    <textarea
                      value={proposalDraft.condicoes_comerciais || ''}
                      onChange={(e) => updateProposalDraftField('condicoes_comerciais', e.target.value)}
                      rows={4}
                      className="hinput w-full resize-none"
                      placeholder="Condições, pagamento e validade"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Referência</label>
                    <textarea
                      value={proposalDraft.referencia_texto || ''}
                      onChange={(e) => updateProposalDraftField('referencia_texto', e.target.value)}
                      rows={4}
                      className="hinput w-full resize-none"
                      placeholder="Link ou referência resumida"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observação adicional</label>
                    <textarea
                      value={proposalDraft.observacao_adicional || ''}
                      onChange={(e) => updateProposalDraftField('observacao_adicional', e.target.value)}
                      rows={2}
                      className="hinput w-full resize-none"
                      placeholder="Observação opcional para o cliente"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">CTA final do WhatsApp</label>
                    <textarea
                      value={proposalDraft.cta_aprovacao || ''}
                      onChange={(e) => updateProposalDraftField('cta_aprovacao', e.target.value)}
                      rows={2}
                      className="hinput w-full resize-none"
                      placeholder="Ex.: Me chama no WhatsApp para aprovar"
                    />
                  </div>
                </div>

                {proposalMode === 'opcoes' && (
                  <div className="space-y-2 border border-hagav-border rounded-lg p-2.5 bg-hagav-dark/35">
                    <p className="text-[11px] text-hagav-gold uppercase tracking-wider">Opções de investimento</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {[1, 2, 3].map((index) => (
                        <div key={index} className="space-y-1.5 border border-hagav-border rounded-lg p-2">
                          <input
                            type="text"
                            value={proposalDraft[`opcao${index}_titulo`] || ''}
                            onChange={(e) => updateProposalDraftField(`opcao${index}_titulo`, e.target.value)}
                            className="hinput w-full"
                            placeholder={`Título da opção ${index}`}
                          />
                          <input
                            type="text"
                            value={proposalDraft[`opcao${index}_qtd`] || ''}
                            onChange={(e) => updateProposalDraftField(`opcao${index}_qtd`, e.target.value)}
                            className="hinput w-full"
                            placeholder={`Quantidade da opção ${index}`}
                          />
                          <input
                            type="text"
                            value={proposalDraft[`opcao${index}_preco`] || ''}
                            onChange={(e) => updateProposalDraftField(`opcao${index}_preco`, e.target.value)}
                            className="hinput w-full"
                            placeholder={`Preço total da opção ${index}`}
                          />
                          <input
                            type="text"
                            value={proposalDraft[`opcao${index}_unitario`] || ''}
                            onChange={(e) => updateProposalDraftField(`opcao${index}_unitario`, e.target.value)}
                            className="hinput w-full"
                            placeholder={`Valor unitário da opção ${index}`}
                          />
                          <input
                            type="text"
                            value={proposalDraft[`opcao${index}_desc`] || ''}
                            onChange={(e) => updateProposalDraftField(`opcao${index}_desc`, e.target.value)}
                            className="hinput w-full"
                            placeholder={`Descrição da opção ${index}`}
                          />
                          <input
                            type="text"
                            value={proposalDraft[`opcao${index}_desconto`] || ''}
                            onChange={(e) => updateProposalDraftField(`opcao${index}_desconto`, e.target.value)}
                            className="hinput w-full"
                            placeholder={`Desconto da opção ${index}`}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Texto comparativo (opcional)</label>
                      <textarea
                        value={proposalDraft.texto_comparativo || ''}
                        onChange={(e) => updateProposalDraftField('texto_comparativo', e.target.value)}
                        rows={2}
                        className="hinput w-full resize-none"
                        placeholder="Resumo opcional entre as opções"
                      />
                    </div>
                  </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
              <button
                type="button"
                onClick={hydrateProposalDraft}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm"
              >
                <RotateCw size={13} />
                Preencher automático
              </button>
              <button
                type="button"
                onClick={handleSaveProposalDraft}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm"
              >
                {draftSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar rascunho
              </button>
              <button
                type="button"
                onClick={() => setShowLiveProposalPreview((prev) => !prev)}
                disabled={saving || pdfLoading || draftSaving}
                className={`btn-ghost btn-sm ${showLiveProposalPreview ? 'border-hagav-gold/70 text-hagav-gold bg-hagav-gold/10' : ''}`}
              >
                <Eye size={13} />
                Preview ao vivo
              </button>
              <button
                type="button"
                onClick={handleOpenProposalPreview}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm"
              >
                <Eye size={13} />
                Abrir preview externo
              </button>
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={pdfLoading || saving || draftSaving}
                className="btn-ghost btn-sm"
              >
                {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                Gerar PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadPropostaPdf}
                disabled={!propostaLink || !propostaPdfLiberada || pdfLoading || saving || draftSaving}
                className={`btn-ghost btn-sm ${!propostaLink || !propostaPdfLiberada ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Download size={13} />
                Baixar PDF
              </button>
            </div>
          </div>

          <div className="gold-line" />

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Status</label>
                <select value={statusOrc} onChange={(e) => setStatusOrc(e.target.value)} className="hselect w-full">
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{ORC_STATUS_LABELS[status] || status}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Urgencia</label>
                <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className="hselect w-full">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Prioridade</label>
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="hselect w-full">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Preco final (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precoFinal}
                onChange={(e) => {
                  setPrecoFinalTouched(true);
                  setPrecoFinal(e.target.value);
                }}
                className="hinput w-full"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Proxima acao</label>
              <input
                type="text"
                value={proximaAcao}
                onChange={(e) => setProximaAcao(e.target.value)}
                className="hinput w-full"
                placeholder="Ex.: validar escopo e enviar proposta"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Responsavel</label>
                <input
                  type="text"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  className="hinput w-full"
                  placeholder="Ex.: Time comercial"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Proximo follow-up</label>
                <input
                  type="datetime-local"
                  value={followup}
                  onChange={(e) => setFollowup(e.target.value)}
                  className="hinput w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observacoes internas</label>
              <textarea
                value={obsInternas}
                onChange={(e) => setObsInternas(e.target.value)}
                rows={4}
                placeholder="Anotacoes internas, pendencias, negociacao..."
                className="hinput w-full resize-none"
              />
            </div>
          </div>


        </div>

            <div className="orcamento-actions-foot pt-1">
          {(error || info) && (
            <p
              className={`orcamento-feedback ${
                error
                  ? 'text-red-300 bg-red-500/10 border-red-500/25'
                  : 'text-hagav-light bg-hagav-surface border-hagav-border'
              }`}
            >
              {error || info}
            </p>
          )}
          <CollapsibleActionBlock
            title="Proposta e contrato"
            description="Envie a proposta e avance a conversa com o cliente."
            collapsed={proposalContactCollapsed}
            onToggle={() => setProposalContactCollapsed((prev) => !prev)}
            contentClassName="orcamento-action-grid"
          >
              <button
                type="button"
                onClick={handleDownloadPropostaPdf}
                disabled={!propostaLink || !propostaPdfLiberada || saving || pdfLoading || draftSaving}
                className={`btn-ghost btn-sm orcamento-action-button ${!propostaLink || !propostaPdfLiberada ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Download size={13} />
                Baixar PDF
              </button>
              <EduTooltip {...SEND_PROPOSTA_TOOLTIP} className="w-full">
                <span className="inline-flex w-full">
                  <button
                    type="button"
                    onClick={handleEnviarProposta}
                    disabled={saving || pdfLoading || draftSaving || !canSendProposta}
                    className={`btn-ghost btn-sm orcamento-action-button ${!canSendProposta ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <Send size={13} />
                    Enviar proposta
                  </button>
                </span>
              </EduTooltip>
              <EduTooltip {...WHATSAPP_TOOLTIP} className="w-full">
                {hasWhatsapp ? (
                  <a href={waLink} target="_blank" rel="noreferrer" className="btn-ghost btn-sm orcamento-action-button">
                    <MessageCircle size={13} />
                    WhatsApp
                    <ExternalLink size={11} className="opacity-50" />
                  </a>
                ) : (
                  <span className="btn-ghost btn-sm orcamento-action-button opacity-60 cursor-not-allowed">
                    <MessageCircle size={13} />
                    WhatsApp indisponivel
                  </span>
                )}
              </EduTooltip>
          </CollapsibleActionBlock>

          <CollapsibleActionBlock
            title="Operação"
            description="Ajustes manuais e encerramento da negociação quando necessário."
            collapsed={operationCollapsed}
            onToggle={() => setOperationCollapsed((prev) => !prev)}
            contentClassName="orcamento-action-grid orcamento-action-grid-compact"
          >
              <button
                type="button"
                onClick={handleRecalculateValues}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm orcamento-action-button"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                Recalcular valores
              </button>
              <button
                type="button"
                onClick={() => handleQuickStatus('perdido')}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm orcamento-action-button"
              >
                <Ban size={13} />
                Marcar perdido
              </button>
          </CollapsibleActionBlock>

          <div className="orcamento-action-commit">
            {canApproveOrcamento && (
              <button
                type="button"
                onClick={() => handleQuickStatus('aprovado')}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-gold btn-sm orcamento-approve-button"
              >
                <CheckCircle2 size={13} />
                Cliente aprovou
              </button>
            )}
            <button onClick={handleSave} disabled={saving || pdfLoading || draftSaving} className="btn-gold orcamento-save-button">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>
            </div>
          </div>

          {showLiveProposalPreview && (
            <div className="min-h-0 overflow-y-auto pl-0 pr-1 space-y-2 xl:pl-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-hagav-gray uppercase tracking-wider">Preview da proposta</p>
                <span className="text-[11px] text-hagav-gray">Atualiza conforme você edita.</span>
              </div>
              <ProposalPreview preview={proposalPreview} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}




'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Loader2, MessageCircle, ExternalLink, AlertTriangle, CheckCircle2, Send, Ban, RotateCw, Eye, Download } from 'lucide-react';
import { OrcStatusBadge, PrioridadeBadge, UrgenciaBadge, TemperaturaBadge } from '@/components/ui/StatusBadge';
import EduTooltip from '@/components/ui/EduTooltip';
import { generateDealPdf, updateOrcamento } from '@/lib/supabase';
import { deriveFinancialMetricsFromFinalPrice } from '@/lib/commercial';
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
  { value: 'direta', label: 'Direta' },
  { value: 'opcoes', label: 'Com opcoes' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'personalizada', label: 'Personalizada' },
];

const PROPOSAL_MODE_PRESETS = {
  direta: {
    servico_principal: 'Conteudo para redes sociais',
    quantidade: '10 videos',
    prazo: '24h',
    escopo_comercial: 'Edicao estrategica com acabamento profissional, ritmo otimizado para retencao e entrega pronta para publicacao em MP4. Inclui 1 rodada de ajustes.',
  },
  opcoes: {
    servico_principal: 'Conteudo para redes sociais',
    quantidade: '10 videos',
    prazo: 'Inicio imediato apos aprovacao',
    escopo_comercial: 'Comparativo comercial com pedido atual e duas opcoes de maior volume para reduzir custo medio por entrega.',
  },
  mensal: {
    servico_principal: 'Plano mensal de conteudo',
    quantidade: '12 videos mensais',
    prazo: 'Cronograma mensal',
    escopo_comercial: 'Operacao mensal de edicao com padrao visual consistente, organizacao de entregas e acompanhamento por cronograma aprovado.',
  },
  personalizada: {
    servico_principal: 'Proposta personalizada',
    quantidade: 'Escopo sob medida',
    prazo: 'Conforme alinhamento',
    escopo_comercial: 'Estrutura personalizada para atender necessidades especificas, com planejamento de escopo, organizacao de materiais e execucao premium.',
  },
};

const PROPOSAL_DRAW_FIELDS = [
  'cliente_nome',
  'whatsapp',
  'servico_principal',
  'quantidade',
  'prazo',
  'escopo_comercial',
  'observacao_adicional',
  'valor_total_moeda',
  'forma_pagamento',
  'data_validade',
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

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
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

function normalizeProposalMode(value) {
  const key = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (key.includes('opco')) return 'opcoes';
  if (key.includes('mensal') || key.includes('recorrente')) return 'mensal';
  if (key.includes('personal')) return 'personalizada';
  if (key.includes('direta')) return 'direta';
  return 'direta';
}

function parseQuantityNumber(value, fallback = 10) {
  const match = String(value || '').match(/(\d{1,5})/);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, parsed);
}

function buildDefaultOptionCards(baseQuantity = 10) {
  const pedidoAtualQty = Math.max(1, Number(baseQuantity || 10));
  const maisVolumeQty = Math.max(pedidoAtualQty + 1, Math.round(pedidoAtualQty * 1.5));
  const melhorCustoQty = Math.max(30, Math.round(pedidoAtualQty * 3));
  const baseUnit = 170;
  const option1Total = pedidoAtualQty * baseUnit;
  const option2Unit = baseUnit * 0.95;
  const option3Unit = baseUnit * 0.85;
  const option2Total = maisVolumeQty * option2Unit;
  const option3Total = melhorCustoQty * option3Unit;

  return {
    opcao1_titulo: 'Pedido atual',
    opcao1_qtd: `${pedidoAtualQty} videos`,
    opcao1_preco: fmtBRL(option1Total),
    opcao1_unitario: `${fmtBRL(baseUnit)} por video`,
    opcao1_desc: 'Sem desconto aplicado',
    opcao1_desconto: '',
    opcao2_titulo: 'Mais volume',
    opcao2_qtd: `${maisVolumeQty} videos`,
    opcao2_preco: fmtBRL(option2Total),
    opcao2_unitario: `${fmtBRL(option2Unit)} por video`,
    opcao2_desc: '5% de desconto por volume',
    opcao2_desconto: '-5%',
    opcao3_titulo: 'Melhor custo-beneficio',
    opcao3_qtd: `${melhorCustoQty} videos`,
    opcao3_preco: fmtBRL(option3Total),
    opcao3_unitario: `${fmtBRL(option3Unit)} por video`,
    opcao3_desc: '15% de desconto por volume',
    opcao3_desconto: '-15%',
    texto_comparativo: 'Quanto maior o volume, menor o custo por video. As opcoes acima usam descontos progressivos conforme quantidade.',
  };
}

function buildProposalDraftFromRecord(record, forcedMode) {
  const detalhes = parseDetalhes(record?.detalhes);
  const comercial = parseDetalhes(detalhes?.comercial);
  const proposalMode = normalizeProposalMode(
    forcedMode || comercial?.proposta_modo || comercial?.proposal_mode || 'direta'
  );
  const modePreset = PROPOSAL_MODE_PRESETS[proposalMode] || PROPOSAL_MODE_PRESETS.direta;
  const quantityNumber = parseQuantityNumber(
    comercial?.quantidade
      || comercial?.opcao1_qtd
      || record?.quantidade
      || modePreset.quantidade,
    10
  );
  const optionDefaults = buildDefaultOptionCards(quantityNumber);
  const defaultValor = fmtBRL(
    record?.preco_final
    || record?.valor_sugerido
    || record?.preco_base
    || quantityNumber * 170
  );

  return {
    cliente_nome: normalizeText(comercial?.cliente_nome || comercial?.nome_cliente || record?.nome || ''),
    whatsapp: normalizeText(comercial?.whatsapp || record?.whatsapp || ''),
    servico_principal: normalizeText(comercial?.servico_principal || record?.servico || modePreset.servico_principal),
    quantidade: normalizeText(comercial?.quantidade || record?.quantidade || modePreset.quantidade),
    prazo: normalizeText(comercial?.prazo || record?.prazo || modePreset.prazo),
    escopo_comercial: normalizeText(comercial?.escopo_comercial || comercial?.descricao_escopo || modePreset.escopo_comercial || ''),
    observacao_adicional: normalizeText(comercial?.observacao_adicional || ''),
    valor_total_moeda: normalizeText(comercial?.valor_total_moeda || defaultValor),
    forma_pagamento: normalizeText(comercial?.forma_pagamento || 'PIX / Transferencia / Conforme combinado'),
    data_validade: normalizeText(comercial?.data_validade || ''),
    numero_proposta: normalizeText(comercial?.numero_proposta || `PROP-${record?.id || ''}`),
    data_emissao: normalizeText(comercial?.data_emissao || ''),
    cta_aprovacao: normalizeText(comercial?.cta_aprovacao || 'Para aprovar, responda APROVADO no WhatsApp.'),
    opcao1_titulo: normalizeText(comercial?.opcao1_titulo || optionDefaults.opcao1_titulo),
    opcao1_qtd: normalizeText(comercial?.opcao1_qtd || optionDefaults.opcao1_qtd),
    opcao1_preco: normalizeText(comercial?.opcao1_preco || optionDefaults.opcao1_preco),
    opcao1_unitario: normalizeText(comercial?.opcao1_unitario || optionDefaults.opcao1_unitario),
    opcao1_desc: normalizeText(comercial?.opcao1_desc || optionDefaults.opcao1_desc),
    opcao1_desconto: normalizeText(comercial?.opcao1_desconto || optionDefaults.opcao1_desconto),
    opcao2_titulo: normalizeText(comercial?.opcao2_titulo || optionDefaults.opcao2_titulo),
    opcao2_qtd: normalizeText(comercial?.opcao2_qtd || optionDefaults.opcao2_qtd),
    opcao2_preco: normalizeText(comercial?.opcao2_preco || optionDefaults.opcao2_preco),
    opcao2_unitario: normalizeText(comercial?.opcao2_unitario || optionDefaults.opcao2_unitario),
    opcao2_desc: normalizeText(comercial?.opcao2_desc || optionDefaults.opcao2_desc),
    opcao2_desconto: normalizeText(comercial?.opcao2_desconto || optionDefaults.opcao2_desconto),
    opcao3_titulo: normalizeText(comercial?.opcao3_titulo || optionDefaults.opcao3_titulo),
    opcao3_qtd: normalizeText(comercial?.opcao3_qtd || optionDefaults.opcao3_qtd),
    opcao3_preco: normalizeText(comercial?.opcao3_preco || optionDefaults.opcao3_preco),
    opcao3_unitario: normalizeText(comercial?.opcao3_unitario || optionDefaults.opcao3_unitario),
    opcao3_desc: normalizeText(comercial?.opcao3_desc || optionDefaults.opcao3_desc),
    opcao3_desconto: normalizeText(comercial?.opcao3_desconto || optionDefaults.opcao3_desconto),
    texto_comparativo: normalizeText(comercial?.texto_comparativo || optionDefaults.texto_comparativo),
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
  const [statusOrc, setStatusOrc] = useState(orc?.status_orcamento ?? 'orcamento');
  const [precoFinal, setPrecoFinal] = useState(orc?.preco_final ?? 0);
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
  const [proposalMode, setProposalMode] = useState(() => {
    const detalhes = parseDetalhes(orc?.detalhes);
    const comercial = parseDetalhes(detalhes?.comercial);
    return normalizeProposalMode(comercial?.proposta_modo || comercial?.proposal_mode || 'direta');
  });
  const [proposalDraft, setProposalDraft] = useState(() => buildProposalDraftFromRecord(orc));

  if (!orc) return null;
  const itensServico = Array.isArray(orc.itens_servico) ? orc.itens_servico : [];
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
    : (orc.servico || '');
  const quantidadeResumo = itensServico.length > 0
    ? (
      itensServico.length === 1
        ? normalizeText(itensServico[0]?.quantidade || '-')
        : itensServico.map((item) => `${item?.servico || 'Servico'}: ${item?.quantidade || '-'}`).join(' | ')
    )
    : cleanSingleServiceField(orc.quantidade || '');
  const materialResumo = cleanSingleServiceField(orc.material_gravado);
  const tempoResumo = cleanSingleServiceField(orc.tempo_bruto);
  const referenciaResumo = cleanSingleServiceField(orc.referencia);
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
  const financialMetrics = useMemo(
    () => deriveFinancialMetricsFromFinalPrice(orc, precoFinal),
    [orc, precoFinal]
  );

  function buildProposalDraftForMode(mode) {
    const normalizedMode = normalizeProposalMode(mode);
    const preset = PROPOSAL_MODE_PRESETS[normalizedMode] || PROPOSAL_MODE_PRESETS.direta;
    return {
      ...buildProposalDraftFromRecord(orc, normalizedMode),
      servico_principal: preset.servico_principal,
      quantidade: preset.quantidade,
      prazo: preset.prazo,
      escopo_comercial: preset.escopo_comercial,
    };
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
    return buildTemplateOverridesFromDraft(proposalDraft);
  }

  function applyProposalMode(mode) {
    const normalizedMode = normalizeProposalMode(mode);
    setProposalMode(normalizedMode);
    setProposalDraft(buildProposalDraftForMode(normalizedMode));
  }

  function updateProposalDraftField(field, value) {
    setProposalDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function hydrateProposalDraft() {
    setError('');
    setProposalDraft(buildProposalDraftFromRecord(orc, proposalMode));
    setInfo('Campos do PDF preenchidos automaticamente com os dados do orcamento.');
  }

  function buildFinancialPersistencePatch() {
    const detalhesAtual = parseDetalhes(orc?.detalhes);
    const comercialAtual = parseDetalhes(detalhesAtual?.comercial);
    const margemAutomaticaAtual = Number(orc?.margem_automatica ?? orc?.margem_estimada ?? 0);
    const margemComercialAtual = Number(financialMetrics.margem_percentual || 0);
    const nowIso = new Date().toISOString();
    const proposalState = buildProposalDraftCommercialState();

    return {
      preco_final: Number(financialMetrics.preco_final || 0),
      valor_estimado: Number(financialMetrics.valor_estimado || 0),
      detalhes: {
        ...detalhesAtual,
        comercial: {
          ...comercialAtual,
          ...proposalState,
          margem_automatica: Number.isFinite(margemAutomaticaAtual) ? margemAutomaticaAtual : 0,
          margem_percentual: Number.isFinite(margemComercialAtual) ? margemComercialAtual : 0,
          margem_comercial: Number.isFinite(margemComercialAtual) ? margemComercialAtual : 0,
          lucro_estimado: Number(financialMetrics.lucro_estimado || 0),
          potencial_total: Number(financialMetrics.potencial_total || financialMetrics.valor_estimado || 0),
          preco_final: Number(financialMetrics.preco_final || 0),
          atualizado_em: nowIso,
        },
      },
    };
  }

  useEffect(() => {
    setStatusOrc(orc?.status_orcamento ?? 'orcamento');
    setPrecoFinal(orc?.preco_final ?? 0);
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
    const nextMode = normalizeProposalMode(comercial?.proposta_modo || comercial?.proposal_mode || 'direta');
    setProposalMode(nextMode);
    setProposalDraft(buildProposalDraftFromRecord(orc, nextMode));
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

  async function handleSaveProposalDraft() {
    setDraftSaving(true);
    setError('');
    setInfo('');
    try {
      const detalhesAtual = parseDetalhes(orc?.detalhes);
      const comercialAtual = parseDetalhes(detalhesAtual?.comercial);
      const updated = await updateOrcamento(orc.id, {
        detalhes: {
          ...detalhesAtual,
          comercial: {
            ...comercialAtual,
            ...buildProposalDraftCommercialState(),
          },
        },
      });
      onUpdated?.(updated);
      setInfo('Rascunho do PDF salvo no orcamento.');
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar rascunho do PDF.');
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
    try {
      const payload = {
        mode: proposalMode,
        source: 'orcamento_drawer',
        deal_id: orc.id,
        draft: proposalDraft,
        updated_at: new Date().toISOString(),
      };
      window.sessionStorage.setItem('hagav_proposta_preview_draft', JSON.stringify(payload));
    } catch (err) {
      console.warn('[Orcamentos][PDF][Preview]', err);
    }
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
    const nextPrecoFinal = Number(orc?.valor_sugerido || orc?.preco_base || precoFinal || 0);
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
        preco_final: nextPrecoFinal,
        recalcular_pricing: true,
        observacoes_internas: obsInternas,
        urgencia,
        prioridade,
        proxima_acao: proximaAcao,
        responsavel,
        proximo_followup_em: fromDateTimeLocal(followup),
      });
      setPrecoFinal(nextPrecoFinal);
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
      <aside className="drawer-panel flex flex-col">
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

        <div className="drawer-body">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-hagav-surface border border-hagav-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Preco base</p>
              <p className="text-2xl font-bold text-hagav-white">{fmtBRL(orc.preco_base)}</p>
            </div>
            <div className="bg-hagav-gold/5 border border-hagav-gold/20 rounded-xl p-4 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Valor sugerido</p>
              <p className="text-2xl font-bold text-hagav-gold">{fmtBRL(orc.valor_sugerido || orc.preco_base)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <InfoRow label="Preco final editavel" value={fmtBRL(financialMetrics.preco_final || 0)} />
            <InfoRow label="Margem automatica (motor)" value={`${Number(orc.margem_automatica ?? orc.margem_estimada ?? 0).toFixed(1)}%`} />
            <InfoRow label="Margem comercial (preco final)" value={`${Number(financialMetrics.margem_percentual || 0).toFixed(1)}%`} />
            <InfoRow label="Lucro estimado" value={fmtBRL(financialMetrics.lucro_estimado || 0)} />
            <InfoRow label="Valor potencial" value={fmtBRL(financialMetrics.valor_estimado || orc.preco_final || orc.preco_base)} />
            <InfoRow label="Pacote sugerido" value={orc.pacote_sugerido || '—'} />
            <InfoRow label="Faixa sugerida" value={orc.faixa_sugerida || '—'} />
            <InfoRow label="Proposta PDF" value={propostaLink ? 'Gerada' : 'Pendente'} />
            <InfoRow label="Proposta gerada em" value={propostaGeradaEm ? fmtDateTime(propostaGeradaEm) : '—'} />
          </div>

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

          {orc.resumo_orcamento && (
            <div className="bg-hagav-surface border border-hagav-gold/20 rounded-lg p-4">
              <p className="text-[10px] text-hagav-gold uppercase tracking-wider mb-1.5">Resumo de precificacao</p>
              <p className="text-sm text-hagav-light whitespace-pre-wrap leading-relaxed">{orc.resumo_orcamento}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Dados para operacao</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <InfoRow label="Servico/Operacao" value={servicoResumo} />
              <InfoRow label="Quantidade" value={quantidadeResumo} />
              <InfoRow label="Material gravado" value={materialResumo} />
              <InfoRow label="Tempo bruto" value={tempoResumo} />
              <InfoRow label="Prazo" value={orc.prazo} />
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
            {itensServico.length > 1 ? (
              <div className="mt-3 bg-hagav-surface border border-hagav-border rounded-lg p-3">
                <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-2">Itens por servico</p>
                <div className="space-y-2">
                  {itensServico.map((item, idx) => (
                    <div key={`${item?.servico || 'item'}-${idx}`} className="grid grid-cols-12 gap-2 text-xs">
                      <div className="col-span-4 text-hagav-light">{item?.servico || 'Servico'}</div>
                      <div className="col-span-2 text-hagav-gray">Qtd: {item?.quantidade || '-'}</div>
                      <div className="col-span-3 text-hagav-gray">Base: {fmtBRL(item?.preco_base_item || 0)}</div>
                      <div className="col-span-3 text-hagav-gold">Sug.: {fmtBRL(item?.valor_sugerido_item || 0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-hagav-gold uppercase tracking-wider">PDF comercial (drawer)</p>
              <span className="text-[11px] text-hagav-gray">Ajuste os parametros da proposta sem alterar o funil.</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Nome do cliente</label>
                <input
                  type="text"
                  value={proposalDraft.cliente_nome || ''}
                  onChange={(e) => updateProposalDraftField('cliente_nome', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{cliente_nome}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">WhatsApp</label>
                <input
                  type="text"
                  value={proposalDraft.whatsapp || ''}
                  onChange={(e) => updateProposalDraftField('whatsapp', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{whatsapp}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Numero da proposta</label>
                <input
                  type="text"
                  value={proposalDraft.numero_proposta || ''}
                  onChange={(e) => updateProposalDraftField('numero_proposta', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{numero_proposta}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Data de emissao</label>
                <input
                  type="text"
                  value={proposalDraft.data_emissao || ''}
                  onChange={(e) => updateProposalDraftField('data_emissao', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{data_emissao}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Data de validade</label>
                <input
                  type="text"
                  value={proposalDraft.data_validade || ''}
                  onChange={(e) => updateProposalDraftField('data_validade', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{data_validade}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Forma de pagamento</label>
                <input
                  type="text"
                  value={proposalDraft.forma_pagamento || ''}
                  onChange={(e) => updateProposalDraftField('forma_pagamento', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{forma_pagamento}}"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Servico principal</label>
                <input
                  type="text"
                  value={proposalDraft.servico_principal || ''}
                  onChange={(e) => updateProposalDraftField('servico_principal', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{servico_principal}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Quantidade</label>
                <input
                  type="text"
                  value={proposalDraft.quantidade || ''}
                  onChange={(e) => updateProposalDraftField('quantidade', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{quantidade}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Prazo de entrega</label>
                <input
                  type="text"
                  value={proposalDraft.prazo || ''}
                  onChange={(e) => updateProposalDraftField('prazo', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{prazo}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor total (moeda)</label>
                <input
                  type="text"
                  value={proposalDraft.valor_total_moeda || ''}
                  onChange={(e) => updateProposalDraftField('valor_total_moeda', e.target.value)}
                  className="hinput w-full"
                  placeholder="{{valor_total_moeda}}"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Escopo comercial</label>
              <textarea
                value={proposalDraft.escopo_comercial || ''}
                onChange={(e) => updateProposalDraftField('escopo_comercial', e.target.value)}
                rows={3}
                className="hinput w-full resize-none"
                placeholder="{{escopo_comercial}}"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observacao adicional</label>
                <textarea
                  value={proposalDraft.observacao_adicional || ''}
                  onChange={(e) => updateProposalDraftField('observacao_adicional', e.target.value)}
                  rows={2}
                  className="hinput w-full resize-none"
                  placeholder="{{observacao_adicional}}"
                />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">CTA final</label>
                <textarea
                  value={proposalDraft.cta_aprovacao || ''}
                  onChange={(e) => updateProposalDraftField('cta_aprovacao', e.target.value)}
                  rows={2}
                  className="hinput w-full resize-none"
                  placeholder="{{cta_aprovacao}}"
                />
              </div>
            </div>

            {proposalMode === 'opcoes' && (
              <div className="space-y-2 border border-hagav-border rounded-lg p-2.5 bg-hagav-dark/35">
                <p className="text-[11px] text-hagav-gold uppercase tracking-wider">Opcoes de investimento</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="space-y-1.5 border border-hagav-border rounded-lg p-2">
                      <input
                        type="text"
                        value={proposalDraft[`opcao${index}_titulo`] || ''}
                        onChange={(e) => updateProposalDraftField(`opcao${index}_titulo`, e.target.value)}
                        className="hinput w-full"
                        placeholder={`{{opcao${index}_titulo}}`}
                      />
                      <input
                        type="text"
                        value={proposalDraft[`opcao${index}_qtd`] || ''}
                        onChange={(e) => updateProposalDraftField(`opcao${index}_qtd`, e.target.value)}
                        className="hinput w-full"
                        placeholder={`{{opcao${index}_qtd}}`}
                      />
                      <input
                        type="text"
                        value={proposalDraft[`opcao${index}_preco`] || ''}
                        onChange={(e) => updateProposalDraftField(`opcao${index}_preco`, e.target.value)}
                        className="hinput w-full"
                        placeholder={`{{opcao${index}_preco}}`}
                      />
                      <input
                        type="text"
                        value={proposalDraft[`opcao${index}_unitario`] || ''}
                        onChange={(e) => updateProposalDraftField(`opcao${index}_unitario`, e.target.value)}
                        className="hinput w-full"
                        placeholder={`{{opcao${index}_unitario}}`}
                      />
                      <input
                        type="text"
                        value={proposalDraft[`opcao${index}_desc`] || ''}
                        onChange={(e) => updateProposalDraftField(`opcao${index}_desc`, e.target.value)}
                        className="hinput w-full"
                        placeholder={`{{opcao${index}_desc}}`}
                      />
                      <input
                        type="text"
                        value={proposalDraft[`opcao${index}_desconto`] || ''}
                        onChange={(e) => updateProposalDraftField(`opcao${index}_desconto`, e.target.value)}
                        className="hinput w-full"
                        placeholder={`{{opcao${index}_desconto}}`}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Texto comparativo</label>
                  <textarea
                    value={proposalDraft.texto_comparativo || ''}
                    onChange={(e) => updateProposalDraftField('texto_comparativo', e.target.value)}
                    rows={2}
                    className="hinput w-full resize-none"
                    placeholder="{{texto_comparativo}}"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={hydrateProposalDraft}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm"
              >
                <RotateCw size={13} />
                Preencher automatico
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
                onClick={handleOpenProposalPreview}
                disabled={saving || pdfLoading || draftSaving}
                className="btn-ghost btn-sm"
              >
                <Eye size={13} />
                Preview HTML
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
                onChange={(e) => setPrecoFinal(e.target.value)}
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

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          {info && (
            <p className="text-xs text-hagav-light bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2">{info}</p>
          )}
        </div>

        <div className="drawer-foot orcamento-actions-foot">
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
          <div className="orcamento-action-block">
            <div className="orcamento-action-head">
              <p className="orcamento-action-kicker">Proposta e contato</p>
              <p className="orcamento-action-caption">Envie a proposta e avance a conversa com o cliente.</p>
            </div>
            <div className="orcamento-action-grid">
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
            </div>
          </div>

          <div className="orcamento-action-block">
            <div className="orcamento-action-head">
              <p className="orcamento-action-kicker">Operação</p>
              <p className="orcamento-action-caption">Ajustes manuais e encerramento da negociação quando necessário.</p>
            </div>
            <div className="orcamento-action-grid orcamento-action-grid-compact">
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
            </div>
          </div>

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
      </aside>
    </>
  );
}

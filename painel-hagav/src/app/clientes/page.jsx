'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Download,
  Eye,
  ExternalLink,
  FileText,
  MessageCircle,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Users,
  Undo2,
} from 'lucide-react';
import ContractPreview from '@/components/clientes/ContractPreview';
import CollapsibleActionBlock from '@/components/ui/CollapsibleActionBlock';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import EduTooltip from '@/components/ui/EduTooltip';
import {
  fetchClientesContratos,
  generateContractPdf,
  updateDeal,
} from '@/lib/supabase';
import {
  classNames,
  fmtBRL,
  fmtDate,
  fmtDateTime,
  fmtRelative,
  truncate,
  whatsappLink,
} from '@/lib/utils';

const STATUS_CONTRATO_LABELS = {
  aguardando_contrato: 'Aguardando contrato',
  ativo: 'Ativo',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
  encerrado: 'Encerrado',
};

const STATUS_CONTRATO_COLORS = {
  aguardando_contrato: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  ativo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  vencendo: 'bg-hagav-gold/20 text-hagav-gold border-hagav-gold/35',
  vencido: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  encerrado: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
};

const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega os contratos fechados com os filtros atuais.',
  purpose: 'Garantir visao atual para renovacao e pos-venda.',
  observe: 'Use antes de acionar renovacao ou encerramento.',
};

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

function cloneSelectedRow(row) {
  const detalhes = parseDetalhes(row?.detalhes);
  const contratoFromDetalhes = parseDetalhes(detalhes?.contrato);
  const contratoFromRow = parseDetalhes(row?.contrato);
  return {
    ...(row || {}),
    detalhes,
    contrato: {
      ...contratoFromDetalhes,
      ...contratoFromRow,
    },
  };
}

function isoDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(baseDate, monthsToAdd = 0) {
  const base = new Date(`${String(baseDate || '').slice(0, 10)}T12:00:00`);
  if (Number.isNaN(base.getTime())) return '';
  const safeMonths = Math.max(0, Number.parseInt(String(monthsToAdd || '0'), 10) || 0);
  const target = new Date(base);
  target.setMonth(target.getMonth() + safeMonths);
  return target.toISOString().slice(0, 10);
}

function toIsoRenewAlert(vencimento) {
  if (!vencimento) return null;
  const date = new Date(`${vencimento}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() - 15);
  return date.toISOString();
}

function downloadPdfFromBase64(base64, fileName) {
  if (!base64) return false;
  try {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || 'contrato-hagav.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

async function openOrDownloadPdfLink(link, fileName) {
  if (typeof window === 'undefined' || !link) return 'none';
  try {
    const response = await fetch(link, { method: 'GET' });
    if (!response.ok) throw new Error(`download_http_${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName || 'contrato-hagav.pdf';
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

function readContratoPdfMeta(row) {
  const detalhes = parseDetalhes(row?.detalhes);
  const contratoFromDetalhes = parseDetalhes(detalhes?.contrato);
  const contrato = {
    ...contratoFromDetalhes,
    ...parseDetalhes(row?.contrato),
  };

  const renderMode = String(contrato?.pdf_render_mode || row?.render_mode || '').trim();
  const pdfEngine = String(contrato?.pdf_engine || row?.pdf_engine || '').trim();
  const fallbackRaw = contrato?.pdf_fallback_used;
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
    fallbackReason: String(contrato?.pdf_fallback_reason || '').trim(),
    fallbackFrom: String(contrato?.pdf_fallback_from || '').trim(),
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

function getContratoPdfBlockedMessage(meta) {
  const renderMode = String(meta?.renderMode || '').trim();
  const pdfEngine = String(meta?.pdfEngine || '').trim();
  const fallbackUsed = Boolean(meta?.pdfFallbackUsed);
  if (!pdfEngine) {
    return 'Contrato bloqueado para uso comercial: engine HTML/CSS nao detectada. Configure PDF_ENGINE + BROWSERLESS_TOKEN (ou PDFSHIFT_API_KEY) no deploy.';
  }
  if (renderMode === 'native_text_fallback' || pdfEngine === 'native_text' || fallbackUsed) {
    return 'Contrato bloqueado para uso comercial: documento gerado em modo fallback/texto. Ative engine HTML real no deploy e gere novamente.';
  }
  return '';
}

function canUseContractPdf(row) {
  const link = String(row?.contrato_link_pdf || '').trim();
  if (!link) return false;
  const meta = readContratoPdfMeta(row);
  return isHtmlPdfReady(meta);
}

function BadgeContrato({ status }) {
  const key = String(status || '').toLowerCase();
  const label = STATUS_CONTRATO_LABELS[key] || 'Ativo';
  const color = STATUS_CONTRATO_COLORS[key] || STATUS_CONTRATO_COLORS.ativo;
  return <span className={classNames('badge', color)}>{label}</span>;
}

function resolveDisplayStatusContrato(row) {
  if (!row) return 'ativo';
  const base = String(row.status_contrato || '').toLowerCase();
  if (base === 'aguardando_contrato') return 'aguardando_contrato';
  if (base === 'vencendo') return 'vencendo';
  if (base === 'ativo' && Number.isFinite(row.dias_para_vencimento) && row.dias_para_vencimento >= 0 && row.dias_para_vencimento <= 15) {
    return 'vencendo';
  }
  if (base === 'vencido') return 'vencido';
  if (base === 'encerrado') return 'encerrado';
  return 'ativo';
}

function appendContratoHistorico(contratoAtual, evento) {
  const historicoAtual = Array.isArray(contratoAtual?.historico)
    ? contratoAtual.historico.filter((item) => item && typeof item === 'object')
    : [];
  return [...historicoAtual, evento].slice(-30);
}

function buildContractPreviewModel({
  row,
  nomeContratante,
  cpfCnpj,
  emailCliente,
  resumoServico,
  valorFinal,
  dataInicio,
  vencimento,
  duracaoMeses,
  responsavel,
  formaPagamento,
  pix,
  obsContrato,
  recorrente,
  statusEdicao,
}) {
  if (!row) return null;

  const contrato = row?.contrato || {};
  const valorNumerico = Number(valorFinal || row?.valor_contrato || row?.preco_final || row?.valor_sugerido || 0);
  const contractNumber = String(
    contrato?.numero_contrato
    || contrato?.contrato_numero
    || `CTR-${row?.id || ''}`
  ).trim();
  const emissionRaw = contrato?.data_emissao || new Date().toISOString();
  const previewStatus = String(statusEdicao || contrato?.status || resolveDisplayStatusContrato(row) || 'aguardando_contrato').toLowerCase();
  const durationSafe = Math.max(1, Number.parseInt(String(duracaoMeses || contrato?.duracao_meses || 12), 10) || 12);

  return {
    title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
    subtitle: 'Documento comercial para validação das partes, escopo contratado, investimento e vigência do atendimento.',
    contractNumber,
    emissionDate: fmtDate(emissionRaw),
    status: STATUS_CONTRATO_LABELS[previewStatus] || STATUS_CONTRATO_LABELS.aguardando_contrato,
    client: {
      name: String(nomeContratante || row?.nome || '').trim(),
      whatsapp: String(row?.whatsapp || '').trim(),
      document: String(cpfCnpj || contrato?.cpf_cnpj_cliente || contrato?.cpf_cnpj || '').trim(),
      email: String(emailCliente || contrato?.email_cliente || row?.email || '').trim(),
    },
    serviceSummary: String(
      resumoServico
      || contrato?.resumo_servico
      || contrato?.descricao_servico
      || row?.resumo_orcamento
      || row?.plano_servico
      || row?.servico
      || ''
    ).trim(),
    value: fmtBRL(Number.isFinite(valorNumerico) ? valorNumerico : 0),
    paymentMethod: String(formaPagamento || contrato?.forma_pagamento || 'A combinar').trim(),
    pix: String(pix || contrato?.pix || contrato?.chave_pix || '').trim(),
    startDate: fmtDate(dataInicio || contrato?.data_inicio || row?.inicio_contrato),
    endDate: fmtDate(vencimento || contrato?.data_fim || contrato?.vencimento || row?.vencimento_contrato),
    durationLabel: `${durationSafe} ${durationSafe === 1 ? 'mês' : 'meses'}`,
    responsible: String(responsavel || contrato?.responsavel || row?.responsavel || 'Time HAGAV').trim(),
    projectType: recorrente ? 'Recorrente' : 'Pontual',
    observation: String(obsContrato || contrato?.observacoes || '').trim(),
    terms: [
      {
        title: 'Prazos e fluxo',
        items: [
          'Os prazos são definidos conforme demanda, volume e complexidade do serviço.',
          'A produção inicia após envio completo dos materiais e briefing.',
          'Atrasos no envio de materiais ou feedback impactam diretamente os prazos.',
        ],
      },
      {
        title: 'Revisões',
        items: [
          'Inclui 1 rodada de ajustes por entrega.',
          'Mudanças de estrutura, roteiro, identidade visual ou refação total são tratadas como demanda adicional.',
        ],
      },
      {
        title: 'Rescisão e vigência',
        items: [
          'O contrato pode ser rescindido mediante aviso prévio de 15 dias.',
          'Será cobrado o valor proporcional aos serviços já prestados até a data da rescisão.',
        ],
      },
      {
        title: 'Prioridade e continuidade',
        items: [
          'Demandas urgentes dependem de disponibilidade e podem exigir ajuste de valor.',
          'A continuidade do atendimento depende da regularidade dos pagamentos.',
        ],
      },
    ],
  };
}

export default function ClientesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [search, setSearch] = useState('');
  const [statusContrato, setStatusContrato] = useState('');
  const [recorrenteFilter, setRecorrenteFilter] = useState('');
  const [renovacaoProximaOnly, setRenovacaoProximaOnly] = useState(false);

  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [valorFinal, setValorFinal] = useState('0');
  const [dataInicio, setDataInicio] = useState('');
  const [duracaoMeses, setDuracaoMeses] = useState('12');
  const [vencimento, setVencimento] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [pix, setPix] = useState('');
  const [nomeContratante, setNomeContratante] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [resumoServico, setResumoServico] = useState('');
  const [obsContrato, setObsContrato] = useState('');
  const [recorrente, setRecorrente] = useState(true);
  const [statusEdicao, setStatusEdicao] = useState('ativo');
  const [showLiveContractPreview, setShowLiveContractPreview] = useState(false);
  const [proposalContractCollapsed, setProposalContractCollapsed] = useState(false);
  const [operationCollapsed, setOperationCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchClientesContratos({
        search: search || undefined,
        statusContrato: statusContrato || undefined,
        recorrente: recorrenteFilter === '' ? undefined : (recorrenteFilter === 'sim'),
        onlyRenovacaoProxima: renovacaoProximaOnly,
        limit: 1000,
      });
      setRows(data);
    } catch (err) {
      console.error('[Clientes]', err);
      setLoadError('Nao foi possivel carregar clientes/contratos agora.');
    } finally {
      setLoading(false);
    }
  }, [search, statusContrato, recorrenteFilter, renovacaoProximaOnly]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const contrato = selected?.contrato || {};
    const hoje = isoDate(new Date().toISOString());
    const inicioDefault = isoDate(contrato?.data_inicio || selected?.inicio_contrato) || hoje;
    const duracaoDefault = String(contrato?.duracao_meses || 12);
    const vencimentoDefault = isoDate(contrato?.data_fim || contrato?.vencimento || selected?.vencimento_contrato)
      || addMonthsIso(inicioDefault, duracaoDefault)
      || inicioDefault;
    const resumoServicoDefault = String(
      contrato?.resumo_servico
      || contrato?.descricao_servico
      || selected?.resumo_orcamento
      || selected?.plano_servico
      || selected?.servico
      || selected?.pacote_sugerido
      || ''
    );

    setValorFinal(String(contrato?.valor_final || selected?.valor_contrato || selected?.preco_final || selected?.valor_sugerido || 0));
    setDataInicio(inicioDefault);
    setDuracaoMeses(duracaoDefault);
    setVencimento(vencimentoDefault);
    setResponsavel(String(contrato?.responsavel || selected?.responsavel_contrato || selected?.responsavel || 'Time HAGAV'));
    setFormaPagamento(String(contrato?.forma_pagamento || selected?.forma_pagamento_contrato || 'A combinar'));
    setPix(String(contrato?.pix || contrato?.chave_pix || ''));
    setNomeContratante(String(contrato?.nome_cliente || selected?.nome || ''));
    setCpfCnpj(String(contrato?.cpf_cnpj_cliente || contrato?.cpf_cnpj || ''));
    setEmailCliente(String(contrato?.email_cliente || selected?.email || ''));
    setResumoServico(resumoServicoDefault);
    setObsContrato(String(contrato?.observacoes || ''));
    setRecorrente(typeof contrato?.recorrente === 'boolean' ? contrato.recorrente : Boolean(selected?.recorrente_contrato));
    setStatusEdicao(String(contrato?.status || resolveDisplayStatusContrato(selected) || 'ativo'));
    setShowLiveContractPreview(false);
    setProposalContractCollapsed(false);
    setOperationCollapsed(false);
  }, [selected]);

  useEffect(() => {
    if (!selected?.id) return;
    const current = rows.find((row) => row.id === selected.id);
    if (!current) return;
    setSelected((prev) => {
      if (!prev || prev.id !== current.id) return prev;
      return cloneSelectedRow({ ...prev, ...current });
    });
  }, [rows, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const nextVencimento = addMonthsIso(dataInicio, duracaoMeses);
    if (!nextVencimento) return;
    if (nextVencimento === vencimento) return;
    setVencimento(nextVencimento);
  }, [dataInicio, duracaoMeses, selected, vencimento]);

  const metrics = useMemo(() => {
    const ativos = rows.filter((item) => resolveDisplayStatusContrato(item) === 'ativo').length;
    const vencendo = rows.filter((item) => resolveDisplayStatusContrato(item) === 'vencendo').length;
    const vencidos = rows.filter((item) => item.status_contrato === 'vencido').length;
    const encerrados = rows.filter((item) => item.status_contrato === 'encerrado').length;
    const renovacaoProxima = rows.filter((item) => item.renovacao_proxima).length;
    const receitaAtiva = rows
      .filter((item) => item.status_contrato !== 'encerrado')
      .reduce((sum, item) => sum + Number(item.valor_contrato || 0), 0);

    return {
      ativos,
      vencendo,
      vencidos,
      encerrados,
      renovacaoProxima,
      receitaAtiva,
    };
  }, [rows]);

  const contractPreview = useMemo(() => buildContractPreviewModel({
    row: selected,
    nomeContratante,
    cpfCnpj,
    emailCliente,
    resumoServico,
    valorFinal,
    dataInicio,
    vencimento,
    duracaoMeses,
    responsavel,
    formaPagamento,
    pix,
    obsContrato,
    recorrente,
    statusEdicao,
  }), [
    selected,
    nomeContratante,
    cpfCnpj,
    emailCliente,
    resumoServico,
    valorFinal,
    dataInicio,
    vencimento,
    duracaoMeses,
    responsavel,
    formaPagamento,
    pix,
    obsContrato,
    recorrente,
    statusEdicao,
  ]);

  async function handleGenerateContractPdf(row) {
    if (!row?.id) return;
    const isSelectedRow = Boolean(selected?.id && selected.id === row.id);
    const currentRow = isSelectedRow ? selected : cloneSelectedRow(row);
    const detalhesBase = parseDetalhes(currentRow?.detalhes);
    const contratoBase = parseDetalhes(currentRow?.contrato || detalhesBase?.contrato);
    const hojeIso = isoDate(new Date().toISOString());
    const duracaoSafe = isSelectedRow
      ? Math.max(1, Number.parseInt(String(duracaoMeses || contratoBase?.duracao_meses || 12), 10) || 12)
      : Math.max(1, Number.parseInt(String(contratoBase?.duracao_meses || 12), 10) || 12);
    const inicioGeracao = hojeIso;
    const fimGeracao = addMonthsIso(inicioGeracao, duracaoSafe) || inicioGeracao;
    const valorInput = isSelectedRow ? Number(valorFinal) : Number(contratoBase?.valor_final ?? currentRow?.valor_contrato ?? currentRow?.preco_final ?? currentRow?.valor_sugerido ?? 0);
    const valorSafe = Number.isFinite(valorInput) && valorInput > 0
      ? valorInput
      : Number(currentRow?.valor_contrato || currentRow?.preco_final || currentRow?.valor_sugerido || 0);
    const payloadContrato = {
      nome_cliente: isSelectedRow
        ? (String(nomeContratante || '').trim() || String(currentRow?.nome || '').trim())
        : (String(contratoBase?.nome_cliente || currentRow?.nome || '').trim()),
      cpf_cnpj: isSelectedRow ? String(cpfCnpj || '').trim() : String(contratoBase?.cpf_cnpj_cliente || contratoBase?.cpf_cnpj || '').trim(),
      email_cliente: isSelectedRow ? String(emailCliente || '').trim() : String(contratoBase?.email_cliente || currentRow?.email || '').trim(),
      forma_pagamento: isSelectedRow
        ? (String(formaPagamento || '').trim() || 'A combinar')
        : (String(contratoBase?.forma_pagamento || currentRow?.forma_pagamento_contrato || 'A combinar').trim()),
      pix: isSelectedRow ? String(pix || '').trim() : String(contratoBase?.pix || contratoBase?.chave_pix || '').trim(),
      resumo_servico: isSelectedRow
        ? (String(resumoServico || '').trim() || String(currentRow?.resumo_orcamento || currentRow?.plano_servico || currentRow?.servico || '').trim())
        : String(contratoBase?.resumo_servico || contratoBase?.descricao_servico || currentRow?.resumo_orcamento || currentRow?.plano_servico || currentRow?.servico || '').trim(),
      valor_total: Number.isFinite(valorSafe) ? valorSafe : 0,
      duracao_meses: duracaoSafe,
      data_inicio: inicioGeracao,
      data_fim: fimGeracao,
      responsavel: isSelectedRow
        ? (String(responsavel || '').trim() || String(currentRow?.responsavel || '').trim() || 'Time HAGAV')
        : (String(contratoBase?.responsavel || currentRow?.responsavel || 'Time HAGAV').trim()),
      observacoes: isSelectedRow ? String(obsContrato || '').trim() : String(contratoBase?.observacoes || '').trim(),
      recorrente: isSelectedRow ? Boolean(recorrente) : Boolean(contratoBase?.recorrente ?? currentRow?.recorrente_contrato),
      status: isSelectedRow
        ? String(statusEdicao || '').trim().toLowerCase()
        : String(contratoBase?.status || currentRow?.status_contrato || 'aguardando_contrato').trim().toLowerCase(),
    };

    try {
      setFeedback('Gerando PDF do contrato...');
      const result = await generateContractPdf(row.id, {
        payload: {
          contrato: payloadContrato,
        },
      });
      console.info('[Clientes][PDF][Resultado]', {
        deal_id: row.id,
        request_id: String(result?.request_id || ''),
        template_source: String(result?.template_source || ''),
        uploaded: Boolean(result?.uploaded),
        upload_reason: String(result?.upload_reason || ''),
        has_link_pdf: Boolean(String(result?.link_pdf || '').trim()),
        render_mode: String(result?.render_mode || ''),
        pdf_engine: String(result?.pdf_engine || ''),
        pdf_fallback_used: Boolean(result?.pdf_fallback_used),
      });
      const linkPdf = String(result?.link_pdf || '').trim();
      const nextMeta = {
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

      if (linkPdf) {
        const detalhesAtual = parseDetalhes(row?.detalhes);
        const contratoAtual = parseDetalhes(detalhesAtual?.contrato);
        const numeroGeracao = Number(result?.numero_geracao || contratoAtual?.numero_geracao || contratoAtual?.contractVersion || 0) || 0;
        const dataInicioPdf = String(result?.data_inicio_iso || payloadContrato.data_inicio || contratoAtual?.data_inicio || '');
        const dataFimPdf = String(result?.data_fim_iso || payloadContrato.data_fim || contratoAtual?.data_fim || contratoAtual?.vencimento || '');
        const contratoAtualizado = {
          ...contratoAtual,
          ...payloadContrato,
          numero_contrato: String(result?.numero_contrato || contratoAtual?.numero_contrato || ''),
          contrato_numero: String(result?.numero_contrato || contratoAtual?.contrato_numero || ''),
          numero_geracao: numeroGeracao || contratoAtual?.numero_geracao || 1,
          contractVersion: numeroGeracao || contratoAtual?.contractVersion || 1,
          numeroGeracao: numeroGeracao || contratoAtual?.numeroGeracao || 1,
          data_emissao: String(result?.data_emissao || contratoAtual?.data_emissao || ''),
          data_inicio: dataInicioPdf,
          data_fim: dataFimPdf,
          data_termino: dataFimPdf,
          vencimento: dataFimPdf,
          duracao_meses: Number(result?.duracao_meses || payloadContrato.duracao_meses || contratoAtual?.duracao_meses || 12) || 12,
          valor_total: Number(payloadContrato.valor_total || contratoAtual?.valor_total || 0) || 0,
          valor_final: Number(payloadContrato.valor_total || contratoAtual?.valor_final || 0) || 0,
          preco_final: Number(payloadContrato.valor_total || contratoAtual?.preco_final || 0) || 0,
          link_pdf: linkPdf,
          pdf_render_mode: nextMeta.renderMode,
          pdf_engine: nextMeta.pdfEngine,
          pdf_fallback_used: nextMeta.pdfFallbackUsed,
          pdf_fallback_from: nextMeta.fallbackFrom,
          pdf_fallback_reason: nextMeta.fallbackReason,
          pdf_comercial_liberado: isHtmlPdfReady(nextMeta),
        };
        const detalhesAtualizados = {
          ...detalhesAtual,
          contrato: contratoAtualizado,
        };
        const valorAtualizado = Number(payloadContrato.valor_total || row?.valor_contrato || 0) || 0;
        setRows((prev) => prev.map((item) => (
          item.id === row.id
            ? {
              ...item,
              contrato_link_pdf: linkPdf,
              detalhes: detalhesAtualizados,
              contrato: detalhesAtualizados.contrato,
              valor_contrato: valorAtualizado,
              preco_final: valorAtualizado,
              valor_fechado: valorAtualizado,
              vencimento_contrato: dataFimPdf || item?.vencimento_contrato,
              validade_ate: dataFimPdf || item?.validade_ate,
              inicio_contrato: dataInicioPdf || item?.inicio_contrato,
            }
            : item
        )));
        if (selected?.id === row.id) {
          setSelected((prev) => cloneSelectedRow({
            ...prev,
            contrato_link_pdf: linkPdf,
            detalhes: detalhesAtualizados,
            contrato: detalhesAtualizados.contrato,
            valor_contrato: valorAtualizado,
            preco_final: valorAtualizado,
            valor_fechado: valorAtualizado,
            vencimento_contrato: dataFimPdf || prev?.vencimento_contrato,
            validade_ate: dataFimPdf || prev?.validade_ate,
            inicio_contrato: dataInicioPdf || prev?.inicio_contrato,
          }));
          setDataInicio(dataInicioPdf || inicioGeracao);
          setVencimento(dataFimPdf || fimGeracao);
          setDuracaoMeses(String(result?.duracao_meses || payloadContrato.duracao_meses || duracaoSafe));
        }
      }

      if (!linkPdf) {
        setFeedback('Falha ao gerar link do contrato PDF.');
        setTimeout(() => setFeedback(''), 3200);
        return;
      }

      if (!isHtmlPdfReady(nextMeta)) {
        setFeedback(getContratoPdfBlockedMessage(nextMeta));
        setTimeout(() => setFeedback(''), 5200);
        return;
      }

      const fileName = String(result?.fileName || `contrato-${row.id}.pdf`);
      const downloadedFromPayload = downloadPdfFromBase64(String(result?.pdf_base64 || '').trim(), fileName);
      const openMode = downloadedFromPayload
        ? 'download'
        : await openOrDownloadPdfLink(linkPdf, fileName);
      const openedLabel = openMode === 'download'
        ? 'baixado'
        : (openMode === 'new_tab' ? 'aberto em nova aba' : 'aberto');
      const numeroContratoInfo = String(result?.numero_contrato || '').trim();
      setFeedback(`Contrato PDF gerado com sucesso${numeroContratoInfo ? ` (#${numeroContratoInfo})` : ''} e ${openedLabel}.`);
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      console.error('[Clientes][ContratoPDF][Erro]', {
        deal_id: row.id,
        message: String(err?.message || ''),
      });
      setFeedback(err.message || 'Falha ao gerar contrato PDF.');
      setTimeout(() => setFeedback(''), 3200);
    }
  }

  async function handleEnviarContratoWhatsApp(row) {
    if (!row) return;
    const pdfMeta = readContratoPdfMeta(row);
    const contratoLink = String(row?.contrato_link_pdf || '').trim();
    if (!contratoLink) {
      setFeedback('Gere o contrato PDF antes de enviar no WhatsApp.');
      setTimeout(() => setFeedback(''), 3200);
      return;
    }
    if (!isHtmlPdfReady(pdfMeta)) {
      setFeedback(getContratoPdfBlockedMessage(pdfMeta));
      setTimeout(() => setFeedback(''), 5200);
      return;
    }

    const whatsapp = String(row?.whatsapp || '').trim();
    if (!whatsapp) {
      setFeedback('WhatsApp do cliente indisponivel para envio do contrato.');
      setTimeout(() => setFeedback(''), 3200);
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const detalhesAtual = parseDetalhes(row?.detalhes);
      const contratoAtual = parseDetalhes(detalhesAtual?.contrato);
      const mensagem = `Ola, ${row.nome || 'cliente'}. Segue o contrato da HAGAV para assinatura: ${contratoLink}. Qualquer duvida, me chama aqui.`;

      if (typeof window !== 'undefined') {
        const target = whatsappLink(whatsapp, mensagem);
        window.open(target, '_blank', 'noopener,noreferrer');
      }

      const updated = await updateDeal(row.id, {
        ultimo_contato_em: nowIso,
        detalhes: {
          ...detalhesAtual,
          contrato: {
            ...contratoAtual,
            link_pdf: contratoLink,
            contrato_enviado_em: nowIso,
            atualizado_em: nowIso,
          },
        },
      });

      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, ...updated } : item)));
      if (selected?.id === row.id) {
        setSelected((prev) => cloneSelectedRow({ ...prev, ...updated }));
      }

      setFeedback('Contrato enviado no WhatsApp com sucesso.');
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      console.error('[Clientes][EnviarContratoWhatsApp]', err);
      setFeedback(err.message || 'Falha ao enviar contrato no WhatsApp.');
      setTimeout(() => setFeedback(''), 3200);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContrato(statusOverride, acao = 'salvar') {
    if (!selected) return;

    const valor = Number(valorFinal);
    if (!Number.isFinite(valor) || valor <= 0) {
      setFeedback('Informe um valor final valido.');
      return;
    }

    const inicioSafe = isoDate(dataInicio) || isoDate(selected?.inicio_contrato) || isoDate(new Date().toISOString());
    const duracaoSafe = Math.max(1, Number.parseInt(String(duracaoMeses || '12'), 10) || 12);
    const vencimentoSafe = addMonthsIso(inicioSafe, duracaoSafe) || isoDate(vencimento) || inicioSafe;
    const responsavelSafe = String(responsavel || '').trim() || String(selected?.responsavel || '').trim() || 'Time HAGAV';
    const formaPagamentoSafe = String(formaPagamento || '').trim() || 'A combinar';
    const pixSafe = String(pix || '').trim();
    const nomeContratanteSafe = String(nomeContratante || '').trim() || String(selected?.nome || '').trim();
    const cpfCnpjSafe = String(cpfCnpj || '').trim();
    const emailClienteSafe = String(emailCliente || '').trim();
    const resumoServicoSafe = String(resumoServico || '').trim()
      || String(selected?.resumo_orcamento || selected?.plano_servico || selected?.servico || selected?.pacote_sugerido || '').trim();
    const observacoesSafe = String(obsContrato || '').trim();

    if (!inicioSafe || !vencimentoSafe) {
      setFeedback('Preencha inicio e vencimento para salvar o contrato.');
      return;
    }

    const nowIso = new Date().toISOString();
    const nextStatus = String(statusOverride || statusEdicao || 'ativo').toLowerCase();
    const detalhesAtual = parseDetalhes(selected?.detalhes);
    const contratoAtual = parseDetalhes(detalhesAtual?.contrato);
    const renovacaoAlerta = toIsoRenewAlert(vencimentoSafe);
    const statusDeal = nextStatus === 'aguardando_contrato' ? 'aprovado' : 'fechado';

    let tipoHistorico = 'atualizacao';
    if (acao === 'ativar') tipoHistorico = 'ativacao';
    if (acao === 'renovar') tipoHistorico = 'renovacao';
    if (acao === 'encerrar') tipoHistorico = 'encerramento';

    const eventoHistorico = {
      tipo: tipoHistorico,
      em: nowIso,
      status_anterior: String(contratoAtual?.status || selected?.status_contrato || ''),
      status_novo: nextStatus,
      vencimento_anterior: String(contratoAtual?.vencimento || selected?.vencimento_contrato || ''),
      vencimento_novo: vencimentoSafe,
      valor_novo: valor,
      responsavel: responsavelSafe,
    };

    const detalhesContrato = {
      ...contratoAtual,
      valor_final: valor,
      data_inicio: inicioSafe,
      duracao_meses: duracaoSafe,
      vencimento: vencimentoSafe,
      observacoes: observacoesSafe,
      responsavel: responsavelSafe,
      forma_pagamento: formaPagamentoSafe,
      pix: pixSafe,
      chave_pix: pixSafe,
      nome_cliente: nomeContratanteSafe,
      cpf_cnpj_cliente: cpfCnpjSafe,
      email_cliente: emailClienteSafe,
      resumo_servico: resumoServicoSafe,
      data_fim: vencimentoSafe,
      data_termino: vencimentoSafe,
      recorrente: Boolean(recorrente),
      status: nextStatus,
      atualizado_em: nowIso,
      renovacao_alerta_em: renovacaoAlerta,
      ativado_em: (acao === 'ativar' || nextStatus === 'ativo')
        ? (contratoAtual?.ativado_em || nowIso)
        : (contratoAtual?.ativado_em || null),
      renovado_em: acao === 'renovar' ? nowIso : (contratoAtual?.renovado_em || null),
      encerrado_em: nextStatus === 'encerrado' ? nowIso : null,
      historico: appendContratoHistorico(contratoAtual, eventoHistorico),
    };

    setSaving(true);
    try {
      const updated = await updateDeal(selected.id, {
        status: statusDeal,
        preco_final: valor,
        valor_fechado: valor,
        validade_ate: vencimentoSafe,
        responsavel: responsavelSafe,
        proximo_followup_em: nextStatus === 'encerrado' ? null : renovacaoAlerta,
        detalhes: {
          ...detalhesAtual,
          contrato: detalhesContrato,
        },
      });

      setRows((prev) => prev.map((item) => (item.id === selected.id ? { ...item, ...updated } : item)));
      setSelected((prev) => cloneSelectedRow({ ...prev, ...updated }));
      if (nextStatus === 'encerrado') {
        setFeedback('Contrato encerrado com sucesso.');
      } else if (acao === 'ativar') {
        setFeedback('Cliente ativado com sucesso.');
      } else if (acao === 'renovar') {
        setFeedback('Contrato renovado com sucesso.');
      } else {
        setFeedback('Contrato atualizado com sucesso.');
      }
      setTimeout(() => setFeedback(''), 2800);
    } catch (err) {
      console.error('[Clientes][Save]', err);
      setFeedback(err.message || 'Falha ao atualizar contrato.');
      setTimeout(() => setFeedback(''), 3200);
    } finally {
      setSaving(false);
    }
  }

  async function handleReabrirNegociacao() {
    if (!selected) return;

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const detalhesAtual = parseDetalhes(selected?.detalhes);
      const contratoAtual = parseDetalhes(detalhesAtual?.contrato);
      const historico = appendContratoHistorico(contratoAtual, {
        tipo: 'reabertura_negociacao',
        em: nowIso,
        status_anterior: String(contratoAtual?.status || selected?.status_contrato || ''),
        status_novo: 'encerrado',
      });

      await updateDeal(selected.id, {
        status: 'orcamento',
        proximo_followup_em: nowIso,
        detalhes: {
          ...detalhesAtual,
          contrato: {
            ...contratoAtual,
            status: 'encerrado',
            encerrado_em: nowIso,
            atualizado_em: nowIso,
            historico,
          },
        },
      });

      setRows((prev) => prev.filter((item) => item.id !== selected.id));
      setSelected(null);
      setFeedback('Negociacao reaberta: deal movido para Orcamentos.');
      setTimeout(() => setFeedback(''), 3200);
    } catch (err) {
      console.error('[Clientes][Reabrir]', err);
      setFeedback(err.message || 'Falha ao reabrir negociacao.');
      setTimeout(() => setFeedback(''), 3200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">
            {loading ? 'Carregando...' : `${rows.length} contrato${rows.length !== 1 ? 's' : ''} fechado${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <EduTooltip {...UPDATE_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </EduTooltip>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Ativos</p>
          <p className="text-lg font-bold text-emerald-300">{metrics.ativos}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Vencendo</p>
          <p className="text-lg font-bold text-hagav-gold">{metrics.vencendo}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Vencidos</p>
          <p className="text-lg font-bold text-amber-300">{metrics.vencidos}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Encerrados</p>
          <p className="text-lg font-bold text-hagav-gray">{metrics.encerrados}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Renovacao proxima</p>
          <p className="text-lg font-bold text-hagav-gold">{metrics.renovacaoProxima}</p>
        </div>
        <div className="hcard p-4 text-center border-hagav-gold/30">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Receita ativa</p>
          <p className="text-lg font-bold text-hagav-gold">{fmtBRL(metrics.receitaAtiva)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente, WhatsApp, servico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hinput w-full pl-8 text-sm"
          />
        </div>

        <select value={statusContrato} onChange={(e) => setStatusContrato(e.target.value)} className="hselect">
          <option value="">Status contrato</option>
          <option value="aguardando_contrato">Aguardando contrato</option>
          <option value="ativo">Ativo</option>
          <option value="vencendo">Vencendo</option>
          <option value="vencido">Vencido</option>
          <option value="encerrado">Encerrado</option>
        </select>

        <select value={recorrenteFilter} onChange={(e) => setRecorrenteFilter(e.target.value)} className="hselect">
          <option value="">Recorrente?</option>
          <option value="sim">Sim</option>
          <option value="nao">Nao</option>
        </select>

        <button
          type="button"
          onClick={() => setRenovacaoProximaOnly((prev) => !prev)}
          className={classNames('btn-ghost btn-sm', renovacaoProximaOnly && 'border-hagav-gold/40 text-hagav-gold')}
        >
          <CalendarClock size={12} />
          So renovacao proxima
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>
      )}
      {feedback && (
        <p className="text-xs text-hagav-light bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2">{feedback}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente fechado ainda"
          description="Assim que um orcamento for fechado com contrato, ele aparece aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hagav-border">
          <table className="htable min-w-[1300px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servico/Plano</th>
                <th>Valor</th>
                <th>Inicio</th>
                <th>Vencimento</th>
                <th>Recorrente</th>
                <th>Status contrato</th>
                <th>Responsavel</th>
                <th>Renovacao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => setSelected(cloneSelectedRow(row))}>
                  <td>
                    <div>
                      <p className="font-medium text-hagav-white">{row.nome || 'Sem nome'}</p>
                      <p className="text-[11px] text-hagav-gray font-mono">{row.whatsapp || '—'}</p>
                    </div>
                  </td>
                  <td className="text-xs text-hagav-light max-w-[220px]" title={row.plano_servico || row.servico || ''}>
                    {truncate(row.plano_servico || row.servico || '—', 54)}
                  </td>
                  <td className="text-sm font-semibold text-hagav-gold">{fmtBRL(row.valor_contrato || 0)}</td>
                  <td className="text-xs text-hagav-light">{fmtDate(row.inicio_contrato)}</td>
                  <td>
                    <p className="text-xs text-hagav-light">{fmtDate(row.vencimento_contrato)}</p>
                    {Number.isFinite(row.dias_para_vencimento) && (
                      <p className="text-[11px] text-hagav-gray">{row.dias_para_vencimento} dia(s)</p>
                    )}
                  </td>
                  <td className="text-xs text-hagav-light">{row.recorrente_contrato ? 'Sim' : 'Nao'}</td>
                  <td><BadgeContrato status={resolveDisplayStatusContrato(row)} /></td>
                  <td className="text-xs text-hagav-light">{row.responsavel_contrato || row.responsavel || '—'}</td>
                  <td>
                    {row.renovacao_alerta_em ? (
                      <div>
                        <p className="text-xs text-hagav-light">{fmtDateTime(row.renovacao_alerta_em)}</p>
                        <p className="text-[11px] text-hagav-gray">{fmtRelative(row.renovacao_alerta_em)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-hagav-gray">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); setSelected(cloneSelectedRow(row)); }}>
                        <FileText size={12} /> Ver
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); handleGenerateContractPdf(row); }}>
                        <Download size={12} /> Contrato PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Contrato do cliente"
        width={showLiveContractPreview ? 'max-w-6xl' : 'max-w-3xl'}
        bodyClassName={showLiveContractPreview ? 'overflow-hidden' : ''}
      >
        {selected && (
          <div
            className={
              showLiveContractPreview
                ? 'grid gap-4 max-h-[min(72vh,940px)] grid-rows-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:grid-cols-[minmax(0,1.06fr)_minmax(340px,0.94fr)] xl:grid-rows-1'
                : 'space-y-3'
            }
          >
            <div className={showLiveContractPreview ? 'min-h-0 overflow-y-auto pr-1 space-y-3' : 'space-y-3'}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-hagav-gold uppercase tracking-wider">Contrato comercial</p>
                  <p className="text-[11px] text-hagav-gray">Revise e personalize o documento antes de gerar ou enviar.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLiveContractPreview((prev) => !prev)}
                  className={`btn-ghost btn-sm ${showLiveContractPreview ? 'border-hagav-gold/70 text-hagav-gold bg-hagav-gold/10' : ''}`}
                >
                  <Eye size={12} />
                  {showLiveContractPreview ? 'Ocultar preview ao vivo' : 'Preview ao vivo'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="md:col-span-2">
                  <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Dados do contratante</p>
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Nome do contratante</label>
                  <input type="text" value={nomeContratante} onChange={(e) => setNomeContratante(e.target.value)} className="hinput w-full" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">WhatsApp</label>
                  <input type="text" value={selected.whatsapp || ''} disabled className="hinput w-full opacity-80" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">CPF/CNPJ</label>
                  <input type="text" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} className="hinput w-full" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">E-mail</label>
                  <input type="email" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} className="hinput w-full" />
                </div>

                <div className="md:col-span-2 mt-1">
                  <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Servico</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Resumo do servico</label>
                  <textarea rows={2} value={resumoServico} onChange={(e) => setResumoServico(e.target.value)} className="hinput w-full resize-none" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor final (R$)</label>
                  <input type="number" min="0" step="0.01" value={valorFinal} onChange={(e) => setValorFinal(e.target.value)} className="hinput w-full" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Duracao (meses)</label>
                  <input type="number" min="1" step="1" value={duracaoMeses} onChange={(e) => setDuracaoMeses(e.target.value)} className="hinput w-full" />
                </div>

                <div className="md:col-span-2 mt-1">
                  <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Pagamento</p>
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Forma de pagamento</label>
                  <input type="text" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="hinput w-full" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Chave PIX</label>
                  <input type="text" value={pix} onChange={(e) => setPix(e.target.value)} className="hinput w-full" />
                </div>

                <div className="md:col-span-2 mt-1">
                  <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Contrato</p>
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Data inicio</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="hinput w-full" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Vencimento (auto)</label>
                  <input type="date" value={vencimento} readOnly className="hinput w-full opacity-80" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Responsavel</label>
                  <input type="text" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="hinput w-full" />
                </div>
                <div>
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Status contrato</label>
                  <select value={statusEdicao} onChange={(e) => setStatusEdicao(e.target.value)} className="hselect w-full">
                    <option value="aguardando_contrato">Aguardando contrato</option>
                    <option value="ativo">Ativo</option>
                    <option value="vencendo">Vencendo</option>
                    <option value="vencido">Vencido</option>
                    <option value="encerrado">Encerrado</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-hagav-light self-end pb-2">
                  <input
                    type="checkbox"
                    checked={recorrente}
                    onChange={(e) => setRecorrente(e.target.checked)}
                    className="rounded border-hagav-border bg-hagav-surface"
                  />
                  Contrato recorrente
                </label>
                <div className="md:col-span-2">
                  <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observacoes do contrato</label>
                  <textarea rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} className="hinput w-full resize-none" />
                </div>
              </div>

              {feedback && (
                <p className="text-xs text-hagav-light bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2">
                  {feedback}
                </p>
              )}

              <CollapsibleActionBlock
                title="Proposta e contrato"
                description="Envie a proposta e avance a conversa com o cliente."
                collapsed={proposalContractCollapsed}
                onToggle={() => setProposalContractCollapsed((prev) => !prev)}
                contentClassName="orcamento-action-grid"
              >
                <button
                  type="button"
                  className={`btn-ghost btn-sm orcamento-action-button ${showLiveContractPreview ? 'border-hagav-gold/70 text-hagav-gold bg-hagav-gold/10' : ''}`}
                  onClick={() => setShowLiveContractPreview((prev) => !prev)}
                  disabled={saving}
                >
                  <Eye size={12} />
                  Preview ao vivo
                </button>
                <button type="button" className="btn-ghost btn-sm orcamento-action-button" onClick={() => handleGenerateContractPdf(selected)} disabled={saving}>
                  <Download size={12} /> Gerar contrato PDF
                </button>
                <button
                  type="button"
                  className={`btn-ghost btn-sm orcamento-action-button ${!canUseContractPdf(selected) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  onClick={() => handleEnviarContratoWhatsApp(selected)}
                  disabled={saving || !canUseContractPdf(selected)}
                >
                  <MessageCircle size={12} /> Enviar contrato no WhatsApp
                </button>
                {canUseContractPdf(selected) ? (
                  <a href={selected.contrato_link_pdf} target="_blank" rel="noreferrer" className="btn-ghost btn-sm orcamento-action-button">
                    <ExternalLink size={12} /> Ver contrato
                  </a>
                ) : (
                  <span className="text-xs text-hagav-gray md:col-span-2 xl:col-span-3">
                    {String(selected?.contrato_link_pdf || '').trim()
                      ? getContratoPdfBlockedMessage(readContratoPdfMeta(selected))
                      : 'Gere o contrato PDF para habilitar envio e visualizacao.'}
                  </span>
                )}
              </CollapsibleActionBlock>

              <CollapsibleActionBlock
                title="Operação"
                description="Ajustes manuais e encerramento da negociação quando necessário."
                collapsed={operationCollapsed}
                onToggle={() => setOperationCollapsed((prev) => !prev)}
                contentClassName="orcamento-action-grid"
              >
                <button type="button" className="btn-gold btn-sm orcamento-action-button" onClick={() => handleSaveContrato('ativo', 'ativar')} disabled={saving}>
                  {saving ? <RefreshCw size={12} className="animate-spin" /> : <Power size={12} />}
                  Ativar cliente
                </button>
                <button type="button" className="btn-ghost btn-sm orcamento-action-button" onClick={() => handleSaveContrato('ativo', 'renovar')} disabled={saving}>
                  {saving ? <RefreshCw size={12} className="animate-spin" /> : <RotateCw size={12} />}
                  Renovar contrato
                </button>
                <button type="button" className="btn-ghost btn-sm orcamento-action-button" onClick={() => handleSaveContrato(statusEdicao, 'salvar')} disabled={saving}>
                  <RefreshCw size={12} /> Salvar alteracoes
                </button>
                <button type="button" className="btn-ghost btn-sm orcamento-action-button" onClick={() => handleSaveContrato('encerrado', 'encerrar')} disabled={saving}>
                  <Power size={12} /> Encerrar contrato
                </button>
                <button type="button" className="btn-ghost btn-sm orcamento-action-button" onClick={handleReabrirNegociacao} disabled={saving}>
                  <Undo2 size={12} /> Reabrir negociacao
                </button>
              </CollapsibleActionBlock>
            </div>

            {showLiveContractPreview && (
              <div className="min-h-0 overflow-y-auto pl-0 pr-1 space-y-2 xl:pl-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-hagav-gray uppercase tracking-wider">Preview do contrato</p>
                  <span className="text-[11px] text-hagav-gray">Atualiza conforme você edita.</span>
                </div>
                <ContractPreview preview={contractPreview} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

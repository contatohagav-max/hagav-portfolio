'use client';

import { useState } from 'react';
import { X, Save, Loader2, MessageCircle, ExternalLink, AlertTriangle, CheckCircle2, Send, Ban } from 'lucide-react';
import { OrcStatusBadge, PrioridadeBadge, UrgenciaBadge, TemperaturaBadge } from '@/components/ui/StatusBadge';
import EduTooltip from '@/components/ui/EduTooltip';
import Modal from '@/components/ui/Modal';
import { generateDealPdf, updateOrcamento } from '@/lib/supabase';
import { fmtDateTime, fmtBRL, whatsappLink, ORC_STATUS_LABELS } from '@/lib/utils';

const ORC_STATUSES = ['orcamento', 'proposta_enviada', 'ajustando', 'aprovado', 'perdido'];
const WHATSAPP_TOOLTIP = {
  title: 'WhatsApp',
  whatIs: 'Abre o contato direto do cliente no WhatsApp.',
  purpose: 'Acelerar negociacao e confirmacoes de proposta.',
  observe: 'Use mensagem objetiva com proximo passo claro.',
};

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

function downloadPdfFromBase64(base64, fileName) {
  if (!base64) return;
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'proposta-hagav.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [contratoValorFinal, setContratoValorFinal] = useState(String(orc?.preco_final || orc?.valor_sugerido || 0));
  const [contratoInicio, setContratoInicio] = useState('');
  const [contratoDuracao, setContratoDuracao] = useState('12');
  const [contratoVencimento, setContratoVencimento] = useState('');
  const [contratoObs, setContratoObs] = useState('');
  const [contratoFormaPagamento, setContratoFormaPagamento] = useState('');
  const [contratoRecorrente, setContratoRecorrente] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

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
  const canCloseContract = ['aprovado', 'proposta_enviada', 'ajustando', 'orcamento'].includes(String(statusOrc || '').toLowerCase());

  async function handleSave() {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento: statusOrc,
        preco_final: Number(precoFinal),
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
        preco_final: Number(precoFinal),
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
    setInfo('');
    try {
      const result = await generateDealPdf(orc.id);
      if (result?.pdf_base64) {
        downloadPdfFromBase64(result.pdf_base64, result.fileName || `proposta-${orc.id}.pdf`);
      }

      const nextLink = String(result?.link_pdf || '').trim();
      if (nextLink) {
        onUpdated?.({
          ...orc,
          link_pdf: nextLink,
        });
      }

      setInfo(nextLink ? 'PDF gerado e link atualizado.' : 'PDF gerado para download local.');
    } catch (err) {
      setError(err.message || 'Falha ao gerar PDF.');
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleCloseContract() {
    const valorFinal = Number(contratoValorFinal);
    if (!Number.isFinite(valorFinal) || valorFinal <= 0) {
      setError('Informe um valor final valido para fechar o contrato.');
      return;
    }
    if (!contratoInicio || !contratoDuracao || !contratoVencimento || !responsavel || !contratoFormaPagamento || !contratoObs.trim()) {
      setError('Preencha todos os campos obrigatorios para fechar o contrato.');
      return;
    }

    const nowIso = new Date().toISOString();
    const detalhesAtual = parseDetalhes(orc.detalhes);
    const renovacaoDate = contratoVencimento
      ? (() => {
        const date = new Date(`${contratoVencimento}T12:00:00`);
        if (Number.isNaN(date.getTime())) return null;
        date.setDate(date.getDate() - 15);
        return date.toISOString();
      })()
      : null;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento: 'fechado',
        preco_final: valorFinal,
        valor_fechado: valorFinal,
        fechado_em: nowIso,
        validade_ate: contratoVencimento || null,
        observacoes_internas: [obsInternas, contratoObs].filter(Boolean).join('\n').trim(),
        responsavel,
        proximo_followup_em: renovacaoDate || fromDateTimeLocal(followup),
        detalhes: {
          ...detalhesAtual,
          contrato: {
            valor_final: valorFinal,
            data_inicio: contratoInicio,
            duracao_meses: Number(contratoDuracao || 0) || null,
            vencimento: contratoVencimento,
            observacoes: contratoObs.trim(),
            responsavel: responsavel.trim(),
            forma_pagamento: contratoFormaPagamento.trim(),
            recorrente: Boolean(contratoRecorrente),
            status: 'ativo',
            gerado_em: nowIso,
            atualizado_em: nowIso,
            renovacao_alerta_em: renovacaoDate,
          },
        },
      });

      let mergedUpdated = updated;
      try {
        const pdfResult = await generateDealPdf(orc.id);
        if (pdfResult?.pdf_base64) {
          downloadPdfFromBase64(pdfResult.pdf_base64, pdfResult.fileName || `contrato-${orc.id}.pdf`);
        }
        const nextLink = String(pdfResult?.link_pdf || '').trim();
        if (nextLink) {
          mergedUpdated = {
            ...updated,
            link_pdf: nextLink,
          };
        }
      } catch (pdfError) {
        setInfo('Contrato fechado. PDF nao foi gerado automaticamente; gere manualmente no botao PDF.');
        console.error('[OrcamentoDrawer][PDF]', pdfError);
      }

      onUpdated?.(mergedUpdated);
      setCloseModalOpen(false);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao fechar contrato.');
    } finally {
      setSaving(false);
    }
  }

  const waLink = whatsappLink(orc.whatsapp, `Ola ${orc.nome || ''}, aqui e a HAGAV Studio.`);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-hagav-border shrink-0">
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-1">Orcamento #{orc.id}</p>
            <h2 className="text-lg font-bold text-hagav-white">{orc.nome || 'Sem nome'}</h2>
            <p className="text-sm text-hagav-gray">{servicoResumo || '—'}</p>
          </div>
          <button onClick={onClose} className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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
            <InfoRow label="Preco final editavel" value={fmtBRL(precoFinal || orc.preco_base)} />
            <InfoRow label="Margem estimada" value={`${Number(orc.margem_estimada || 0).toFixed(1)}%`} />
            <InfoRow label="Valor potencial" value={fmtBRL(orc.valor_estimado || orc.preco_final || orc.preco_base)} />
            <InfoRow label="Pacote sugerido" value={orc.pacote_sugerido || '—'} />
            <InfoRow label="Faixa sugerida" value={orc.faixa_sugerida || '—'} />
          </div>

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

        <div className="px-6 py-4 border-t border-hagav-border shrink-0 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleQuickStatus('proposta_enviada')}
            disabled={saving || pdfLoading}
            className="btn-ghost btn-sm"
          >
            <Send size={13} />
            Enviar proposta
          </button>
          <button
            type="button"
            onClick={() => handleQuickStatus('perdido')}
            disabled={saving || pdfLoading}
            className="btn-ghost btn-sm"
          >
            <Ban size={13} />
            Marcar perdido
          </button>
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={saving || pdfLoading}
            className="btn-ghost btn-sm"
          >
            {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Gerar proposta PDF
          </button>
          {canCloseContract && (
            <button
              type="button"
              onClick={() => setCloseModalOpen(true)}
              disabled={saving || pdfLoading}
              className="btn-gold btn-sm"
            >
              <CheckCircle2 size={13} />
              Fechar contrato
            </button>
          )}
          <EduTooltip {...WHATSAPP_TOOLTIP} className="w-auto">
            <a href={waLink} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
              <MessageCircle size={13} />
              WhatsApp
              <ExternalLink size={11} className="opacity-50" />
            </a>
          </EduTooltip>
          <button onClick={handleSave} disabled={saving || pdfLoading} className="btn-gold flex-1 justify-center">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </aside>

      <Modal open={closeModalOpen} onClose={() => setCloseModalOpen(false)} title="Fechamento comercial" width="max-w-2xl">
        <div className="space-y-3">
          <p className="text-xs text-hagav-gray">
            Informe os dados comerciais para gerar contrato e mover o deal para fechado.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor final (R$)</label>
              <input type="number" min="0" step="0.01" value={contratoValorFinal} onChange={(e) => setContratoValorFinal(e.target.value)} className="hinput w-full" />
            </div>
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Data inicio</label>
              <input type="date" value={contratoInicio} onChange={(e) => setContratoInicio(e.target.value)} className="hinput w-full" />
            </div>
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Duracao (meses)</label>
              <input type="number" min="1" step="1" value={contratoDuracao} onChange={(e) => setContratoDuracao(e.target.value)} className="hinput w-full" />
            </div>
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Vencimento</label>
              <input type="date" value={contratoVencimento} onChange={(e) => setContratoVencimento(e.target.value)} className="hinput w-full" />
            </div>
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Responsavel</label>
              <input type="text" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="hinput w-full" placeholder="Ex.: Vinicius" />
            </div>
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Forma de pagamento</label>
              <input type="text" value={contratoFormaPagamento} onChange={(e) => setContratoFormaPagamento(e.target.value)} className="hinput w-full" placeholder="PIX, boleto, cartao..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observacoes do contrato</label>
              <textarea rows={3} value={contratoObs} onChange={(e) => setContratoObs(e.target.value)} className="hinput w-full resize-none" placeholder="Condicoes comerciais, observacoes e combinados." />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-hagav-light">
            <input
              type="checkbox"
              checked={contratoRecorrente}
              onChange={(e) => setContratoRecorrente(e.target.checked)}
              className="rounded border-hagav-border bg-hagav-surface"
            />
            Contrato recorrente
          </label>
          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCloseModalOpen(false)} disabled={saving}>Cancelar</button>
            <button type="button" className="btn-gold btn-sm" onClick={handleCloseContract} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Gerar contrato
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

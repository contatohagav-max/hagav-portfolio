'use client';

import { useState } from 'react';
import { X, MessageCircle, ExternalLink, Save, Loader2, FilePlus2, Ban } from 'lucide-react';
import {
  LeadStatusBadge,
  PrioridadeBadge,
  UrgenciaBadge,
  TemperaturaBadge,
} from '@/components/ui/StatusBadge';
import EduTooltip from '@/components/ui/EduTooltip';
import { updateLead } from '@/lib/supabase';
import { fmtDateTime, whatsappLink, LEAD_STATUS_LABELS, fmtBRL } from '@/lib/utils';

const LEAD_STATUSES = ['novo', 'contatado', 'qualificado', 'descartado'];
const WHATSAPP_TOOLTIP = {
  title: 'WhatsApp',
  whatIs: 'Abre conversa direta com o contato no WhatsApp.',
  purpose: 'Agilizar follow-up e acelerar avancos no funil.',
  observe: 'Confirme contexto e proxima acao antes de enviar.',
};

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

function InfoCard({ label, value }) {
  return (
    <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
      <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-hagav-light font-medium break-all">{value || '—'}</p>
    </div>
  );
}

export default function LeadDrawer({ lead, onClose, onUpdated }) {
  const [status, setStatus] = useState(lead?.status ?? 'novo');
  const [obs, setObs] = useState(lead?.observacoes ?? '');
  const [proximaAcao, setProximaAcao] = useState(lead?.proxima_acao ?? '');
  const [prioridade, setPrioridade] = useState(lead?.prioridade ?? 'media');
  const [urgencia, setUrgencia] = useState(lead?.urgencia ?? 'media');
  const [ultimoContato, setUltimoContato] = useState(toDateTimeLocal(lead?.ultimo_contato_em));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!lead) return null;

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateLead(lead.id, {
        status,
        observacoes: obs,
        proxima_acao: proximaAcao,
        prioridade,
        urgencia,
        ultimo_contato_em: fromDateTimeLocal(ultimoContato),
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateOrcamento() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateLead(lead.id, {
        status: 'orcamento',
        observacoes: obs,
        proxima_acao: proximaAcao,
        prioridade,
        urgencia,
        ultimo_contato_em: fromDateTimeLocal(ultimoContato),
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao gerar orcamento.');
    } finally {
      setSaving(false);
    }
  }

  function markContactNow() {
    const now = new Date();
    setUltimoContato(toDateTimeLocal(now.toISOString()));
  }

  async function handleDescartar() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateLead(lead.id, {
        status: 'descartado',
        observacoes: obs,
        proxima_acao: proximaAcao,
        prioridade,
        urgencia,
        ultimo_contato_em: fromDateTimeLocal(ultimoContato),
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao descartar lead.');
    } finally {
      setSaving(false);
    }
  }

  const statusOptions = Array.from(new Set([
    ...LEAD_STATUSES,
    status || 'novo',
  ]));
  const canGenerateOrcamento = String(status || '').toLowerCase() === 'qualificado';

  const waLink = lead.whatsapp
    ? whatsappLink(lead.whatsapp, `Ola ${lead.nome || ''}, aqui e a HAGAV Studio!`)
    : '';

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />

      <aside className="drawer-panel flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-hagav-border shrink-0">
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-1">Lead #{lead.id}</p>
            <h2 className="text-lg font-bold text-hagav-white">{lead.nome || 'Sem nome'}</h2>
            <p className="text-xs text-hagav-gray mt-1">{lead.fluxo || '—'} · {lead.origem || '—'}</p>
          </div>
          <button onClick={onClose} className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="WhatsApp" value={lead.whatsapp} />
            <InfoCard label="Pagina" value={lead.pagina} />
            <InfoCard label="Servico" value={lead.servico} />
            <InfoCard label="Valor estimado" value={fmtBRL(lead.valor_estimado)} />
            <InfoCard label="Criado em" value={fmtDateTime(lead.created_at)} />
            <InfoCard label="Ultimo contato" value={lead.ultimo_contato_em ? fmtDateTime(lead.ultimo_contato_em) : 'Sem contato'} />
          </div>

          <div className="flex flex-wrap gap-2">
            <LeadStatusBadge status={lead.status} />
            <PrioridadeBadge prioridade={lead.prioridade} />
            <UrgenciaBadge urgencia={lead.urgencia} />
            <TemperaturaBadge temperatura={lead.temperatura} />
            <span className="badge bg-hagav-gold/15 text-hagav-gold border-hagav-gold/30">Score {lead.score_lead ?? 0}</span>
          </div>

          <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Resumo comercial</p>
            <p className="text-sm text-hagav-light whitespace-pre-wrap">{lead.resumo_comercial || 'Sem resumo.'}</p>
          </div>

          <div className="gold-line" />

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="hselect w-full">
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>{LEAD_STATUS_LABELS[item] || item}</option>
                  ))}
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
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Urgencia</label>
                <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className="hselect w-full">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Proxima acao</label>
              <input
                type="text"
                value={proximaAcao}
                onChange={(e) => setProximaAcao(e.target.value)}
                className="hinput w-full"
                placeholder="Ex.: enviar proposta ate 18h"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-hagav-gray uppercase tracking-wider block">Ultimo contato</label>
                <button type="button" onClick={markContactNow} className="text-xs text-hagav-gold hover:text-hagav-gold-light">
                  Marcar agora
                </button>
              </div>
              <input
                type="datetime-local"
                value={ultimoContato}
                onChange={(e) => setUltimoContato(e.target.value)}
                className="hinput w-full"
              />
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observacoes internas</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={4}
                placeholder="Anotacoes internas sobre este lead..."
                className="hinput w-full resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-hagav-border shrink-0 flex items-center gap-3">
          {canGenerateOrcamento && (
            <button onClick={handleGenerateOrcamento} disabled={saving} className="btn-gold">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
              Gerar orcamento
            </button>
          )}
          {waLink ? (
            <EduTooltip {...WHATSAPP_TOOLTIP} className="flex-1">
              <a href={waLink} target="_blank" rel="noreferrer" className="btn-ghost w-full justify-center">
                <MessageCircle size={15} />
                WhatsApp
                <ExternalLink size={12} className="opacity-50" />
              </a>
            </EduTooltip>
          ) : (
            <span className="btn-ghost flex-1 justify-center cursor-not-allowed opacity-50">
              <MessageCircle size={15} />
              WhatsApp indisponivel
            </span>
          )}
          <button type="button" onClick={handleDescartar} disabled={saving} className="btn-ghost">
            <Ban size={15} />
            Descartar
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-gold flex-1 justify-center">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar
          </button>
        </div>
      </aside>
    </>
  );
}

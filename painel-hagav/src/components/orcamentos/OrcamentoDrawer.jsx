'use client';

import { useState } from 'react';
import { X, Save, Loader2, MessageCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { OrcStatusBadge, PrioridadeBadge, UrgenciaBadge, TemperaturaBadge } from '@/components/ui/StatusBadge';
import { updateOrcamento } from '@/lib/supabase';
import { fmtDateTime, fmtBRL, whatsappLink, ORC_STATUS_LABELS } from '@/lib/utils';

const ORC_STATUSES = Object.keys(ORC_STATUS_LABELS);

function InfoRow({ label, value }) {
  return (
    <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
      <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-hagav-light font-medium break-words">{value || '—'}</p>
    </div>
  );
}

export default function OrcamentoDrawer({ orc, onClose, onUpdated }) {
  const [statusOrc, setStatusOrc] = useState(orc?.status_orcamento ?? 'pendente_revisao');
  const [precoFinal, setPrecoFinal] = useState(orc?.preco_final ?? 0);
  const [obsInternas, setObsInternas] = useState(orc?.observacoes_internas ?? '');
  const [urgencia, setUrgencia] = useState(orc?.urgencia ?? 'media');
  const [prioridade, setPrioridade] = useState(orc?.prioridade ?? 'media');
  const [proximaAcao, setProximaAcao] = useState(orc?.proxima_acao ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!orc) return null;

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento: statusOrc,
        preco_final: Number(precoFinal),
        observacoes_internas: obsInternas,
        urgencia,
        prioridade,
        proxima_acao: proximaAcao,
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar.');
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
            <p className="text-sm text-hagav-gray">{orc.servico || '—'}</p>
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
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Preco final</p>
              <p className="text-2xl font-bold text-hagav-gold">{fmtBRL(precoFinal || orc.preco_base)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <InfoRow label="Margem estimada" value={`${Number(orc.margem_estimada || 0).toFixed(1)}%`} />
            <InfoRow label="Valor potencial" value={fmtBRL(orc.valor_estimado || orc.preco_final || orc.preco_base)} />
            <InfoRow label="Pacote sugerido" value={orc.pacote_sugerido || '—'} />
          </div>

          <div className="flex flex-wrap gap-2">
            <OrcStatusBadge status={orc.status_orcamento} />
            <UrgenciaBadge urgencia={orc.urgencia} />
            <PrioridadeBadge prioridade={orc.prioridade} />
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
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="Servico/Operacao" value={orc.servico} />
              <InfoRow label="Quantidade" value={orc.quantidade} />
              <InfoRow label="Material gravado" value={orc.material_gravado} />
              <InfoRow label="Tempo bruto" value={orc.tempo_bruto} />
              <InfoRow label="Prazo" value={orc.prazo} />
              <InfoRow label="Referencia" value={orc.referencia} />
              <InfoRow label="Origem" value={orc.origem} />
              <InfoRow label="Criado em" value={fmtDateTime(orc.created_at)} />
            </div>
          </div>

          {orc.observacoes && (
            <div>
              <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Observacoes do cliente</p>
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-sm text-hagav-light whitespace-pre-wrap">
                {orc.observacoes}
              </div>
            </div>
          )}

          {orc.detalhes && (
            <div>
              <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">JSON tecnico (backup)</p>
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-xs text-hagav-gray whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                {orc.detalhes}
              </div>
            </div>
          )}

          <div className="gold-line" />

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Status</label>
                <select value={statusOrc} onChange={(e) => setStatusOrc(e.target.value)} className="hselect w-full">
                  {ORC_STATUSES.map((status) => (
                    <option key={status} value={status}>{ORC_STATUS_LABELS[status]}</option>
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
        </div>

        <div className="px-6 py-4 border-t border-hagav-border shrink-0 flex items-center gap-2">
          <a href={waLink} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            <MessageCircle size={13} />
            WhatsApp
            <ExternalLink size={11} className="opacity-50" />
          </a>
          <button onClick={handleSave} disabled={saving} className="btn-gold flex-1 justify-center">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </aside>
    </>
  );
}

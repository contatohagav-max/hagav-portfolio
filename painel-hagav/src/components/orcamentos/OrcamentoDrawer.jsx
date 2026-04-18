'use client';

import { useState } from 'react';
import { X, Save, Loader2, FileDown, MessageCircle, ExternalLink } from 'lucide-react';
import { OrcStatusBadge } from '@/components/ui/StatusBadge';
import { updateOrcamento } from '@/lib/supabase';
import { fmtDateTime, fmtBRL, whatsappLink, ORC_STATUS_LABELS } from '@/lib/utils';

const ORC_STATUSES = Object.keys(ORC_STATUS_LABELS);

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
      <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-hagav-light font-medium break-words">{value}</p>
    </div>
  );
}

export default function OrcamentoDrawer({ orc, onClose, onUpdated }) {
  const [statusOrc, setStatusOrc] = useState(orc?.status_orcamento ?? 'pendente_revisao');
  const [precoFinal, setPrecoFinal] = useState(orc?.preco_final ?? 0);
  const [obsInternas, setObsInternas] = useState(orc?.observacoes_internas ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!orc) return null;

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateOrcamento(orc.id, {
        status_orcamento:   statusOrc,
        preco_final:        Number(precoFinal),
        observacoes_internas: obsInternas,
      });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const waLink = whatsappLink(orc.whatsapp, `Olá ${orc.nome}, seguem detalhes do seu orçamento HAGAV Studio!`);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-hagav-border shrink-0">
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-1">Orçamento #{orc.id}</p>
            <h2 className="text-lg font-bold text-hagav-white">{orc.nome || 'Sem nome'}</h2>
            <p className="text-sm text-hagav-gray">{orc.servico || '—'}</p>
          </div>
          <button onClick={onClose} className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Prices highlight */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-hagav-surface border border-hagav-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Preço base</p>
              <p className="text-2xl font-bold text-hagav-white">{fmtBRL(orc.preco_base)}</p>
              {orc.pacote_sugerido && (
                <p className="text-xs text-hagav-gray mt-1">{orc.pacote_sugerido}</p>
              )}
            </div>
            <div className="bg-hagav-gold/5 border border-hagav-gold/20 rounded-xl p-4 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Preço final</p>
              <p className="text-2xl font-bold text-hagav-gold">{fmtBRL(orc.preco_final || orc.preco_base)}</p>
              <p className="text-xs text-hagav-gray mt-1">Editável abaixo</p>
            </div>
          </div>

          {/* Resumo */}
          {orc.resumo_orcamento && (
            <div className="bg-hagav-surface border border-hagav-gold/20 rounded-lg p-4">
              <p className="text-[10px] text-hagav-gold uppercase tracking-wider mb-1.5">Cálculo automático</p>
              <p className="text-sm text-hagav-light whitespace-pre-wrap leading-relaxed">{orc.resumo_orcamento}</p>
            </div>
          )}

          {/* Form details */}
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Detalhes do formulário</p>
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="Serviço"          value={orc.servico} />
              <InfoRow label="Quantidade"       value={orc.quantidade} />
              <InfoRow label="Tempo bruto"      value={orc.tempo_bruto} />
              <InfoRow label="Material gravado" value={orc.material_gravado} />
              <InfoRow label="Prazo"            value={orc.prazo} />
              <InfoRow label="Referência"       value={orc.referencia} />
              <InfoRow label="Origem"           value={orc.origem} />
              <InfoRow label="Criado em"        value={fmtDateTime(orc.created_at)} />
            </div>
          </div>

          {orc.observacoes && (
            <div>
              <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Observações do cliente</p>
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-sm text-hagav-light whitespace-pre-wrap">
                {orc.observacoes}
              </div>
            </div>
          )}

          {orc.detalhes && (
            <div>
              <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Detalhes adicionais</p>
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-sm text-hagav-light whitespace-pre-wrap">
                {orc.detalhes}
              </div>
            </div>
          )}

          <div className="gold-line" />

          {/* Editable */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Status do orçamento</label>
              <select value={statusOrc} onChange={e => setStatusOrc(e.target.value)} className="hselect w-full">
                {ORC_STATUSES.map(s => (
                  <option key={s} value={s}>{ORC_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Preço final (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precoFinal}
                onChange={e => setPrecoFinal(e.target.value)}
                className="hinput w-full"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observações internas</label>
              <textarea
                value={obsInternas}
                onChange={e => setObsInternas(e.target.value)}
                rows={4}
                placeholder="Anotações internas, alinhamentos, pendências…"
                className="hinput w-full resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-hagav-border shrink-0 flex items-center gap-2">
          <a href={waLink} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            <MessageCircle size={13} />
            WhatsApp
            <ExternalLink size={11} className="opacity-50" />
          </a>
          <button className="btn-ghost btn-sm opacity-50 cursor-not-allowed" disabled title="Em breve">
            <FileDown size={13} />
            PDF
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-gold flex-1 justify-center">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </aside>
    </>
  );
}

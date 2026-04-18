'use client';

import { useState } from 'react';
import { X, MessageCircle, ExternalLink, Save, Loader2 } from 'lucide-react';
import { LeadStatusBadge } from '@/components/ui/StatusBadge';
import { updateLead } from '@/lib/supabase';
import { fmtDateTime, whatsappLink, classNames, LEAD_STATUS_LABELS } from '@/lib/utils';

const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS);

export default function LeadDrawer({ lead, onClose, onUpdated }) {
  const [status, setStatus]     = useState(lead?.status ?? 'novo');
  const [obs, setObs]           = useState(lead?.observacoes ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  if (!lead) return null;

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateLead(lead.id, { status, observacoes: obs });
      onUpdated?.(updated);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const waLink = whatsappLink(lead.whatsapp, `Olá ${lead.nome}, aqui é a HAGAV Studio!`);

  return (
    <>
      {/* Overlay */}
      <div className="drawer-overlay" onClick={onClose} />

      {/* Panel */}
      <aside className="drawer-panel flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-hagav-border shrink-0">
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-1">Lead #{lead.id}</p>
            <h2 className="text-lg font-bold text-hagav-white">{lead.nome || 'Sem nome'}</h2>
          </div>
          <button onClick={onClose} className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'WhatsApp',      value: lead.whatsapp || '—' },
              { label: 'Origem',        value: lead.origem || '—' },
              { label: 'Fluxo',         value: lead.fluxo || '—' },
              { label: 'Página',        value: lead.pagina || '—' },
              { label: 'Criado em',     value: fmtDateTime(lead.created_at) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
                <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm text-hagav-light font-medium break-all">{value}</p>
              </div>
            ))}

            <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Status atual</p>
              <LeadStatusBadge status={lead.status} />
            </div>
          </div>

          {/* Observações do lead */}
          {lead.observacoes && (
            <div>
              <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Observações (lead)</p>
              <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-sm text-hagav-light whitespace-pre-wrap">
                {lead.observacoes}
              </div>
            </div>
          )}

          <div className="gold-line" />

          {/* Editable fields */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Alterar status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="hselect w-full"
              >
                {LEAD_STATUSES.map(s => (
                  <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observações internas</label>
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={4}
                placeholder="Anotações internas sobre este lead…"
                className="hinput w-full resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-hagav-border shrink-0 flex items-center gap-3">
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost flex-1 justify-center"
          >
            <MessageCircle size={15} />
            WhatsApp
            <ExternalLink size={12} className="opacity-50" />
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-gold flex-1 justify-center"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar
          </button>
        </div>
      </aside>
    </>
  );
}

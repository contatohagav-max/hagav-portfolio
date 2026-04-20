'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Kanban, Siren, Clock3 } from 'lucide-react';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import EmptyState from '@/components/ui/EmptyState';
import EduTooltip from '@/components/ui/EduTooltip';
import { fetchLeads } from '@/lib/supabase';
import { isLeadFollowupLate } from '@/lib/commercial';
import LeadDrawer from '@/components/leads/LeadDrawer';

const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega os leads e as etapas do pipeline.',
  purpose: 'Garantir que o time trabalhe com o estado mais atual.',
  observe: 'Use antes de mover cards ou priorizar contatos.',
};

export default function PipelinePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [selectedLead, setSelectedLead] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchLeads({ limit: 1500 });
      setLeads(data);
    } catch (err) {
      console.error('[Pipeline]', err);
      setLoadError('Nao foi possivel carregar o pipeline. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const urgentes = leads
    .filter((lead) => ['alta', 'media'].includes(String(lead.urgencia || '').toLowerCase()))
    .filter((lead) => lead.status !== 'fechado' && lead.status !== 'perdido')
    .length;
  const now = new Date();
  const atrasados = leads.filter((lead) => isLeadFollowupLate(lead, now)).length;

  function handleStatusFeedback(next) {
    if (!next?.message) return;
    setFeedback(next);
    setTimeout(() => setFeedback({ type: '', message: '' }), 2600);
  }

  function handleLeadUpdated(updated) {
    setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? updated : lead)));
    setFeedback({ type: 'success', message: 'Lead atualizado com sucesso.' });
    setTimeout(() => setFeedback({ type: '', message: '' }), 2600);
  }

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Pipeline</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} no funil`}
          </p>
        </div>
        <EduTooltip {...UPDATE_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </EduTooltip>
      </div>

      {!loading && leads.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div className="hcard p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-hagav-gray">
              <Siren size={13} className="text-red-300" /> Prioridade imediata
            </div>
            <p className="text-2xl font-bold text-hagav-white mt-2">{urgentes}</p>
          </div>
          <div className="hcard p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-hagav-gray">
              <Clock3 size={13} className="text-yellow-300" /> Follow-up vencido
            </div>
            <p className="text-2xl font-bold text-hagav-white mt-2">{atrasados}</p>
          </div>
        </div>
      )}

      <p className="text-xs text-hagav-gray shrink-0">
        Arraste os cards para mover o lead no funil comercial (Novo &gt; Contatado &gt; Proposta &gt; Fechado &gt; Perdido).
      </p>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 shrink-0">
          {loadError}
        </p>
      )}
      {feedback.message && (
        <p className={`text-xs rounded-lg px-3 py-2 shrink-0 border ${feedback.type === 'error' ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'}`}>
          {feedback.message}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 flex-1">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="Nenhum lead no pipeline"
          description="Leads cadastrados aparecerao aqui para acompanhamento."
          className="flex-1"
        />
      ) : (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            initialLeads={leads}
            onLeadsChange={setLeads}
            onStatusPersist={handleStatusFeedback}
            onSelectLead={setSelectedLead}
          />
        </div>
      )}

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdated={handleLeadUpdated}
        />
      )}
    </div>
  );
}


'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Kanban, Siren, Clock3 } from 'lucide-react';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import EmptyState from '@/components/ui/EmptyState';
import { fetchLeads } from '@/lib/supabase';

export default function PipelinePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLeads({ limit: 900 });
      setLeads(data);
    } catch (err) {
      console.error('[Pipeline]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const urgentes = leads.filter((lead) => lead.urgencia === 'alta' && lead.status !== 'fechado' && lead.status !== 'perdido').length;
  const atrasados = leads.filter((lead) => {
    if (lead.status === 'fechado' || lead.status === 'perdido') return false;
    const next = lead.proximo_followup_em ? new Date(lead.proximo_followup_em).getTime() : null;
    if (Number.isFinite(next)) return next < Date.now();
    return false;
  }).length;

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Pipeline</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} no funil`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
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
          <KanbanBoard initialLeads={leads} />
        </div>
      )}
    </div>
  );
}


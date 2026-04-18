'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Kanban } from 'lucide-react';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import EmptyState from '@/components/ui/EmptyState';
import { fetchLeads } from '@/lib/supabase';

export default function PipelinePage() {
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLeads({ limit: 500 });
      setLeads(data);
    } catch (err) {
      console.error('[Pipeline]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Pipeline</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando…' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} no funil`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <p className="text-xs text-hagav-gray shrink-0">
        Arraste os cards entre colunas para atualizar o status do lead automaticamente.
      </p>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center py-20 flex-1">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="Nenhum lead no pipeline"
          description="Leads cadastrados aparecerão aqui para acompanhamento."
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Users } from 'lucide-react';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadDrawer from '@/components/leads/LeadDrawer';
import EmptyState from '@/components/ui/EmptyState';
import { fetchLeads } from '@/lib/supabase';
import { LEAD_STATUS_LABELS } from '@/lib/utils';

const FLUXOS = ['', 'DU', 'DR', 'HOME', 'Portfólio', 'WhatsApp', 'Contato'];

export default function LeadsPage() {
  const [leads, setLeads]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  // Filters
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [origem, setOrigem]     = useState('');
  const [fluxo, setFluxo]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeads({
        status:  status || undefined,
        origem:  origem || undefined,
        fluxo:   fluxo  || undefined,
        search:  search || undefined,
      });
      setLeads(data);
    } catch (err) {
      console.error('[Leads]', err);
    } finally {
      setLoading(false);
    }
  }, [search, status, origem, fluxo]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  function handleUpdated(updated) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
  }

  // Unique origens from data
  const origens = [...new Set(leads.map(l => l.origem).filter(Boolean))];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Leads</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando…' : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nome ou WhatsApp…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="hinput w-full pl-8 text-sm"
          />
        </div>

        <select value={status} onChange={e => setStatus(e.target.value)} className="hselect">
          <option value="">Todos os status</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select value={fluxo} onChange={e => setFluxo(e.target.value)} className="hselect">
          <option value="">Todos os fluxos</option>
          {FLUXOS.filter(Boolean).map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {origens.length > 0 && (
          <select value={origem} onChange={e => setOrigem(e.target.value)} className="hselect">
            <option value="">Todas as origens</option>
            {origens.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum lead encontrado"
          description="Tente ajustar os filtros ou aguarde novos leads chegarem."
        />
      ) : (
        <LeadsTable leads={leads} onSelect={setSelected} />
      )}

      {/* Drawer */}
      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}

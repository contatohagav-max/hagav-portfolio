'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Users, Flame, Clock3, Target } from 'lucide-react';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadDrawer from '@/components/leads/LeadDrawer';
import EmptyState from '@/components/ui/EmptyState';
import { fetchLeads } from '@/lib/supabase';
import { LEAD_STATUS_LABELS } from '@/lib/utils';

const FLUXOS = ['', 'DU', 'DR', 'WhatsApp', 'Contato'];

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');
  const [fluxo, setFluxo] = useState('');
  const [urgencia, setUrgencia] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [followupAtrasado, setFollowupAtrasado] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeads({
        status: status || undefined,
        origem: origem || undefined,
        fluxo: fluxo || undefined,
        search: search || undefined,
        urgencia: urgencia || undefined,
        prioridade: prioridade || undefined,
        temperatura: temperatura || undefined,
        onlyFollowupLate: followupAtrasado,
        limit: 800,
      });
      setLeads(data);
    } catch (err) {
      console.error('[Leads]', err);
    } finally {
      setLoading(false);
    }
  }, [search, status, origem, fluxo, urgencia, prioridade, temperatura, followupAtrasado]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function handleUpdated(updated) {
    setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? updated : lead)));
  }

  const origens = [...new Set(leads.map((lead) => lead.origem).filter(Boolean))];
  const quentes = leads.filter((lead) => lead.temperatura === 'Quente').length;
  const urgentes = leads.filter((lead) => lead.urgencia === 'alta').length;
  const followupLateCount = leads.filter((lead) => {
    if (lead.status === 'fechado' || lead.status === 'perdido') return false;
    const now = Date.now();
    const nextDate = lead.proximo_followup_em ? new Date(lead.proximo_followup_em).getTime() : null;
    if (Number.isFinite(nextDate)) return nextDate < now;
    const lastContact = lead.ultimo_contato_em ? new Date(lead.ultimo_contato_em).getTime() : null;
    if (Number.isFinite(lastContact)) return (now - lastContact) > (1000 * 60 * 60 * 48);
    return false;
  }).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Leads</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="hcard p-4">
          <div className="flex items-center gap-2 text-hagav-gray text-xs uppercase tracking-wider">
            <Flame size={13} className="text-red-300" /> Leads quentes
          </div>
          <p className="text-2xl font-bold text-hagav-white mt-2">{quentes}</p>
        </div>
        <div className="hcard p-4">
          <div className="flex items-center gap-2 text-hagav-gray text-xs uppercase tracking-wider">
            <Target size={13} className="text-yellow-300" /> Alta urgencia
          </div>
          <p className="text-2xl font-bold text-hagav-white mt-2">{urgentes}</p>
        </div>
        <div className="hcard p-4">
          <div className="flex items-center gap-2 text-hagav-gray text-xs uppercase tracking-wider">
            <Clock3 size={13} className="text-orange-300" /> Follow-up atrasado
          </div>
          <p className="text-2xl font-bold text-hagav-white mt-2">{followupLateCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nome, WhatsApp ou observacoes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hinput w-full pl-8 text-sm"
          />
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className="hselect">
          <option value="">Todos os status</option>
          {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select value={fluxo} onChange={(e) => setFluxo(e.target.value)} className="hselect">
          <option value="">Todos os fluxos</option>
          {FLUXOS.filter(Boolean).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className="hselect">
          <option value="">Urgencia</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baixa">Baixa</option>
        </select>

        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="hselect">
          <option value="">Prioridade</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baixa">Baixa</option>
        </select>

        <select value={temperatura} onChange={(e) => setTemperatura(e.target.value)} className="hselect">
          <option value="">Temperatura</option>
          <option value="Quente">Quente</option>
          <option value="Morno">Morno</option>
          <option value="Frio">Frio</option>
        </select>

        {origens.length > 0 && (
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="hselect">
            <option value="">Todas as origens</option>
            {origens.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setFollowupAtrasado((prev) => !prev)}
          className={`btn-ghost btn-sm ${followupAtrasado ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
        >
          <Clock3 size={12} />
          So atrasados
        </button>
      </div>

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

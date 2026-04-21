'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, RefreshCw, Users, Flame, Clock3, Target } from 'lucide-react';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadDrawer from '@/components/leads/LeadDrawer';
import EmptyState from '@/components/ui/EmptyState';
import EduTooltip from '@/components/ui/EduTooltip';
import { fetchLeads } from '@/lib/supabase';
import { LEAD_STATUS_LABELS } from '@/lib/utils';

const FLUXOS = ['', 'DU', 'DR', 'WhatsApp', 'Contato'];
const LEAD_ACTIVE_STATUSES = ['novo', 'contatado', 'qualificado'];
const LEAD_ALLOWED_STATUSES = [...LEAD_ACTIVE_STATUSES, 'descartado'];
const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega a lista de leads com os filtros atuais.',
  purpose: 'Evitar decisao com dados antigos.',
  observe: 'Use apos novos contatos ou alteracoes de status.',
};

function normalizeLeadStatus(value) {
  return String(value || '').toLowerCase();
}

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selected, setSelected] = useState(null);
  const [showDescartados, setShowDescartados] = useState(searchParams.get('descartados') === '1');

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [origem, setOrigem] = useState(searchParams.get('origem') || '');
  const [fluxo, setFluxo] = useState(searchParams.get('fluxo') || '');
  const [urgencia, setUrgencia] = useState(searchParams.get('urgencia') || '');
  const [prioridade, setPrioridade] = useState(searchParams.get('prioridade') || '');
  const [temperatura, setTemperatura] = useState(searchParams.get('temperatura') || '');
  const [followupAtrasado, setFollowupAtrasado] = useState(searchParams.get('followup') === '1');

  useEffect(() => {
    const showDiscarded = searchParams.get('descartados') === '1';
    setShowDescartados(showDiscarded);
    setSearch(searchParams.get('search') || '');
    setStatus(showDiscarded ? '' : (searchParams.get('status') || ''));
    setOrigem(searchParams.get('origem') || '');
    setFluxo(searchParams.get('fluxo') || '');
    setUrgencia(searchParams.get('urgencia') || '');
    setPrioridade(searchParams.get('prioridade') || '');
    setTemperatura(searchParams.get('temperatura') || '');
    setFollowupAtrasado(searchParams.get('followup') === '1');
  }, [searchParams]);

  useEffect(() => {
    if (showDescartados && status) setStatus('');
  }, [showDescartados, status]);

  const isLeadVisible = useCallback((lead) => {
    const normalizedStatus = normalizeLeadStatus(lead?.status);
    if (!LEAD_ALLOWED_STATUSES.includes(normalizedStatus)) return false;
    if (showDescartados) return normalizedStatus === 'descartado';
    if (status) return normalizedStatus === status;
    return normalizedStatus !== 'descartado';
  }, [showDescartados, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchLeads({
        status: showDescartados ? 'descartado' : (status || undefined),
        origem: origem || undefined,
        fluxo: fluxo || undefined,
        search: search || undefined,
        urgencia: urgencia || undefined,
        prioridade: prioridade || undefined,
        temperatura: temperatura || undefined,
        onlyFollowupLate: showDescartados ? false : followupAtrasado,
        limit: 800,
      });
      setLeads((data || []).filter(isLeadVisible));
    } catch (err) {
      console.error('[Leads]', err);
      setLoadError('Nao foi possivel carregar os leads. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [search, status, origem, fluxo, urgencia, prioridade, temperatura, followupAtrasado, showDescartados, isLeadVisible]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function handleUpdated(updated) {
    setLeads((prev) => {
      const mapped = prev.map((lead) => (lead.id === updated.id ? updated : lead));
      const hasUpdated = mapped.some((lead) => lead.id === updated.id);
      const withUpdated = hasUpdated ? mapped : [updated, ...mapped];
      return withUpdated.filter(isLeadVisible);
    });

    if (selected?.id === updated?.id && !isLeadVisible(updated)) {
      setSelected(null);
    } else if (selected?.id === updated?.id) {
      setSelected(updated);
    }

    const normalized = normalizeLeadStatus(updated?.status);
    if (normalized === 'orcamento') {
      setFeedback('Lead movido para Orcamentos.');
    } else if (normalized === 'descartado') {
      setFeedback('Lead descartado com sucesso.');
    } else {
      setFeedback('Lead salvo com sucesso.');
    }
    setTimeout(() => setFeedback(''), 2500);
  }

  const visibleLeadCount = leads.length;
  const origens = [...new Set(leads.map((lead) => lead.origem).filter(Boolean))];
  const quentes = leads.filter((lead) => lead.temperatura === 'Quente').length;
  const urgentes = leads.filter((lead) => lead.urgencia === 'alta').length;
  const followupLateCount = leads.filter((lead) => {
    if (normalizeLeadStatus(lead.status) === 'descartado') return false;
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
            {loading ? 'Carregando...' : `${visibleLeadCount} ${showDescartados ? 'descartado' : 'lead'}${visibleLeadCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <EduTooltip {...UPDATE_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </EduTooltip>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`btn-ghost btn-sm ${!showDescartados ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
          onClick={() => setShowDescartados(false)}
        >
          Leads ativos
        </button>
        <button
          type="button"
          className={`btn-ghost btn-sm ${showDescartados ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
          onClick={() => setShowDescartados(true)}
        >
          Descartados
        </button>
      </div>

      {!showDescartados && (
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
      )}

      {loadError && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>
      )}
      {feedback && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{feedback}</p>
      )}

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

        <select value={status} onChange={(e) => setStatus(e.target.value)} className="hselect" disabled={showDescartados}>
          <option value="">Todos os status</option>
          {LEAD_ACTIVE_STATUSES.map((value) => (
            <option key={value} value={value}>{LEAD_STATUS_LABELS[value] || value}</option>
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
          disabled={showDescartados}
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
          title={showDescartados ? 'Nenhum lead descartado encontrado' : 'Nenhum lead encontrado'}
          description={showDescartados ? 'Os leads descartados aparecem aqui para consulta.' : 'Tente ajustar os filtros ou aguarde novos leads chegarem.'}
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

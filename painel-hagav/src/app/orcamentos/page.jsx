'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, FileText, AlertTriangle, ClipboardList } from 'lucide-react';
import OrcamentosTable from '@/components/orcamentos/OrcamentosTable';
import OrcamentoDrawer from '@/components/orcamentos/OrcamentoDrawer';
import EmptyState from '@/components/ui/EmptyState';
import { fetchOrcamentos } from '@/lib/supabase';
import { ORC_STATUS_LABELS, fmtBRL } from '@/lib/utils';

export default function OrcamentosPage() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [search, setSearch] = useState('');
  const [statusOrc, setStatusOrc] = useState('');
  const [urgencia, setUrgencia] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [incompletoOnly, setIncompletoOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrcamentos({
        statusOrcamento: statusOrc || undefined,
        search: search || undefined,
        urgencia: urgencia || undefined,
        prioridade: prioridade || undefined,
        incompleto: incompletoOnly || undefined,
        limit: 800,
      });
      setOrcamentos(data);
    } catch (err) {
      console.error('[Orcamentos]', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusOrc, urgencia, prioridade, incompletoOnly]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function handleUpdated(updated) {
    setOrcamentos((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  const totalBase = orcamentos.reduce((sum, item) => sum + Number(item.preco_base || 0), 0);
  const totalFinal = orcamentos.reduce((sum, item) => sum + Number(item.preco_final || 0), 0);
  const totalPotencial = orcamentos.reduce((sum, item) => sum + Number(item.valor_estimado || item.preco_final || item.preco_base || 0), 0);
  const urgentes = orcamentos.filter((item) => item.urgencia === 'alta').length;
  const semRevisao = orcamentos.filter((item) => item.requer_revisao).length;
  const incompletos = orcamentos.filter((item) => item.incompleto).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Orcamentos</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando...' : `${orcamentos.length} orcamento${orcamentos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {!loading && orcamentos.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          {[
            { label: 'Preco base', value: fmtBRL(totalBase) },
            { label: 'Preco final', value: fmtBRL(totalFinal), accent: true },
            { label: 'Potencial total', value: fmtBRL(totalPotencial) },
            { label: 'Urgentes', value: urgentes },
            { label: 'Sem revisao', value: semRevisao },
            { label: 'Incompletos', value: incompletos },
          ].map((card) => (
            <div key={card.label} className={`hcard p-4 text-center ${card.accent ? 'border-hagav-gold/30' : ''}`}>
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">{card.label}</p>
              <p className={`text-lg font-bold ${card.accent ? 'text-hagav-gold' : 'text-hagav-white'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nome, WhatsApp, servico, resumo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hinput w-full pl-8 text-sm"
          />
        </div>

        <select value={statusOrc} onChange={(e) => setStatusOrc(e.target.value)} className="hselect">
          <option value="">Todos os status</option>
          {Object.entries(ORC_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
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

        <button
          type="button"
          onClick={() => setIncompletoOnly((prev) => !prev)}
          className={`btn-ghost btn-sm ${incompletoOnly ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
        >
          <ClipboardList size={12} />
          Campos incompletos
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : orcamentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orcamento encontrado"
          description="Ajuste os filtros ou aguarde novos formularios chegarem."
        />
      ) : (
        <OrcamentosTable orcamentos={orcamentos} onSelect={setSelected} />
      )}

      {!loading && orcamentos.length > 0 && (
        <div className="hcard p-4">
          <div className="flex items-center gap-2 mb-2 text-hagav-light text-sm font-semibold">
            <AlertTriangle size={14} className="text-yellow-300" />
            Alertas rapidos
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="bg-hagav-surface border border-red-500/20 rounded-lg px-3 py-2 text-red-300">
              Orcamentos urgentes: {urgentes}
            </div>
            <div className="bg-hagav-surface border border-yellow-500/20 rounded-lg px-3 py-2 text-yellow-300">
              Sem revisao: {semRevisao}
            </div>
            <div className="bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2 text-hagav-light">
              Campos incompletos: {incompletos}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <OrcamentoDrawer
          orc={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}

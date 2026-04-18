'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, FileText } from 'lucide-react';
import OrcamentosTable from '@/components/orcamentos/OrcamentosTable';
import OrcamentoDrawer from '@/components/orcamentos/OrcamentoDrawer';
import EmptyState from '@/components/ui/EmptyState';
import { fetchOrcamentos } from '@/lib/supabase';
import { ORC_STATUS_LABELS, fmtBRL } from '@/lib/utils';

export default function OrcamentosPage() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);

  const [search, setSearch]           = useState('');
  const [statusOrc, setStatusOrc]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrcamentos({
        statusOrcamento: statusOrc || undefined,
        search: search   || undefined,
      });
      setOrcamentos(data);
    } catch (err) {
      console.error('[Orçamentos]', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusOrc]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  function handleUpdated(updated) {
    setOrcamentos(prev => prev.map(o => o.id === updated.id ? updated : o));
  }

  // Summary stats
  const totalBase  = orcamentos.reduce((s, o) => s + Number(o.preco_base || 0), 0);
  const totalFinal = orcamentos.reduce((s, o) => s + Number(o.preco_final || 0), 0);
  const pendentes  = orcamentos.filter(o => o.status_orcamento === 'pendente_revisao').length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Orçamentos</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando…' : `${orcamentos.length} orçamento${orcamentos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Summary cards */}
      {!loading && orcamentos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total preço base',  value: fmtBRL(totalBase),  accent: false },
            { label: 'Total preço final', value: fmtBRL(totalFinal), accent: true  },
            { label: 'Pendentes revisão', value: pendentes,           accent: false },
          ].map(({ label, value, accent }) => (
            <div key={label} className={`hcard text-center ${accent ? 'border-hagav-gold/30' : ''}`}>
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-xl font-bold ${accent ? 'text-hagav-gold' : 'text-hagav-white'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nome, WhatsApp, serviço…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="hinput w-full pl-8 text-sm"
          />
        </div>
        <select value={statusOrc} onChange={e => setStatusOrc(e.target.value)} className="hselect">
          <option value="">Todos os status</option>
          {Object.entries(ORC_STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : orcamentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento encontrado"
          description="Ajuste os filtros ou aguarde novos orçamentos chegarem pelo formulário."
        />
      ) : (
        <OrcamentosTable orcamentos={orcamentos} onSelect={setSelected} />
      )}

      {/* Drawer */}
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

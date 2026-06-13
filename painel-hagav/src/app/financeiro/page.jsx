'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  CircleDollarSign,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import {
  createFinancialEntry,
  fetchFinancialEntries,
  updateFinancialEntry,
} from '@/lib/supabase';
import {
  effectiveFinancialStatus,
  FINANCIAL_STATUS_LABELS,
} from '@/lib/operations';
import { classNames, fmtBRL, fmtDate } from '@/lib/utils';

const STATUS_COLORS = {
  pendente: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  parcial: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  pago: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  atrasado: 'bg-red-500/15 text-red-300 border-red-500/30',
  cancelado: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

function emptyForm() {
  return {
    tipo: 'receber',
    categoria: 'projeto',
    descricao: '',
    cliente_fornecedor: '',
    valor: '0',
    valor_pago: '0',
    status: 'pendente',
    vencimento: '',
    forma_pagamento: '',
    observacoes: '',
  };
}

function FinancialEditor({ entry, createMode, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(entry ? {
      tipo: entry.tipo || 'receber',
      categoria: entry.categoria || 'projeto',
      descricao: entry.descricao || '',
      cliente_fornecedor: entry.cliente_fornecedor || '',
      valor: String(entry.valor || 0),
      valor_pago: String(entry.valor_pago || 0),
      status: effectiveFinancialStatus(entry),
      vencimento: entry.vencimento || '',
      forma_pagamento: entry.forma_pagamento || '',
      observacoes: entry.observacoes || '',
    } : emptyForm());
    setError('');
  }, [entry, createMode]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    if (!String(form.descricao || '').trim()) {
      setError('Informe uma descricao.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        valor: Math.max(0, Number(form.valor || 0)),
        valor_pago: form.status === 'pago'
          ? Math.max(0, Number(form.valor || 0))
          : Math.max(0, Number(form.valor_pago || 0)),
        pago_em: form.status === 'pago' ? new Date().toISOString() : null,
      };
      const saved = createMode
        ? await createFinancialEntry(payload)
        : await updateFinancialEntry(entry.id, payload);
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      console.error('[Financeiro][Salvar]', err);
      setError('Nao foi possivel salvar o lancamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(createMode || entry)}
      onClose={onClose}
      title={createMode ? 'Novo lancamento' : 'Editar lancamento'}
      width="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-hagav-gray">
            Tipo
            <select value={form.tipo} onChange={(e) => field('tipo', e.target.value)} className="hselect w-full mt-1.5">
              <option value="receber">Conta a receber</option>
              <option value="pagar">Conta a pagar</option>
            </select>
          </label>
          <label className="text-xs text-hagav-gray">
            Status
            <select value={form.status} onChange={(e) => field('status', e.target.value)} className="hselect w-full mt-1.5">
              {Object.entries(FINANCIAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Descricao
            <input value={form.descricao} onChange={(e) => field('descricao', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Cliente ou fornecedor
            <input value={form.cliente_fornecedor} onChange={(e) => field('cliente_fornecedor', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Categoria
            <input value={form.categoria} onChange={(e) => field('categoria', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Valor
            <input type="number" min="0" step="0.01" value={form.valor} onChange={(e) => field('valor', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Valor pago
            <input type="number" min="0" step="0.01" value={form.valor_pago} onChange={(e) => field('valor_pago', e.target.value)} className="hinput w-full mt-1.5" disabled={form.status === 'pago'} />
          </label>
          <label className="text-xs text-hagav-gray">
            Vencimento
            <input type="date" value={form.vencimento} onChange={(e) => field('vencimento', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Forma de pagamento
            <input value={form.forma_pagamento} onChange={(e) => field('forma_pagamento', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Observacoes
            <textarea rows={3} value={form.observacoes} onChange={(e) => field('observacoes', e.target.value)} className="hinput w-full mt-1.5 resize-none" />
          </label>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="btn-gold">
            {saving && <RefreshCw size={13} className="animate-spin" />}
            Salvar lancamento
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function FinanceiroPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setEntries(await fetchFinancialEntries({
        tipo: tipo || undefined,
        status: status || undefined,
        search: search || undefined,
      }));
    } catch (err) {
      console.error('[Financeiro]', err);
      setLoadError('Nao foi possivel carregar o financeiro. A migracao do banco pode estar pendente.');
    } finally {
      setLoading(false);
    }
  }, [search, status, tipo]);

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [load]);

  const metrics = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    let received = 0;
    let pending = 0;
    let overdue = 0;
    let costs = 0;

    entries.forEach((entry) => {
      const value = Number(entry.valor || 0);
      const paid = Number(entry.valor_pago || 0);
      const effective = effectiveFinancialStatus(entry);
      const paidDate = entry.pago_em ? new Date(entry.pago_em) : null;

      if (entry.tipo === 'receber') {
        if (effective === 'pago' && paidDate && paidDate.getMonth() === month && paidDate.getFullYear() === year) {
          received += paid || value;
        }
        if (['pendente', 'parcial'].includes(effective)) pending += Math.max(0, value - paid);
        if (effective === 'atrasado') overdue += Math.max(0, value - paid);
      } else if (entry.tipo === 'pagar' && effective !== 'cancelado') {
        costs += value;
      }
    });

    return { received, pending, overdue, costs, margin: received - costs };
  }, [entries]);

  function saveLocal(saved) {
    setEntries((current) => {
      const exists = current.some((entry) => entry.id === saved.id);
      return exists
        ? current.map((entry) => entry.id === saved.id ? saved : entry)
        : [saved, ...current];
    });
    setFeedback('Lancamento salvo.');
    setTimeout(() => setFeedback(''), 2200);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-subtitle">Caixa operacional, vencimentos e margem da HAGAV.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button type="button" onClick={() => setCreating(true)} className="btn-gold btn-sm">
            <Plus size={13} /> Novo lancamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { label: 'Recebido no mes', value: metrics.received, icon: ArrowDownCircle, tone: 'text-emerald-300' },
          { label: 'A receber', value: metrics.pending, icon: CalendarClock, tone: 'text-blue-300' },
          { label: 'Em atraso', value: metrics.overdue, icon: CircleDollarSign, tone: 'text-red-300' },
          { label: 'Custos', value: metrics.costs, icon: ArrowUpCircle, tone: 'text-amber-300' },
          { label: 'Margem de caixa', value: metrics.margin, icon: TrendingUp, tone: metrics.margin >= 0 ? 'text-emerald-300' : 'text-red-300' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="hcard p-4">
            <p className="text-[10px] uppercase tracking-wider text-hagav-gray flex items-center gap-1.5">
              <Icon size={12} className={tone} /> {label}
            </p>
            <p className={classNames('text-xl font-bold mt-2', tone)}>{fmtBRL(value)}</p>
          </div>
        ))}
      </div>

      <div className="hcard p-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar descricao, cliente ou categoria..." className="hinput w-full pl-8" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="hselect">
          <option value="">Entradas e saidas</option>
          <option value="receber">A receber</option>
          <option value="pagar">A pagar</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="hselect">
          <option value="">Todos os status</option>
          {Object.entries(FINANCIAL_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loadError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>}
      {feedback && <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{feedback}</p>}

      {loading ? (
        <div className="py-20 flex justify-center"><RefreshCw className="animate-spin text-hagav-gold" /></div>
      ) : entries.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title="Nenhum lancamento encontrado" description="Aprovacoes criarao contas a receber automaticamente. Custos podem ser adicionados manualmente." />
      ) : (
        <div className="hcard overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="border-b border-hagav-border text-left text-[10px] uppercase tracking-wider text-hagav-gray">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Descricao</th>
                <th className="px-4 py-3">Cliente / fornecedor</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const effective = effectiveFinancialStatus(entry);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className="border-b border-hagav-border/70 hover:bg-hagav-muted/20 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={entry.tipo === 'receber' ? 'text-emerald-300' : 'text-amber-300'}>
                        {entry.tipo === 'receber' ? 'Receber' : 'Pagar'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-hagav-white">{entry.descricao}</td>
                    <td className="px-4 py-3 text-hagav-light">{entry.cliente_fornecedor || '-'}</td>
                    <td className="px-4 py-3 text-hagav-light">{entry.vencimento ? fmtDate(entry.vencimento) : '-'}</td>
                    <td className="px-4 py-3 text-hagav-white font-semibold">{fmtBRL(entry.valor)}</td>
                    <td className="px-4 py-3 text-hagav-light">{fmtBRL(entry.valor_pago)}</td>
                    <td className="px-4 py-3">
                      <span className={classNames('badge', STATUS_COLORS[effective] || STATUS_COLORS.pendente)}>
                        {FINANCIAL_STATUS_LABELS[effective] || effective}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <FinancialEditor
        entry={selected}
        createMode={creating}
        onClose={() => { setSelected(null); setCreating(false); }}
        onSaved={saveLocal}
      />
    </div>
  );
}

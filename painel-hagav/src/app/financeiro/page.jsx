'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import {
  createFinancialEntry,
  deleteFinancialEntry,
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

const FINANCEIRO_META_START = '[HAGAV_FINANCEIRO_META]';
const FINANCEIRO_META_END = '[/HAGAV_FINANCEIRO_META]';
const FINANCEIRO_META_REGEX = /\[HAGAV_FINANCEIRO_META\][\s\S]*?\[\/HAGAV_FINANCEIRO_META\]/g;
const NATUREZA_OPTIONS = ['Empresa', 'Pessoal'];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNatureza(value) {
  return String(value || '').trim().toLowerCase() === 'pessoal' ? 'Pessoal' : 'Empresa';
}

function parseBooleanMeta(value) {
  return ['true', '1', 'sim', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function readFinancialMetadata(observacoes) {
  const raw = String(observacoes || '');
  const match = raw.match(FINANCEIRO_META_REGEX);
  const meta = {
    natureza: 'Empresa',
    recorrente_mensal: false,
    hasMeta: Boolean(match?.[0]),
  };
  if (!match?.[0]) return meta;

  match[0]
    .replace(FINANCEIRO_META_START, '')
    .replace(FINANCEIRO_META_END, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=').trim();
      if (key === 'natureza') meta.natureza = normalizeNatureza(value);
      if (key === 'recorrente_mensal') meta.recorrente_mensal = parseBooleanMeta(value);
    });

  return meta;
}

function stripFinancialMetadata(observacoes) {
  return String(observacoes || '')
    .replace(FINANCEIRO_META_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildFinancialMetadataBlock(meta) {
  return [
    FINANCEIRO_META_START,
    `natureza=${normalizeNatureza(meta?.natureza)}`,
    `recorrente_mensal=${Boolean(meta?.recorrente_mensal) ? 'true' : 'false'}`,
    FINANCEIRO_META_END,
  ].join('\n');
}

function updateFinancialObservacoes(observacaoLivre, meta) {
  const cleanText = stripFinancialMetadata(observacaoLivre);
  const block = buildFinancialMetadataBlock(meta);
  return cleanText ? `${block}\n\n${cleanText}` : block;
}

function emptyForm() {
  return {
    tipo: 'receber',
    natureza: 'Empresa',
    recorrente_mensal: false,
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

function emptyQuickForm() {
  return {
    tipo: 'receber',
    natureza: 'Empresa',
    recorrente_mensal: false,
    descricao: '',
    categoria: 'projeto',
    valor: '',
    vencimento: todayIsoDate(),
    forma_pagamento: '',
    status: 'pendente',
    observacoes: '',
  };
}

function getEntryMeta(entry) {
  return readFinancialMetadata(entry?.observacoes);
}

function FinancialEditor({ entry, createMode, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entry) {
      setForm(emptyForm());
      setError('');
      return;
    }

    const meta = readFinancialMetadata(entry.observacoes);
    setForm({
      tipo: entry.tipo || 'receber',
      natureza: meta.natureza,
      recorrente_mensal: meta.recorrente_mensal,
      categoria: entry.categoria || 'projeto',
      descricao: entry.descricao || '',
      cliente_fornecedor: entry.cliente_fornecedor || '',
      valor: String(entry.valor || 0),
      valor_pago: String(entry.valor_pago || 0),
      status: effectiveFinancialStatus(entry),
      vencimento: entry.vencimento || '',
      forma_pagamento: entry.forma_pagamento || '',
      observacoes: stripFinancialMetadata(entry.observacoes),
    });
    setError('');
  }, [entry, createMode]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save() {
    if (!String(form.descricao || '').trim()) {
      setError('Informe uma descrição.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        tipo: form.tipo,
        categoria: String(form.categoria || 'projeto').trim() || 'projeto',
        descricao: String(form.descricao || '').trim(),
        cliente_fornecedor: String(form.cliente_fornecedor || '').trim(),
        valor: Math.max(0, Number(form.valor || 0)),
        valor_pago: form.status === 'pago'
          ? Math.max(0, Number(form.valor || 0))
          : Math.max(0, Number(form.valor_pago || 0)),
        status: form.status,
        vencimento: form.vencimento || null,
        pago_em: form.status === 'pago' ? new Date().toISOString() : null,
        forma_pagamento: String(form.forma_pagamento || '').trim(),
        observacoes: updateFinancialObservacoes(form.observacoes, {
          natureza: form.natureza,
          recorrente_mensal: form.recorrente_mensal,
        }),
      };
      const saved = createMode
        ? await createFinancialEntry(payload)
        : await updateFinancialEntry(entry.id, payload);
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      console.error('[Financeiro][Salvar]', err);
      setError('Não foi possível salvar o lançamento.');
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!entry?.id || createMode) return;
    const confirmed = window.confirm('Tem certeza que deseja apagar este lançamento? Essa ação não pode ser desfeita.');
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      await deleteFinancialEntry(entry.id);
      onDeleted?.(entry.id);
      onClose?.();
    } catch (err) {
      console.error('[Financeiro][Apagar]', err);
      setError('Não foi possível apagar o lançamento.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={Boolean(createMode || entry)}
      onClose={onClose}
      title={createMode ? 'Novo lançamento' : 'Editar lançamento'}
      width="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-hagav-gray">
            Tipo
            <select value={form.tipo} onChange={(e) => field('tipo', e.target.value)} className="hselect w-full mt-1.5">
              <option value="receber">Entrada</option>
              <option value="pagar">Saída</option>
            </select>
          </label>
          <label className="text-xs text-hagav-gray">
            Natureza
            <select value={form.natureza} onChange={(e) => field('natureza', e.target.value)} className="hselect w-full mt-1.5">
              {NATUREZA_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
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
          <label className="text-xs text-hagav-gray flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={Boolean(form.recorrente_mensal)}
              onChange={(e) => field('recorrente_mensal', e.target.checked)}
              className="accent-hagav-gold"
            />
            Recorrente mensal
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Descrição
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
            Vencimento/Data
            <input type="date" value={form.vencimento} onChange={(e) => field('vencimento', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Forma de pagamento
            <input value={form.forma_pagamento} onChange={(e) => field('forma_pagamento', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Observações
            <textarea rows={3} value={form.observacoes} onChange={(e) => field('observacoes', e.target.value)} className="hinput w-full mt-1.5 resize-none" />
          </label>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {!createMode && entry?.id && (
              <button
                type="button"
                onClick={removeEntry}
                disabled={saving || deleting}
                className="btn-ghost text-red-300 border-red-500/25 hover:bg-red-500/10 hover:text-red-200"
              >
                {deleting && <RefreshCw size={13} className="animate-spin" />}
                Apagar lançamento
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving || deleting} className="btn-ghost">Cancelar</button>
            <button type="button" onClick={save} disabled={saving || deleting} className="btn-gold">
              {saving && <RefreshCw size={13} className="animate-spin" />}
              Salvar lançamento
            </button>
          </div>
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
  const [quickForm, setQuickForm] = useState(emptyQuickForm);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');

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
      setLoadError('Não foi possível carregar o financeiro. A migração do banco pode estar pendente.');
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

  function quickField(name, value) {
    setQuickForm((current) => ({ ...current, [name]: value }));
  }

  function saveLocal(saved) {
    setEntries((current) => {
      const exists = current.some((entry) => entry.id === saved.id);
      return exists
        ? current.map((entry) => entry.id === saved.id ? saved : entry)
        : [saved, ...current];
    });
    setFeedback('Lançamento salvo.');
    setTimeout(() => setFeedback(''), 2200);
  }

  function deleteLocal(id) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setFeedback('Lançamento apagado.');
    setTimeout(() => setFeedback(''), 2200);
  }

  async function saveQuickEntry() {
    const descricao = String(quickForm.descricao || '').trim();
    const valor = Number(quickForm.valor || 0);
    if (!descricao) {
      setQuickError('Informe uma descrição.');
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setQuickError('Informe um valor maior que zero.');
      return;
    }

    setQuickSaving(true);
    setQuickError('');
    try {
      const payload = {
        tipo: quickForm.tipo,
        categoria: String(quickForm.categoria || 'projeto').trim() || 'projeto',
        descricao,
        cliente_fornecedor: '',
        valor: Math.max(0, valor),
        valor_pago: quickForm.status === 'pago' ? Math.max(0, valor) : 0,
        status: quickForm.status,
        vencimento: quickForm.vencimento || null,
        pago_em: quickForm.status === 'pago' ? new Date().toISOString() : null,
        forma_pagamento: String(quickForm.forma_pagamento || '').trim(),
        observacoes: updateFinancialObservacoes(quickForm.observacoes, {
          natureza: quickForm.natureza,
          recorrente_mensal: quickForm.recorrente_mensal,
        }),
      };
      const saved = await createFinancialEntry(payload);
      saveLocal(saved);
      setQuickForm(emptyQuickForm());
    } catch (err) {
      console.error('[Financeiro][LançamentoRápido]', err);
      setQuickError('Não foi possível salvar o lançamento rápido.');
    } finally {
      setQuickSaving(false);
    }
  }

  const metricCards = [
    { label: 'Recebido no mês', value: metrics.received, icon: ArrowDownCircle, tone: 'text-emerald-300' },
    { label: 'A receber', value: metrics.pending, icon: CalendarClock, tone: 'text-blue-300' },
    { label: 'Em atraso', value: metrics.overdue, icon: CircleDollarSign, tone: 'text-red-300' },
    { label: 'Custos', value: metrics.costs, icon: ArrowUpCircle, tone: 'text-amber-300' },
    { label: 'Saldo / Resultado do mês', value: metrics.margin, icon: TrendingUp, tone: metrics.margin >= 0 ? 'text-emerald-300' : 'text-red-300' },
  ];

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
            <Plus size={13} /> Novo lançamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {metricCards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="hcard p-4">
            <p className="text-[10px] uppercase tracking-wider text-hagav-gray flex items-center gap-1.5">
              <Icon size={12} className={tone} /> {label}
            </p>
            <p className={classNames('text-xl font-bold mt-2', tone)}>{fmtBRL(value)}</p>
          </div>
        ))}
      </div>

      <div className="hcard p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-hagav-white">Lançamento rápido</h2>
            <p className="text-xs text-hagav-gray mt-1">Registre entradas e saídas sem abrir o cadastro completo.</p>
          </div>
          <span className="badge bg-hagav-gold/15 text-hagav-gold border-hagav-gold/30">
            V1 segura
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="text-xs text-hagav-gray">
            Tipo
            <select value={quickForm.tipo} onChange={(e) => quickField('tipo', e.target.value)} className="hselect w-full mt-1.5">
              <option value="receber">Entrada</option>
              <option value="pagar">Saída</option>
            </select>
          </label>
          <label className="text-xs text-hagav-gray">
            Natureza
            <select value={quickForm.natureza} onChange={(e) => quickField('natureza', e.target.value)} className="hselect w-full mt-1.5">
              {NATUREZA_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-hagav-gray xl:col-span-2">
            Descrição
            <input value={quickForm.descricao} onChange={(e) => quickField('descricao', e.target.value)} className="hinput w-full mt-1.5" placeholder="Ex.: assinatura, pagamento de cliente, tráfego..." />
          </label>
          <label className="text-xs text-hagav-gray">
            Categoria
            <input value={quickForm.categoria} onChange={(e) => quickField('categoria', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Valor
            <input type="number" min="0" step="0.01" value={quickForm.valor} onChange={(e) => quickField('valor', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Data
            <input type="date" value={quickForm.vencimento} onChange={(e) => quickField('vencimento', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Forma de pagamento
            <input value={quickForm.forma_pagamento} onChange={(e) => quickField('forma_pagamento', e.target.value)} className="hinput w-full mt-1.5" placeholder="PIX, cartão, boleto..." />
          </label>
          <label className="text-xs text-hagav-gray">
            Status
            <select value={quickForm.status} onChange={(e) => quickField('status', e.target.value)} className="hselect w-full mt-1.5">
              {Object.entries(FINANCIAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-hagav-gray flex items-center gap-2 md:mt-7">
            <input
              type="checkbox"
              checked={Boolean(quickForm.recorrente_mensal)}
              onChange={(e) => quickField('recorrente_mensal', e.target.checked)}
              className="accent-hagav-gold"
            />
            Recorrente mensal
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Observações
            <input value={quickForm.observacoes} onChange={(e) => quickField('observacoes', e.target.value)} className="hinput w-full mt-1.5" placeholder="Opcional" />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={saveQuickEntry} disabled={quickSaving} className="btn-gold w-full justify-center">
              {quickSaving ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
              Salvar lançamento rápido
            </button>
          </div>
        </div>

        {quickError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{quickError}</p>}
      </div>

      <div className="hcard p-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar descrição, cliente ou categoria..." className="hinput w-full pl-8" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="hselect">
          <option value="">Entradas e saídas</option>
          <option value="receber">Entradas</option>
          <option value="pagar">Saídas</option>
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
        <EmptyState icon={CircleDollarSign} title="Nenhum lançamento encontrado" description="Aprovações criarão contas a receber automaticamente. Custos podem ser adicionados manualmente." />
      ) : (
        <div className="hcard overflow-x-auto">
          <table className="w-full text-sm min-w-[1120px]">
            <thead>
              <tr className="border-b border-hagav-border text-left text-[10px] uppercase tracking-wider text-hagav-gray">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Natureza</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Vencimento/Data</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const effective = effectiveFinancialStatus(entry);
                const meta = getEntryMeta(entry);
                const observation = stripFinancialMetadata(entry.observacoes);
                const NaturezaIcon = meta.natureza === 'Pessoal' ? UserRound : Building2;
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className="border-b border-hagav-border/70 hover:bg-hagav-muted/20 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={entry.tipo === 'receber' ? 'text-emerald-300' : 'text-amber-300'}>
                        {entry.tipo === 'receber' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="badge bg-hagav-muted/40 text-hagav-light border-hagav-border">
                          <NaturezaIcon size={11} />
                          {meta.natureza}
                        </span>
                        {meta.recorrente_mensal && (
                          <span className="badge bg-blue-500/15 text-blue-300 border-blue-500/30">
                            <Repeat size={11} />
                            Mensal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-hagav-white font-medium">{entry.descricao}</p>
                      {observation && <p className="text-[11px] text-hagav-gray mt-1 line-clamp-1">{observation}</p>}
                    </td>
                    <td className="px-4 py-3 text-hagav-light">{entry.categoria || '-'}</td>
                    <td className="px-4 py-3 text-hagav-light">{entry.vencimento ? fmtDate(entry.vencimento) : '-'}</td>
                    <td className="px-4 py-3 text-hagav-white font-semibold">{fmtBRL(entry.valor)}</td>
                    <td className="px-4 py-3 text-hagav-light">{fmtBRL(entry.valor_pago)}</td>
                    <td className="px-4 py-3">
                      <span className={classNames('badge', STATUS_COLORS[effective] || STATUS_COLORS.pendente)}>
                        {FINANCIAL_STATUS_LABELS[effective] || effective}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(entry);
                          }}
                          className="btn-ghost btn-sm"
                        >
                          <Pencil size={12} />
                          Editar
                        </button>
                      </div>
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
        onDeleted={deleteLocal}
      />
    </div>
  );
}

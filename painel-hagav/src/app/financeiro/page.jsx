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
const FORMA_PAGAMENTO_OPTIONS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência', 'Outro'];
const META_MINIMA_MENSAL = 6000;
const TICKET_MEDIO_CLIENTE = 1500;

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

function parseCurrencyValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').replace(/[^\d,.-]/g, '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/\./g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return fmtBRL(parseCurrencyValue(raw));
}

function resolveFormaPagamento(value) {
  const current = String(value || '').trim();
  if (!current || FORMA_PAGAMENTO_OPTIONS.includes(current)) {
    return { forma_pagamento: current, forma_pagamento_outro: '' };
  }
  return { forma_pagamento: 'Outro', forma_pagamento_outro: current };
}

function emptyForm() {
  return {
    tipo: 'receber',
    natureza: 'Empresa',
    recorrente_mensal: false,
    categoria: 'projeto',
    descricao: '',
    cliente_fornecedor: '',
    valor: '',
    valor_pago: '',
    status: 'pendente',
    vencimento: '',
    forma_pagamento: '',
    forma_pagamento_outro: '',
    observacoes: '',
  };
}

function getEntryMeta(entry) {
  return readFinancialMetadata(entry?.observacoes);
}

function parseDateSafe(value) {
  if (!value) return null;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatMonthLabel(date) {
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isSameMonth(date, referenceDate) {
  return Boolean(date)
    && date.getMonth() === referenceDate.getMonth()
    && date.getFullYear() === referenceDate.getFullYear();
}

function isBeforeToday(date, referenceDate) {
  if (!date) return false;
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  return compare.getTime() < today.getTime();
}

function getDueDate(entry) {
  return parseDateSafe(entry?.vencimento);
}

function getPaidDate(entry) {
  return parseDateSafe(entry?.pago_em) || getDueDate(entry);
}

function getNatureza(entry) {
  return getEntryMeta(entry).natureza;
}

function isEmpresa(entry) {
  return getNatureza(entry) === 'Empresa';
}

function isPessoal(entry) {
  return getNatureza(entry) === 'Pessoal';
}

function isReceber(entry) {
  return entry?.tipo === 'receber';
}

function isPagar(entry) {
  return entry?.tipo === 'pagar';
}

function isCancelled(entry) {
  return effectiveFinancialStatus(entry) === 'cancelado';
}

function isPaid(entry) {
  return effectiveFinancialStatus(entry) === 'pago';
}

function getEntryValue(entry) {
  const value = Number(entry?.valor || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getRawPaidValue(entry) {
  const paid = Number(entry?.valor_pago || 0);
  return Number.isFinite(paid) ? Math.max(0, paid) : 0;
}

function getPaidAmount(entry) {
  const value = getEntryValue(entry);
  const paid = getRawPaidValue(entry);
  return isPaid(entry) ? (paid > 0 ? paid : value) : paid;
}

function getOpenAmount(entry) {
  return Math.max(0, getEntryValue(entry) - getRawPaidValue(entry));
}

function getCostAmount(entry) {
  return isPaid(entry) ? getPaidAmount(entry) : getOpenAmount(entry);
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
    const payment = resolveFormaPagamento(entry.forma_pagamento);
    setForm({
      tipo: entry.tipo || 'receber',
      natureza: meta.natureza,
      recorrente_mensal: meta.recorrente_mensal,
      categoria: entry.categoria || 'projeto',
      descricao: entry.descricao || '',
      cliente_fornecedor: entry.cliente_fornecedor || '',
      valor: formatCurrencyInput(entry.valor),
      valor_pago: formatCurrencyInput(entry.valor_pago),
      status: effectiveFinancialStatus(entry),
      vencimento: entry.vencimento || '',
      forma_pagamento: payment.forma_pagamento,
      forma_pagamento_outro: payment.forma_pagamento_outro,
      observacoes: stripFinancialMetadata(entry.observacoes),
    });
    setError('');
  }, [entry, createMode]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function markAsPaid() {
    setForm((current) => ({
      ...current,
      status: 'pago',
      valor_pago: formatCurrencyInput(current.valor),
    }));
  }

  async function save() {
    if (!String(form.descricao || '').trim()) {
      setError('Informe uma descrição.');
      return;
    }
    const valor = Math.max(0, parseCurrencyValue(form.valor));
    const valorPago = form.status === 'pago'
      ? valor
      : (form.status === 'parcial' ? Math.max(0, parseCurrencyValue(form.valor_pago)) : 0);
    const formaPagamento = form.forma_pagamento === 'Outro'
      ? String(form.forma_pagamento_outro || 'Outro').trim()
      : String(form.forma_pagamento || '').trim();
    setSaving(true);
    setError('');
    try {
      const payload = {
        tipo: form.tipo,
        categoria: String(form.categoria || 'projeto').trim() || 'projeto',
        descricao: String(form.descricao || '').trim(),
        cliente_fornecedor: String(form.cliente_fornecedor || '').trim(),
        valor,
        valor_pago: valorPago,
        status: form.status,
        vencimento: form.vencimento || null,
        pago_em: form.status === 'pago' ? new Date().toISOString() : null,
        forma_pagamento: formaPagamento,
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
            Nome do lançamento
            <input value={form.descricao} onChange={(e) => field('descricao', e.target.value)} className="hinput w-full mt-1.5" placeholder="Ex.: ChatGPT Plus" />
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
            <input
              type="text"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => field('valor', e.target.value)}
              onBlur={(e) => field('valor', formatCurrencyInput(e.target.value))}
              className="hinput w-full mt-1.5"
              placeholder="R$ 99,00"
            />
          </label>
          {form.status === 'parcial' && (
            <label className="text-xs text-hagav-gray">
              Valor pago
              <input
                type="text"
                inputMode="decimal"
                value={form.valor_pago}
                onChange={(e) => field('valor_pago', e.target.value)}
                onBlur={(e) => field('valor_pago', formatCurrencyInput(e.target.value))}
                className="hinput w-full mt-1.5"
                placeholder="R$ 0,00"
              />
            </label>
          )}
          <label className="text-xs text-hagav-gray">
            Vencimento/Data
            <input type="date" value={form.vencimento} onChange={(e) => field('vencimento', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Forma de pagamento
            <select value={form.forma_pagamento} onChange={(e) => field('forma_pagamento', e.target.value)} className="hselect w-full mt-1.5">
              <option value="">Selecione...</option>
              {FORMA_PAGAMENTO_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          {form.forma_pagamento === 'Outro' && (
            <label className="text-xs text-hagav-gray">
              Outra forma de pagamento
              <input value={form.forma_pagamento_outro} onChange={(e) => field('forma_pagamento_outro', e.target.value)} className="hinput w-full mt-1.5" />
            </label>
          )}
          <label className="text-xs text-hagav-gray md:col-span-2">
            Observações
            <textarea rows={3} value={form.observacoes} onChange={(e) => field('observacoes', e.target.value)} className="hinput w-full mt-1.5 resize-none" />
          </label>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {!createMode && entry?.id && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={removeEntry}
                  disabled={saving || deleting}
                  className="btn-ghost text-red-300 border-red-500/25 hover:bg-red-500/10 hover:text-red-200"
                >
                  {deleting && <RefreshCw size={13} className="animate-spin" />}
                  Apagar lançamento
                </button>
                {form.status !== 'pago' && (
                  <button type="button" onClick={markAsPaid} disabled={saving || deleting} className="btn-ghost">
                    Marcar como pago
                  </button>
                )}
              </div>
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
  const [naturezaFilter, setNaturezaFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
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
    const referenceDate = selectedMonth;
    const today = new Date();
    let received = 0;
    let pending = 0;
    let overdue = 0;
    let costsHagav = 0;
    let personalCosts = 0;

    entries.forEach((entry) => {
      if (isCancelled(entry)) return;

      const dueDate = getDueDate(entry);
      const paidDate = getPaidDate(entry);
      const openAmount = getOpenAmount(entry);

      if (isReceber(entry)) {
        if (isPaid(entry) && isSameMonth(paidDate, referenceDate)) {
          received += getPaidAmount(entry);
        }
        if (!isPaid(entry) && isSameMonth(dueDate, referenceDate)) {
          pending += openAmount;
        }
        if (!isPaid(entry) && isSameMonth(dueDate, referenceDate) && isBeforeToday(dueDate, today)) {
          overdue += openAmount;
        }
      }

      if (isPagar(entry) && isSameMonth(dueDate, referenceDate)) {
        if (isEmpresa(entry)) costsHagav += getCostAmount(entry);
        if (isPessoal(entry)) personalCosts += getCostAmount(entry);
      }
    });

    const margin = received - costsHagav;
    const realSurplus = received - costsHagav - personalCosts;
    const projectedResult = received + pending - costsHagav - personalCosts;
    const targetGap = Math.max(0, META_MINIMA_MENSAL - projectedResult);
    const neededClients = targetGap <= 0 ? 0 : Math.ceil(targetGap / TICKET_MEDIO_CLIENTE);

    return {
      received,
      pending,
      overdue,
      costsHagav,
      personalCosts,
      margin,
      realSurplus,
      projectedResult,
      targetGap,
      neededClients,
    };
  }, [entries, selectedMonth]);

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

  function clearFilters() {
    setSearch('');
    setTipo('');
    setStatus('');
    setNaturezaFilter('');
  }

  function goToPreviousMonth() {
    setSelectedMonth((current) => addMonths(current, -1));
  }

  function goToNextMonth() {
    setSelectedMonth((current) => addMonths(current, 1));
  }

  function goToCurrentMonth() {
    setSelectedMonth(startOfMonth(new Date()));
  }

  const metricCards = [
    { label: 'Recebido no mês', value: metrics.received, helper: 'Entradas pagas', icon: ArrowDownCircle, tone: 'text-emerald-300' },
    { label: 'A receber no mês', value: metrics.pending, helper: 'Pendentes e parciais', icon: CalendarClock, tone: 'text-blue-300' },
    { label: 'Em atraso', value: metrics.overdue, helper: 'Recebimentos vencidos', icon: CircleDollarSign, tone: 'text-red-300' },
    { label: 'Custos HAGAV', value: metrics.costsHagav, helper: 'Natureza Empresa', icon: ArrowUpCircle, tone: 'text-amber-300' },
    { label: 'Custos pessoais', value: metrics.personalCosts, helper: 'Natureza Pessoal', icon: UserRound, tone: 'text-orange-300' },
    { label: 'Lucro HAGAV', value: metrics.margin, helper: 'Resultado operacional', icon: TrendingUp, tone: metrics.margin >= 0 ? 'text-emerald-300' : 'text-red-300' },
    { label: 'Sobra real', value: metrics.realSurplus, helper: `Projetado: ${fmtBRL(metrics.projectedResult)}`, icon: Building2, tone: metrics.realSurplus >= 0 ? 'text-emerald-300' : 'text-red-300' },
    {
      label: 'Clientes necessários',
      valueLabel: metrics.neededClients === 0
        ? '0'
        : `${metrics.neededClients} ${metrics.neededClients === 1 ? 'cliente' : 'clientes'}`,
      helper: metrics.targetGap <= 0 ? 'Meta coberta' : `Baseado em ticket médio de ${fmtBRL(TICKET_MEDIO_CLIENTE)}`,
      icon: UserRound,
      tone: 'text-blue-200',
    },
  ];

  const visibleEntries = useMemo(() => (
    entries.filter((entry) => {
      const dueDate = getDueDate(entry);
      if (!isSameMonth(dueDate, selectedMonth)) return false;
      if (naturezaFilter && getEntryMeta(entry).natureza !== naturezaFilter) return false;
      return true;
    })
  ), [entries, naturezaFilter, selectedMonth]);

  const selectedMonthLabel = formatMonthLabel(selectedMonth);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-subtitle">Acompanhe entradas, custos, lucro e o que falta para bater a meta do mês.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hcard px-2 py-1.5 flex items-center gap-1.5">
            <button type="button" onClick={goToPreviousMonth} className="btn-ghost btn-sm px-2" aria-label="Mês anterior">
              ←
            </button>
            <span className="min-w-[128px] text-center text-sm font-semibold text-hagav-white">
              {selectedMonthLabel}
            </span>
            <button type="button" onClick={goToNextMonth} className="btn-ghost btn-sm px-2" aria-label="Próximo mês">
              →
            </button>
            <button type="button" onClick={goToCurrentMonth} className="btn-ghost btn-sm">
              Hoje
            </button>
          </div>
          <button type="button" onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button type="button" onClick={() => setCreating(true)} className="btn-gold btn-sm">
            <Plus size={13} /> Novo lançamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8 gap-3">
        {metricCards.map(({ label, value, valueLabel, helper, icon: Icon, tone }) => (
          <div key={label} className="hcard p-3 min-h-[112px]">
            <p className="text-[10px] uppercase tracking-wider text-hagav-gray flex items-center gap-1.5">
              <Icon size={12} className={tone} /> {label}
            </p>
            <p className={classNames('text-lg xl:text-xl font-bold mt-3', tone)}>
              {valueLabel || fmtBRL(value)}
            </p>
            {helper && <p className="text-[11px] text-hagav-gray mt-1">{helper}</p>}
          </div>
        ))}
      </div>

      <div className="hcard p-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px_160px_150px] gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, cliente ou categoria..." className="hinput w-full pl-8" />
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
        <select value={naturezaFilter} onChange={(e) => setNaturezaFilter(e.target.value)} className="hselect">
          <option value="">Natureza</option>
          {NATUREZA_OPTIONS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <button type="button" onClick={clearFilters} className="btn-ghost btn-sm justify-center">
          Limpar filtros
        </button>
      </div>

      {loadError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>}
      {feedback && <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{feedback}</p>}

      {loading ? (
        <div className="py-20 flex justify-center"><RefreshCw className="animate-spin text-hagav-gold" /></div>
      ) : visibleEntries.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title="Nenhum lançamento encontrado" description="Aprovações criarão contas a receber automaticamente. Custos podem ser adicionados manualmente." />
      ) : (
        <div className="hcard overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1120px]">
              <thead>
                <tr className="border-b border-hagav-border text-left text-[10px] uppercase tracking-wider text-hagav-gray">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Natureza</th>
                  <th className="px-4 py-3">Nome do lançamento</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Vencimento/Data</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
              {visibleEntries.map((entry) => {
                const effective = effectiveFinancialStatus(entry);
                const meta = getEntryMeta(entry);
                const observation = stripFinancialMetadata(entry.observacoes);
                const NaturezaIcon = meta.natureza === 'Pessoal' ? UserRound : Building2;
                const paidValue = Number(entry.valor_pago || 0);
                const displayPaid = effective === 'pago'
                  ? fmtBRL(paidValue || entry.valor)
                  : (paidValue > 0 ? fmtBRL(paidValue) : '—');
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className="border-b border-hagav-border/70 hover:bg-hagav-muted/20 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={entry.tipo === 'receber' ? 'text-emerald-300' : 'text-red-300'}>
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
                    <td className={classNames('px-4 py-3 font-semibold', entry.tipo === 'receber' ? 'text-emerald-300' : 'text-red-300')}>{fmtBRL(entry.valor)}</td>
                    <td className="px-4 py-3 text-hagav-light">{displayPaid}</td>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hagav-border px-4 py-3 text-xs text-hagav-gray">
            <span>Mostrando {visibleEntries.length} de {entries.length} registros</span>
            <span>Use os filtros acima para ajustar a lista.</span>
          </div>
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

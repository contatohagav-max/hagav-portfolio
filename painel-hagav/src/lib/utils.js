import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Date helpers

export function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

export function fmtRelative(iso) {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true });
  } catch {
    return iso;
  }
}

export function fmtHours(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  if (num < 1) return `${Math.round(num * 60)} min`;
  return `${num.toFixed(1)} h`;
}

// Currency helpers

export function fmtBRL(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

// Status helpers

export const LEAD_STATUS_LABELS = {
  novo: 'Novo',
  contatado: 'Contatado',
  qualificado: 'Qualificado',
  descartado: 'Descartado',
  orcamento: 'Orçamento',
  proposta_enviada: 'Proposta enviada',
  ajustando: 'Ajustando',
  aprovado: 'Aprovado',
  fechado: 'Fechado',
  perdido: 'Perdido',
};

export const LEAD_STATUS_COLORS = {
  novo: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contatado: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  qualificado: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  descartado: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  orcamento: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  proposta_enviada: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  ajustando: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  aprovado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  fechado: 'bg-green-500/15 text-green-400 border-green-500/30',
  perdido: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export const ORC_STATUS_LABELS = {
  orcamento: 'Orçamento',
  proposta_enviada: 'Proposta enviada',
  ajustando: 'Ajustando',
  aprovado: 'Aprovado',
  perdido: 'Perdido',
  fechado: 'Fechado',
};

export const ORC_STATUS_COLORS = {
  orcamento: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  proposta_enviada: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  ajustando: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  aprovado: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  perdido: 'bg-red-500/15 text-red-400 border-red-500/30',
  fechado: 'bg-green-500/15 text-green-400 border-green-500/30',
};

export const URGENCIA_LABELS = {
  alta: 'Alta',
  media: 'Media',
  baixa: 'Baixa',
};

export const URGENCIA_COLORS = {
  alta: 'bg-red-500/15 text-red-400 border-red-500/30',
  media: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  baixa: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

export const PRIORIDADE_LABELS = {
  alta: 'Alta',
  media: 'Media',
  baixa: 'Baixa',
};

export const PRIORIDADE_COLORS = {
  alta: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  media: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  baixa: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
};

export const TEMPERATURA_COLORS = {
  Quente: 'bg-red-500/15 text-red-300 border-red-500/30',
  Morno: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Frio: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
};

// Misc

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function truncate(str, len = 60) {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, len)}…` : str;
}

export function whatsappLink(phone, msg = '') {
  const clean = (phone || '').replace(/\D/g, '');
  const num = clean.startsWith('55') ? clean : `55${clean}`;
  const encoded = encodeURIComponent(msg);
  return `https://wa.me/${num}${encoded ? `?text=${encoded}` : ''}`;
}

// Kanban columns

export const KANBAN_COLUMNS = [
  { id: 'novo', label: 'Novo', color: 'border-blue-500' },
  { id: 'contatado', label: 'Contatado', color: 'border-violet-500' },
  { id: 'qualificado', label: 'Qualificado', color: 'border-cyan-500' },
  { id: 'proposta_enviada', label: 'Proposta enviada', color: 'border-yellow-500' },
  { id: 'fechado', label: 'Fechado', color: 'border-green-500' },
  { id: 'perdido', label: 'Perdido', color: 'border-red-500' },
];

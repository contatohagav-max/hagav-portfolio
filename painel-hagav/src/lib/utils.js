import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Date helpers ─────────────────────────────────────────────────────────────

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
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
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

// ─── Currency helpers ─────────────────────────────────────────────────────────

export function fmtBRL(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export const LEAD_STATUS_LABELS = {
  novo:              'Novo',
  chamado:           'Contatado',
  'proposta enviada':'Proposta',
  negociacao:        'Negociação',
  fechado:           'Fechado',
  perdido:           'Perdido',
};

export const LEAD_STATUS_COLORS = {
  novo:              'bg-blue-500/15 text-blue-400 border-blue-500/30',
  chamado:           'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'proposta enviada':'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  negociacao:        'bg-orange-500/15 text-orange-400 border-orange-500/30',
  fechado:           'bg-green-500/15 text-green-400 border-green-500/30',
  perdido:           'bg-red-500/15 text-red-400 border-red-500/30',
};

export const ORC_STATUS_LABELS = {
  pendente_revisao: 'Pendente',
  em_revisao:       'Em revisão',
  aprovado:         'Aprovado',
  enviado:          'Enviado',
  arquivado:        'Arquivado',
  cancelado:        'Cancelado',
};

export const ORC_STATUS_COLORS = {
  pendente_revisao: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  em_revisao:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  aprovado:         'bg-green-500/15 text-green-400 border-green-500/30',
  enviado:          'bg-violet-500/15 text-violet-400 border-violet-500/30',
  arquivado:        'bg-hagav-muted/50 text-hagav-gray border-hagav-muted',
  cancelado:        'bg-red-500/15 text-red-400 border-red-500/30',
};

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function truncate(str, len = 60) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

export function whatsappLink(phone, msg = '') {
  const clean = (phone || '').replace(/\D/g, '');
  const num = clean.startsWith('55') ? clean : `55${clean}`;
  const encoded = encodeURIComponent(msg);
  return `https://wa.me/${num}${encoded ? `?text=${encoded}` : ''}`;
}

// ─── Kanban columns ───────────────────────────────────────────────────────────

export const KANBAN_COLUMNS = [
  { id: 'novo',              label: 'Novo',             color: 'border-blue-500' },
  { id: 'chamado',           label: 'Contatado',        color: 'border-violet-500' },
  { id: 'qualificado',       label: 'Qualificado',      color: 'border-cyan-500' },
  { id: 'proposta enviada',  label: 'Proposta',         color: 'border-yellow-500' },
  { id: 'negociacao',        label: 'Negociação',       color: 'border-orange-500' },
  { id: 'fechado',           label: 'Fechado',          color: 'border-green-500' },
  { id: 'perdido',           label: 'Perdido',          color: 'border-red-500' },
];

import {
  LEAD_STATUS_COLORS,
  LEAD_STATUS_LABELS,
  ORC_STATUS_COLORS,
  ORC_STATUS_LABELS,
  URGENCIA_COLORS,
  URGENCIA_LABELS,
  PRIORIDADE_COLORS,
  PRIORIDADE_LABELS,
  TEMPERATURA_COLORS,
  classNames,
} from '@/lib/utils';

function Badge({ label, color }) {
  return (
    <span className={classNames('badge', color)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-80" />
      {label}
    </span>
  );
}

export function LeadStatusBadge({ status }) {
  const label = LEAD_STATUS_LABELS[status] ?? status ?? '—';
  const color = LEAD_STATUS_COLORS[status] ?? 'bg-hagav-muted/50 text-hagav-gray border-hagav-muted';
  return <Badge label={label} color={color} />;
}

export function OrcStatusBadge({ status }) {
  const label = ORC_STATUS_LABELS[status] ?? status ?? '—';
  const color = ORC_STATUS_COLORS[status] ?? 'bg-hagav-muted/50 text-hagav-gray border-hagav-muted';
  return <Badge label={label} color={color} />;
}

export function UrgenciaBadge({ urgencia }) {
  const key = String(urgencia || '').toLowerCase();
  const label = URGENCIA_LABELS[key] ?? 'Media';
  const color = URGENCIA_COLORS[key] ?? URGENCIA_COLORS.media;
  return <Badge label={label} color={color} />;
}

export function PrioridadeBadge({ prioridade }) {
  const key = String(prioridade || '').toLowerCase();
  const label = PRIORIDADE_LABELS[key] ?? 'Media';
  const color = PRIORIDADE_COLORS[key] ?? PRIORIDADE_COLORS.media;
  return <Badge label={label} color={color} />;
}

export function TemperaturaBadge({ temperatura }) {
  const label = temperatura || 'Morno';
  const color = TEMPERATURA_COLORS[label] ?? TEMPERATURA_COLORS.Morno;
  return <Badge label={label} color={color} />;
}

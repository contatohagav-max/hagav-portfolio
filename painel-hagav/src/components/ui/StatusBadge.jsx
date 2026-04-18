import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, ORC_STATUS_COLORS, ORC_STATUS_LABELS, classNames } from '@/lib/utils';

export function LeadStatusBadge({ status }) {
  const label = LEAD_STATUS_LABELS[status] ?? status ?? '—';
  const color = LEAD_STATUS_COLORS[status] ?? 'bg-hagav-muted/50 text-hagav-gray border-hagav-muted';
  return (
    <span className={classNames('badge', color)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-80" />
      {label}
    </span>
  );
}

export function OrcStatusBadge({ status }) {
  const label = ORC_STATUS_LABELS[status] ?? status ?? '—';
  const color = ORC_STATUS_COLORS[status] ?? 'bg-hagav-muted/50 text-hagav-gray border-hagav-muted';
  return (
    <span className={classNames('badge', color)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-80" />
      {label}
    </span>
  );
}

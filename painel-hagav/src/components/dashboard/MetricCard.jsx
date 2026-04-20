import { classNames } from '@/lib/utils';

export default function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
  trend,
  onClick,
  title,
}) {
  const interactive = typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={title || ''}
      className={classNames(
        'metric-card group text-left outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-hagav-gold/35',
        accent && 'border-hagav-gold/30 shadow-gold',
        interactive ? 'cursor-pointer hover:border-hagav-gold/25 transition-colors' : 'cursor-default',
      )}
    >
      {/* Gold top accent line */}
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />
      )}

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-hagav-gray uppercase tracking-wider mb-2">{label}</p>
          <p className={classNames(
            'text-3xl font-bold leading-none',
            accent ? 'text-hagav-gold' : 'text-hagav-white',
          )}>
            {value ?? '—'}
          </p>
          {sub && <p className="text-xs text-hagav-gray mt-1.5">{sub}</p>}
        </div>
        {Icon && (
          <div className={classNames(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            accent
              ? 'bg-hagav-gold/15 border border-hagav-gold/20'
              : 'bg-hagav-muted/40 border border-hagav-border',
          )}>
            <Icon size={17} className={accent ? 'text-hagav-gold' : 'text-hagav-gray'} />
          </div>
        )}
      </div>

      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={classNames(
            'text-xs font-medium',
            trend >= 0 ? 'text-green-400' : 'text-red-400',
          )}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
          <span className="text-xs text-hagav-gray">vs. mês anterior</span>
        </div>
      )}
    </button>
  );
}

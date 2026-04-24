import { ArrowUpRight } from 'lucide-react';
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
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />
      )}

      <div className="flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-hagav-gray uppercase tracking-[0.22em] mb-2.5">{label}</p>
            <p className="text-[11px] text-hagav-gray mb-3">Indicador comercial</p>
            <p className={classNames(
              'text-[2rem] font-bold leading-none tracking-tight',
              accent ? 'text-hagav-gold' : 'text-hagav-white',
            )}>
              {value ?? '—'}
            </p>
            {sub && <p className="text-xs text-hagav-gray mt-2">{sub}</p>}
          </div>
          {Icon && (
            <div className={classNames(
              'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors',
              accent
                ? 'bg-hagav-gold/15 border border-hagav-gold/20'
                : 'bg-hagav-muted/30 border border-hagav-border',
            )}>
              <Icon size={18} className={accent ? 'text-hagav-gold' : 'text-hagav-gold'} />
            </div>
          )}
        </div>

        <div className="mt-auto border-t border-hagav-border/60 pt-3 flex items-center justify-between gap-3 text-[11px]">
          <span className="text-hagav-gray">
            {interactive ? 'Abrir detalhe' : 'Resumo visual'}
          </span>
          {interactive ? (
            <span className="inline-flex items-center gap-1 text-hagav-gold">
              Ver mais
              <ArrowUpRight size={13} />
            </span>
          ) : (
            <span className="text-hagav-gray/70">Monitorado</span>
          )}
        </div>
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

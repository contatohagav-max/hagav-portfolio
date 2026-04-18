import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LeadStatusBadge, UrgenciaBadge, TemperaturaBadge } from '@/components/ui/StatusBadge';
import { fmtRelative, fmtBRL } from '@/lib/utils';

export default function RecentLeads({ leads = [] }) {
  return (
    <div className="hcard flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-hagav-white">Ultimas entradas</h3>
        <Link href="/leads" className="flex items-center gap-1 text-xs text-hagav-gold hover:text-hagav-gold-light transition-colors">
          Ver todos <ArrowRight size={12} />
        </Link>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-hagav-gray py-6 text-center">Nenhum lead ainda.</p>
      ) : (
        <div className="space-y-0 -mx-5">
          {leads.map((lead) => (
            <Link key={lead.id} href="/leads">
              <div className="flex items-center gap-3 px-5 py-3 hover:bg-hagav-muted/20 transition-colors border-b border-hagav-border/50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-hagav-muted/50 border border-hagav-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-hagav-light">
                    {(lead.nome || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-hagav-light truncate">{lead.nome || 'Sem nome'}</p>
                    <TemperaturaBadge temperatura={lead.temperatura} />
                  </div>
                  <p className="text-xs text-hagav-gray truncate">{lead.fluxo} · {lead.origem || '—'}</p>
                  <p className="text-[11px] text-hagav-gray mt-0.5">Valor estimado: {fmtBRL(lead.valor_estimado)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <LeadStatusBadge status={lead.status} />
                  <UrgenciaBadge urgencia={lead.urgencia} />
                  <span className="text-[10px] text-hagav-gray">{fmtRelative(lead.created_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

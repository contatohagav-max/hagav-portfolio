import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LeadStatusBadge, OrcStatusBadge, PrioridadeBadge } from '@/components/ui/StatusBadge';
import { fmtRelative, fmtBRL } from '@/lib/utils';

function getEntryTypeLabel(entry) {
  if (entry?.entryType === 'orcamento' || entry?.status_orcamento) return 'Orcamento';
  return 'Lead';
}

function getEntryHref(entry) {
  if (entry?.entryType === 'orcamento' || entry?.status_orcamento) return '/orcamentos';
  return '/leads';
}

export default function RecentLeads({ entries = [], leads = [] }) {
  const rows = Array.isArray(entries) && entries.length > 0 ? entries : leads;

  return (
    <div className="hcard flex flex-col p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-hagav-border/70">
        <div>
          <h3 className="text-sm font-semibold text-hagav-white">Ultimas entradas</h3>
          <p className="text-[11px] text-hagav-gray mt-0.5">Leads e orcamentos mais recentes</p>
        </div>
        <Link href="/leads" className="flex items-center gap-1 text-xs text-hagav-gold hover:text-hagav-gold-light transition-colors">
          Ver todos <ArrowRight size={12} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-hagav-gray py-10 text-center">Nenhuma entrada recente.</p>
      ) : (
        <>
          <div className="hidden lg:grid grid-cols-[2.1fr_1.2fr_1.2fr_1fr_1fr_0.9fr_0.9fr] gap-3 px-5 py-2.5 text-[10px] text-hagav-gray uppercase tracking-wider border-b border-hagav-border/70">
            <span>Nome</span>
            <span>Origem</span>
            <span>Tipo</span>
            <span>Valor estimado</span>
            <span>Status</span>
            <span>Prioridade</span>
            <span>Tempo</span>
          </div>

          <div className="divide-y divide-hagav-border/60">
            {rows.map((entry) => {
              const isOrcamento = entry?.entryType === 'orcamento' || Boolean(entry?.status_orcamento);
              const typeLabel = getEntryTypeLabel(entry);
              const tipo = entry?.tipo || (isOrcamento ? 'Orcamento' : 'Lead');
              const valor = fmtBRL(entry?.valor_estimado || 0);
              const tempo = fmtRelative(entry?.created_at);
              const href = getEntryHref(entry);

              return (
                <Link key={`${typeLabel}-${entry.id}-${entry.created_at || ''}`} href={href}>
                  <div className="px-5 py-3 hover:bg-hagav-muted/20 transition-colors">
                    <div className="grid grid-cols-1 lg:grid-cols-[2.1fr_1.2fr_1.2fr_1fr_1fr_0.9fr_0.9fr] gap-2.5 lg:gap-3 items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-hagav-light truncate">{entry?.nome || 'Sem nome'}</p>
                      </div>
                      <p className="text-xs text-hagav-gray truncate">{entry?.origem || '—'}</p>
                      <p className="text-xs text-hagav-gray truncate">{typeLabel} · {tipo}</p>
                      <p className="text-xs text-hagav-light font-medium">{valor}</p>
                      <div className="flex items-center">
                        {isOrcamento ? (
                          <OrcStatusBadge status={entry?.status_orcamento} />
                        ) : (
                          <LeadStatusBadge status={entry?.status} />
                        )}
                      </div>
                      <div className="flex items-center">
                        <PrioridadeBadge prioridade={entry?.prioridade} />
                      </div>
                      <p className="text-[11px] text-hagav-gray">{tempo}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

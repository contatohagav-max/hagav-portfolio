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
    <div className="dashboard-panel flex flex-col p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-hagav-border/70">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-hagav-gray mb-1">Painel de entrada</p>
          <h3 className="text-sm font-semibold text-hagav-white">Últimas entradas</h3>
          <p className="text-[11px] text-hagav-gray mt-0.5">Leads e orçamentos mais recentes do sistema</p>
        </div>
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs text-hagav-gold hover:text-hagav-gold-light transition-colors shrink-0">
          Ver todos <ArrowRight size={12} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-hagav-gray py-10 text-center">Nenhuma entrada recente.</p>
      ) : (
        <>
          <div className="hidden lg:grid grid-cols-[2.1fr_1.2fr_1.2fr_1fr_1fr_0.9fr_0.9fr] gap-3 px-5 py-3 text-[10px] text-hagav-gray uppercase tracking-[0.24em] border-b border-hagav-border/70 bg-hagav-surface/40">
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
                  <div className="px-5 py-3.5 hover:bg-hagav-muted/20 transition-colors">
                    <div className="lg:hidden space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-hagav-white truncate">{entry?.nome || 'Sem nome'}</p>
                          <p className="text-xs text-hagav-gray mt-1 truncate">{typeLabel} · {tipo}</p>
                        </div>
                        <p className="text-[11px] text-hagav-gray shrink-0">{tempo}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                        <div className="rounded-xl border border-hagav-border/60 bg-hagav-surface/50 px-3 py-2">
                          <p className="text-hagav-gray uppercase tracking-[0.18em] text-[10px] mb-1">Origem</p>
                          <p className="text-hagav-light truncate">{entry?.origem || '—'}</p>
                        </div>
                        <div className="rounded-xl border border-hagav-border/60 bg-hagav-surface/50 px-3 py-2">
                          <p className="text-hagav-gray uppercase tracking-[0.18em] text-[10px] mb-1">Valor</p>
                          <p className="text-hagav-white font-medium">{valor}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {isOrcamento ? (
                          <OrcStatusBadge status={entry?.status_orcamento} />
                        ) : (
                          <LeadStatusBadge status={entry?.status} />
                        )}
                        <PrioridadeBadge prioridade={entry?.prioridade} />
                      </div>
                    </div>

                    <div className="hidden lg:grid grid-cols-[2.1fr_1.2fr_1.2fr_1fr_1fr_0.9fr_0.9fr] gap-3 items-center">
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

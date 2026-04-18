import { MessageCircle } from 'lucide-react';
import {
  LeadStatusBadge,
  PrioridadeBadge,
  UrgenciaBadge,
  TemperaturaBadge,
} from '@/components/ui/StatusBadge';
import { fmtDateTime, fmtRelative, fmtBRL, whatsappLink, truncate } from '@/lib/utils';

export default function LeadsTable({ leads, onSelect }) {
  if (leads.length === 0) {
    return (
      <div className="text-center py-20 text-hagav-gray text-sm">
        Nenhum lead encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hagav-border">
      <table className="htable min-w-[1180px]">
        <thead>
          <tr>
            <th>#</th>
            <th>Lead</th>
            <th>Score</th>
            <th>Prioridade</th>
            <th>Urgencia</th>
            <th>Fluxo/Origem</th>
            <th>Proxima acao</th>
            <th>Ultimo contato</th>
            <th>Valor estimado</th>
            <th>Status</th>
            <th>Contato</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} onClick={() => onSelect(lead)}>
              <td className="text-hagav-gray font-mono text-xs">{lead.id}</td>
              <td>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-hagav-muted/50 border border-hagav-border flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-hagav-light">
                      {(lead.nome || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-hagav-white truncate max-w-[180px]">{lead.nome || 'Sem nome'}</p>
                    <p className="text-[11px] font-mono text-hagav-gray">{lead.whatsapp || '—'}</p>
                  </div>
                </div>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-hagav-white">{lead.score_lead ?? 0}</span>
                  <TemperaturaBadge temperatura={lead.temperatura} />
                </div>
              </td>
              <td><PrioridadeBadge prioridade={lead.prioridade} /></td>
              <td><UrgenciaBadge urgencia={lead.urgencia} /></td>
              <td>
                <div>
                  <p className="text-xs text-hagav-light">{lead.fluxo || '—'}</p>
                  <p className="text-[11px] text-hagav-gray truncate max-w-[160px]">{lead.origem || '—'}</p>
                </div>
              </td>
              <td className="text-xs text-hagav-light max-w-[180px]" title={lead.proxima_acao || ''}>
                {truncate(lead.proxima_acao || 'Sem acao definida', 48)}
              </td>
              <td className="text-xs text-hagav-gray" title={fmtDateTime(lead.ultimo_contato_em || lead.created_at)}>
                {lead.ultimo_contato_em ? fmtRelative(lead.ultimo_contato_em) : 'Sem contato'}
              </td>
              <td className="text-sm font-medium text-hagav-gold">{fmtBRL(lead.valor_estimado)}</td>
              <td><LeadStatusBadge status={lead.status} /></td>
              <td>
                {lead.whatsapp ? (
                  <a
                    href={whatsappLink(lead.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors px-2 py-1 rounded bg-green-500/10 border border-green-500/20"
                  >
                    <MessageCircle size={11} />
                    Chamar
                  </a>
                ) : (
                  <span className="text-xs text-hagav-gray">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { MessageCircle } from 'lucide-react';
import { LeadStatusBadge } from '@/components/ui/StatusBadge';
import { fmtDate, fmtRelative, whatsappLink } from '@/lib/utils';

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
      <table className="htable">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>WhatsApp</th>
            <th>Origem</th>
            <th>Fluxo</th>
            <th>Status</th>
            <th>Data</th>
            <th>Contato</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr key={lead.id} onClick={() => onSelect(lead)}>
              <td className="text-hagav-gray font-mono text-xs">{lead.id}</td>
              <td>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-hagav-muted/50 border border-hagav-border flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-hagav-light">
                      {(lead.nome || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-hagav-white">{lead.nome || '—'}</span>
                </div>
              </td>
              <td className="font-mono text-xs text-hagav-light">{lead.whatsapp || '—'}</td>
              <td className="text-hagav-gray text-xs">{lead.origem || '—'}</td>
              <td>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-hagav-muted/30 border border-hagav-border text-hagav-gray">
                  {lead.fluxo || '—'}
                </span>
              </td>
              <td><LeadStatusBadge status={lead.status} /></td>
              <td className="text-hagav-gray text-xs" title={fmtDate(lead.created_at)}>
                {fmtRelative(lead.created_at)}
              </td>
              <td>
                {lead.whatsapp && (
                  <a
                    href={whatsappLink(lead.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors px-2 py-1 rounded bg-green-500/10 border border-green-500/20"
                  >
                    <MessageCircle size={11} />
                    Chamar
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

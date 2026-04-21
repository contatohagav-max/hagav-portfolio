import { MessageCircle } from 'lucide-react';
import {
  LeadStatusBadge,
  UrgenciaBadge,
  TemperaturaBadge,
} from '@/components/ui/StatusBadge';
import EduTooltip from '@/components/ui/EduTooltip';
import { whatsappLink, truncate } from '@/lib/utils';

const WHATSAPP_TOOLTIP = {
  title: 'WhatsApp',
  whatIs: 'Atalho para iniciar conversa com o lead no WhatsApp.',
  purpose: 'Fazer contato imediato sem sair da listagem.',
  observe: 'Priorize leads urgentes e registre retorno no painel.',
};

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
      <table className="htable min-w-[1020px]">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Servico</th>
            <th>Origem</th>
            <th>Score</th>
            <th>Urgencia</th>
            <th>Proxima acao</th>
            <th>Status</th>
            <th>Contato</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="cursor-pointer" onClick={() => onSelect(lead)}>
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
              <td className="text-xs text-hagav-light max-w-[190px]" title={lead.servico || ''}>
                {truncate(lead.servico || lead.fluxo || '—', 50)}
              </td>
              <td className="text-xs text-hagav-gray max-w-[180px]" title={lead.origem || ''}>
                {truncate(lead.origem || '—', 38)}
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-hagav-white">{lead.score_lead ?? 0}</span>
                  <TemperaturaBadge temperatura={lead.temperatura} />
                </div>
              </td>
              <td><UrgenciaBadge urgencia={lead.urgencia} /></td>
              <td className="text-xs text-hagav-light max-w-[180px]" title={lead.proxima_acao || ''}>
                {truncate(lead.proxima_acao || 'Sem acao definida', 48)}
              </td>
              <td><LeadStatusBadge status={lead.status} /></td>
              <td>
                {lead.whatsapp ? (
                  <EduTooltip {...WHATSAPP_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
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
                  </EduTooltip>
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

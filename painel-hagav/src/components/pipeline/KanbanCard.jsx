import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageCircle, GripVertical } from 'lucide-react';
import { UrgenciaBadge, TemperaturaBadge } from '@/components/ui/StatusBadge';
import { fmtRelative, whatsappLink, fmtBRL, truncate } from '@/lib/utils';

export default function KanbanCard({ lead, onSelect }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(lead.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="kanban-card group cursor-pointer"
      onClick={() => onSelect?.(lead)}
      title="Abrir lead"
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 text-hagav-muted hover:text-hagav-gray cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical size={14} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-hagav-white truncate">{lead.nome || 'Sem nome'}</p>
          <p className="text-xs text-hagav-gray truncate mt-0.5">{lead.servico || lead.fluxo || '—'}</p>

          <div className="flex items-center gap-1.5 mt-2">
            <UrgenciaBadge urgencia={lead.urgencia} />
            <TemperaturaBadge temperatura={lead.temperatura} />
          </div>

          <p className="text-[11px] text-hagav-gray mt-2">{fmtBRL(lead.valor_estimado)}</p>
          <p className="text-[11px] text-hagav-gray truncate">{truncate(lead.proxima_acao || 'Sem acao definida', 34)}</p>

          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[10px] text-hagav-gray">{fmtRelative(lead.created_at)}</span>
            {lead.whatsapp && (
              <a
                href={whatsappLink(lead.whatsapp)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-green-400 hover:text-green-300 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MessageCircle size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

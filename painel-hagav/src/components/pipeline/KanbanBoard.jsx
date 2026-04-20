'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './KanbanCard';
import EduTooltip from '@/components/ui/EduTooltip';
import { KANBAN_COLUMNS, classNames } from '@/lib/utils';
import { updateLead } from '@/lib/supabase';

const PIPELINE_STAGE_TOOLTIPS = {
  novo: {
    title: 'Novo',
    whatIs: 'Lead recem-entrado, ainda sem atendimento completo.',
    purpose: 'Dar inicio rapido ao primeiro contato.',
    observe: 'Tempo alto aqui reduz chance de conversao.',
  },
  chamado: {
    title: 'Chamado',
    whatIs: 'Lead em contato ativo com o comercial.',
    purpose: 'Conduzir qualificacao e avancar para proposta.',
    observe: 'Sempre deixe proxima acao definida.',
  },
  'proposta enviada': {
    title: 'Proposta enviada',
    whatIs: 'Lead que ja recebeu proposta.',
    purpose: 'Acompanhar negociacoes em fase de decisao.',
    observe: 'Monitore prazo de retorno e objecoes.',
  },
  fechado: {
    title: 'Fechado',
    whatIs: 'Negocio concluido com aceite do cliente.',
    purpose: 'Representar conversao e receita efetiva.',
    observe: 'Revise ticket e origem para replicar padrao.',
  },
  perdido: {
    title: 'Perdido',
    whatIs: 'Lead que nao virou venda.',
    purpose: 'Registrar perdas e aprender com os motivos.',
    observe: 'Analise recorrencias para ajustar abordagem.',
  },
};

function DroppableColumn({ column, leads, onSelectLead }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const tooltip = PIPELINE_STAGE_TOOLTIPS[column.id];

  return (
    <div className={classNames('kanban-col shrink-0', isOver && 'ring-1 ring-hagav-gold/40')}>
      <EduTooltip
        enabled={Boolean(tooltip)}
        side="bottom"
        panelClassName="left-3 right-3 w-auto translate-x-0"
        {...tooltip}
      >
        <div className={classNames('kanban-col-header border-t-2', column.color)}>
          <span className="text-xs font-semibold text-hagav-light">{column.label}</span>
          <span className="text-xs text-hagav-gray bg-hagav-muted/40 px-1.5 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
      </EduTooltip>

      <div
        ref={setNodeRef}
        className="flex-1 py-2 min-h-[80px] overflow-y-auto"
      >
        <SortableContext
          items={leads.map(l => String(l.id))}
          strategy={verticalListSortingStrategy}
        >
          {leads.map(lead => (
            <KanbanCard key={lead.id} lead={lead} onSelect={onSelectLead} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="mx-3 my-2 h-12 border-2 border-dashed border-hagav-border/50 rounded-lg flex items-center justify-center">
            <span className="text-[10px] text-hagav-gray/50">Soltar aqui</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  initialLeads = [],
  onLeadsChange,
  onStatusPersist,
  onSelectLead,
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const leadsPerColumn = useCallback(() => {
    const map = {};
    KANBAN_COLUMNS.forEach(col => { map[col.id] = []; });
    leads.forEach(l => {
      const colId = map[l.status] !== undefined ? l.status : 'novo';
      map[colId] = [...(map[colId] || []), l];
    });
    return map;
  }, [leads]);

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeLeadId = String(active.id);
    const activeLead = leads.find(l => String(l.id) === activeLeadId);
    if (!activeLead) return;

    // Determine target column
    let targetColId = over.id;
    // If dropped on a card, find that card's column
    if (!KANBAN_COLUMNS.find(c => c.id === over.id)) {
      targetColId = leads.find(l => String(l.id) === over.id)?.status ?? activeLead.status;
    }

    if (targetColId === activeLead.status) return;

    // Optimistic update
    setLeads((prev) => {
      const next = prev.map((l) => (String(l.id) === activeLeadId ? { ...l, status: targetColId } : l));
      onLeadsChange?.(next);
      return next;
    });

    // Persist
    try {
      await updateLead(activeLead.id, { status: targetColId });
      onStatusPersist?.({ type: 'success', message: `Lead #${activeLeadId} movido para ${targetColId}.` });
    } catch (err) {
      console.error('[Kanban] Error updating lead status:', err);
      // Rollback
      setLeads((prev) => {
        const next = prev.map((l) => (String(l.id) === activeLeadId ? { ...l, status: activeLead.status } : l));
        onLeadsChange?.(next);
        return next;
      });
      onStatusPersist?.({ type: 'error', message: 'Nao foi possivel salvar o status no pipeline.' });
    }
  }

  const colMap = leadsPerColumn();
  const activeLead = activeId ? leads.find(l => String(l.id) === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
        {KANBAN_COLUMNS.map(col => (
          <DroppableColumn
            key={col.id}
            column={col}
            leads={colMap[col.id] ?? []}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead ? (
          <div className="kanban-card opacity-90 rotate-1 scale-105 shadow-panel w-[220px]">
            <p className="text-sm font-medium text-hagav-white">{activeLead.nome}</p>
            <p className="text-xs text-hagav-gray mt-0.5">{activeLead.fluxo}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

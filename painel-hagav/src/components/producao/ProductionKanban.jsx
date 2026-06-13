'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, GripVertical, UserRound } from 'lucide-react';
import { PRODUCTION_STAGES, MATERIAL_STATUS_LABELS } from '@/lib/operations';
import { classNames, fmtDate, truncate } from '@/lib/utils';

function ProductionCard({ job, onSelect }) {
  const sortable = useSortable({ id: String(job.id) });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.35 : 1,
  };

  return (
    <button
      ref={sortable.setNodeRef}
      style={style}
      type="button"
      onClick={() => onSelect?.(job)}
      className="kanban-card group w-full text-left"
    >
      <div className="flex items-start gap-2">
        <span
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(event) => event.stopPropagation()}
          className="mt-0.5 text-hagav-muted hover:text-hagav-gray cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-hagav-white truncate">
            {job.cliente_nome || 'Sem cliente'}
          </span>
          <span className="block text-xs text-hagav-gray mt-0.5">
            {truncate(job.servico || job.titulo || 'Projeto HAGAV', 42)}
          </span>
          <span className="flex flex-wrap gap-1.5 mt-2">
            <span className={classNames(
              'badge',
              job.prioridade === 'alta'
                ? 'bg-red-500/15 text-red-300 border-red-500/30'
                : job.prioridade === 'baixa'
                  ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            )}>
              {job.prioridade || 'media'}
            </span>
            <span className="badge bg-blue-500/10 text-blue-300 border-blue-500/20">
              {MATERIAL_STATUS_LABELS[job.materiais_status] || 'Pendente'}
            </span>
          </span>
          <span className="block text-[11px] text-hagav-light mt-2">
            {truncate(job.proxima_acao || 'Sem proxima acao', 44)}
          </span>
          <span className="flex items-center justify-between gap-2 mt-2 text-[10px] text-hagav-gray">
            <span className="inline-flex items-center gap-1 truncate">
              <UserRound size={10} />
              {job.responsavel || 'Sem responsavel'}
            </span>
            <span className="inline-flex items-center gap-1 shrink-0">
              <CalendarClock size={10} />
              {job.prazo_em ? fmtDate(job.prazo_em) : 'Sem prazo'}
            </span>
          </span>
        </span>
      </div>
    </button>
  );
}

function Column({ stage, jobs, onSelect }) {
  const droppable = useDroppable({ id: stage.id });

  return (
    <section className={classNames('kanban-col shrink-0', droppable.isOver && 'ring-1 ring-hagav-gold/40')}>
      <header className={classNames('kanban-col-header border-t-2', stage.color)}>
        <span className="text-xs font-semibold text-hagav-light">{stage.label}</span>
        <span className="text-xs text-hagav-gray bg-hagav-muted/40 px-1.5 py-0.5 rounded-full">
          {jobs.length}
        </span>
      </header>
      <div ref={droppable.setNodeRef} className="flex-1 py-2 min-h-[100px] overflow-y-auto">
        <SortableContext items={jobs.map((job) => String(job.id))} strategy={verticalListSortingStrategy}>
          {jobs.map((job) => (
            <ProductionCard key={job.id} job={job} onSelect={onSelect} />
          ))}
        </SortableContext>
        {jobs.length === 0 && (
          <div className="mx-3 my-2 h-12 border-2 border-dashed border-hagav-border/50 rounded-lg flex items-center justify-center">
            <span className="text-[10px] text-hagav-gray/50">Soltar aqui</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ProductionKanban({ jobs = [], onMove, onSelect }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (activeId && !jobs.some((job) => String(job.id) === String(activeId))) {
      setActiveId(null);
    }
  }, [activeId, jobs]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage.id, []]));
    jobs.forEach((job) => {
      const key = map[job.status] ? job.status : 'aguardando_materiais';
      map[key].push(job);
    });
    return map;
  }, [jobs]);

  const activeJob = jobs.find((job) => String(job.id) === String(activeId));

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over) return;
    const job = jobs.find((item) => String(item.id) === String(active.id));
    if (!job) return;

    let targetStatus = String(over.id);
    if (!PRODUCTION_STAGES.some((stage) => stage.id === targetStatus)) {
      targetStatus = jobs.find((item) => String(item.id) === targetStatus)?.status || job.status;
    }
    if (targetStatus === job.status) return;
    onMove?.(job, targetStatus);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
        {PRODUCTION_STAGES.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            jobs={grouped[stage.id] || []}
            onSelect={onSelect}
          />
        ))}
      </div>
      <DragOverlay>
        {activeJob ? (
          <div className="kanban-card opacity-90 rotate-1 shadow-panel w-[230px]">
            <p className="text-sm font-medium text-hagav-white">{activeJob.cliente_nome}</p>
            <p className="text-xs text-hagav-gray">{activeJob.servico || activeJob.titulo}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

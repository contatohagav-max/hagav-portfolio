'use client';

import {
  CalendarClock,
  Edit3,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Link2,
  UserRound,
} from 'lucide-react';
import {
  MATERIAL_STATUS_LABELS,
  PRODUCTION_STAGE_LABELS,
  PRODUCTION_STAGES,
} from '@/lib/operations';
import { classNames, fmtDate, truncate } from '@/lib/utils';

const PRIORITY_COLORS = {
  alta: 'bg-red-500/15 text-red-300 border-red-500/30',
  media: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  baixa: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const STATUS_COLORS = {
  aguardando_materiais: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  pronto_preparar: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  em_edicao: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  revisao_interna: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  revisao_cliente: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  ajustes: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  aprovado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  renderizando: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  pronto_entrega: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  entregue: 'bg-green-500/15 text-green-300 border-green-500/30',
  arquivado: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  bloqueado: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const MATERIAL_COLORS = {
  pendente: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  parcial: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  completo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

function cleanPath(value) {
  return String(value || '').trim();
}

function toFileUrl(path) {
  const value = cleanPath(path);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^file:\/\//i.test(value)) return value;
  if (value.startsWith('\\\\')) {
    return `file:${value.replace(/\\/g, '/')}`;
  }
  return `file:///${value.replace(/\\/g, '/')}`;
}

function pathCount(job) {
  return [
    job?.pasta_local,
    job?.pasta_materiais,
    job?.pasta_entrega,
    job?.projeto_premiere,
  ].filter((item) => cleanPath(item)).length;
}

function PathAction({ label, value, icon: Icon = FolderOpen }) {
  const path = cleanPath(value);
  if (!path) {
    return (
      <div className="rounded-lg border border-hagav-border/70 bg-hagav-muted/10 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-hagav-gray">{label}</p>
        <p className="text-xs text-hagav-muted mt-1">Não informado</p>
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard?.writeText(path);
    } catch {
      // The browser may block clipboard access; the path stays visible for manual copy.
    }
  }

  return (
    <div className="rounded-lg border border-hagav-border bg-hagav-muted/10 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-hagav-gray flex items-center gap-1.5">
        <Icon size={11} className="text-hagav-gold" />
        {label}
      </p>
      <p className="text-xs text-hagav-light mt-1 break-all">{path}</p>
      <div className="flex flex-wrap gap-2 mt-2">
        <a
          href={toFileUrl(path)}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost btn-sm h-7 px-2 text-[11px]"
        >
          Abrir
        </a>
        <button type="button" onClick={copy} className="btn-ghost btn-sm h-7 px-2 text-[11px]">
          Copiar
        </button>
      </div>
    </div>
  );
}

function DetailPanel({ job, onEdit }) {
  if (!job) {
    return (
      <aside className="hcard p-5 flex flex-col items-center justify-center text-center min-h-[280px]">
        <FolderOpen size={28} className="text-hagav-muted" />
        <p className="text-sm font-semibold text-hagav-light mt-3">Selecione uma demanda</p>
        <p className="text-xs text-hagav-gray mt-1 max-w-xs">
          Clique em uma linha para ver ClickUp, pastas locais, Premiere, export e proximas acoes.
        </p>
      </aside>
    );
  }

  const clickupUrl = String(job.clickup_url || '').trim();

  return (
    <aside className="hcard p-4 space-y-4 xl:sticky xl:top-4 self-start">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-hagav-gray">Painel da demanda</p>
          <h2 className="text-lg font-semibold text-hagav-white mt-1 truncate">
            {job.cliente_nome || 'Sem cliente'}
          </h2>
          <p className="text-xs text-hagav-gray mt-1">{truncate(job.titulo || job.servico || 'Projeto HAGAV', 72)}</p>
        </div>
        <button type="button" onClick={() => onEdit?.(job)} className="btn-gold btn-sm shrink-0">
          <Edit3 size={12} />
          Editar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={classNames('badge', STATUS_COLORS[job.status] || STATUS_COLORS.aguardando_materiais)}>
          {PRODUCTION_STAGE_LABELS[job.status] || job.status}
        </span>
        <span className={classNames('badge', PRIORITY_COLORS[job.prioridade] || PRIORITY_COLORS.media)}>
          Prioridade {job.prioridade || 'media'}
        </span>
        <span className={classNames('badge', MATERIAL_COLORS[job.materiais_status] || MATERIAL_COLORS.pendente)}>
          {MATERIAL_STATUS_LABELS[job.materiais_status] || 'Pendente'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-hagav-muted/10 border border-hagav-border/70 px-3 py-2">
          <p className="text-hagav-gray flex items-center gap-1.5"><UserRound size={11} /> Responsável</p>
          <p className="text-hagav-light mt-1">{job.responsavel || 'Sem responsavel'}</p>
        </div>
        <div className="rounded-lg bg-hagav-muted/10 border border-hagav-border/70 px-3 py-2">
          <p className="text-hagav-gray flex items-center gap-1.5"><CalendarClock size={11} /> Prazo</p>
          <p className="text-hagav-light mt-1">{job.prazo_em ? fmtDate(job.prazo_em) : 'Sem prazo'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-hagav-border bg-hagav-muted/10 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-hagav-gray">Próxima ação</p>
        <p className="text-sm text-hagav-light mt-1">{job.proxima_acao || 'Sem próxima ação definida.'}</p>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-hagav-border bg-hagav-muted/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-hagav-gray flex items-center gap-1.5">
            <Link2 size={11} className="text-hagav-gold" />
            ClickUp manda
          </p>
          {clickupUrl ? (
            <a href={clickupUrl} target="_blank" rel="noreferrer" className="text-xs text-hagav-gold hover:underline mt-1 inline-flex items-center gap-1">
              Abrir tarefa no ClickUp <ExternalLink size={11} />
            </a>
          ) : (
            <p className="text-xs text-hagav-muted mt-1">Tarefa do ClickUp ainda nao vinculada.</p>
          )}
          {job.clickup_task_id && <p className="text-[11px] text-hagav-gray mt-1">ID: {job.clickup_task_id}</p>}
        </div>

        <PathAction label="Pasta do projeto" value={job.pasta_local} icon={HardDrive} />
        <PathAction label="Materiais" value={job.pasta_materiais} />
        <PathAction label="Export / entrega" value={job.pasta_entrega} />
        <PathAction label="Projeto Premiere" value={job.projeto_premiere} icon={HardDrive} />
      </div>

      {(job.motivo_bloqueio || job.observacoes) && (
        <div className="space-y-2">
          {job.motivo_bloqueio && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-red-300">Bloqueio</p>
              <p className="text-xs text-red-100 mt-1">{job.motivo_bloqueio}</p>
            </div>
          )}
          {job.observacoes && (
            <div className="rounded-lg border border-hagav-border bg-hagav-muted/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-hagav-gray">Observações</p>
              <p className="text-xs text-hagav-light mt-1 whitespace-pre-wrap">{job.observacoes}</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export default function ProductionList({
  jobs = [],
  selectedId,
  onSelect,
  onEdit,
  onStatusChange,
}) {
  const selectedJob = jobs.find((job) => String(job.id) === String(selectedId)) || null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
      <div className="hcard overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-hagav-border text-left text-[10px] uppercase tracking-wider text-hagav-gray">
                <th className="px-4 py-3 w-[260px]">Projeto</th>
                <th className="px-4 py-3 w-[190px]">Etapa</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3">Materiais</th>
                <th className="px-4 py-3 w-[230px]">Próxima ação</th>
                <th className="px-4 py-3">Prazo</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Mapa</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const selected = String(job.id) === String(selectedId);
                return (
                  <tr
                    key={job.id}
                    onClick={() => onSelect?.(job)}
                    className={classNames(
                      'border-b border-hagav-border/70 hover:bg-hagav-muted/20 cursor-pointer transition-colors',
                      selected && 'bg-hagav-gold/10'
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="text-hagav-white font-medium truncate">{job.cliente_nome || 'Sem cliente'}</p>
                      <p className="text-xs text-hagav-gray mt-0.5">{truncate(job.servico || job.titulo || 'Projeto HAGAV', 56)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={job.status || 'aguardando_materiais'}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onStatusChange?.(job, event.target.value)}
                        className="hselect h-8 text-xs w-full"
                      >
                        {PRODUCTION_STAGES.map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={classNames('badge', PRIORITY_COLORS[job.prioridade] || PRIORITY_COLORS.media)}>
                        {job.prioridade || 'media'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={classNames('badge', MATERIAL_COLORS[job.materiais_status] || MATERIAL_COLORS.pendente)}>
                        {MATERIAL_STATUS_LABELS[job.materiais_status] || 'Pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-hagav-light">{truncate(job.proxima_acao || 'Sem próxima ação', 52)}</td>
                    <td className="px-4 py-3 text-hagav-light">{job.prazo_em ? fmtDate(job.prazo_em) : '-'}</td>
                    <td className="px-4 py-3 text-hagav-light">{job.responsavel || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {job.clickup_url ? (
                          <span className="badge bg-violet-500/15 text-violet-300 border-violet-500/30">ClickUp</span>
                        ) : (
                          <span className="badge bg-zinc-500/15 text-zinc-400 border-zinc-500/30">Sem ClickUp</span>
                        )}
                        <span className="badge bg-hagav-gold/10 text-hagav-gold border-hagav-gold/20">
                          {pathCount(job)} pastas
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <DetailPanel job={selectedJob} onEdit={onEdit} />
    </div>
  );
}

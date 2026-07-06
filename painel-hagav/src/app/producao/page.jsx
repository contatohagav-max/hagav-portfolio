'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Clock3, Link2, RefreshCw, Search } from 'lucide-react';
import ProductionList from '@/components/producao/ProductionList';
import Modal from '@/components/ui/Modal';
import { fetchProductionJobs, updateProductionJob } from '@/lib/supabase';
import { MATERIAL_STATUS_LABELS, PRODUCTION_STAGES } from '@/lib/operations';

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function ProductionEmptyState({ title, description }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-xl bg-hagav-muted/30 border border-hagav-border flex items-center justify-center mb-4">
        <Boxes size={22} className="text-hagav-gray" />
      </div>
      <p className="text-sm font-medium text-hagav-light mb-1">{title}</p>
      <p className="text-xs text-hagav-gray max-w-xs">{description}</p>
    </div>
  );
}

function ProductionEditor({ job, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      status: job?.status || 'aguardando_materiais',
      prioridade: job?.prioridade || 'media',
      materiais_status: job?.materiais_status || 'pendente',
      responsavel: job?.responsavel || '',
      proxima_acao: job?.proxima_acao || '',
      prazo_em: toLocalDateTime(job?.prazo_em),
      horas_estimadas: String(job?.horas_estimadas || 0),
      horas_realizadas: String(job?.horas_realizadas || 0),
      clickup_url: job?.clickup_url || '',
      clickup_task_id: job?.clickup_task_id || '',
      pasta_local: job?.pasta_local || '',
      pasta_materiais: job?.pasta_materiais || '',
      pasta_entrega: job?.pasta_entrega || '',
      projeto_premiere: job?.projeto_premiere || '',
      motivo_bloqueio: job?.motivo_bloqueio || '',
      observacoes: job?.observacoes || '',
    });
    setError('');
  }, [job]);

  function field(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateProductionJob(job.id, {
        ...form,
        clickup_url: String(form.clickup_url || '').trim() || null,
        clickup_task_id: String(form.clickup_task_id || '').trim() || null,
        pasta_local: String(form.pasta_local || '').trim() || null,
        pasta_materiais: String(form.pasta_materiais || '').trim() || null,
        pasta_entrega: String(form.pasta_entrega || '').trim() || null,
        projeto_premiere: String(form.projeto_premiere || '').trim() || null,
        prazo_em: form.prazo_em ? new Date(form.prazo_em).toISOString() : null,
        horas_estimadas: Math.max(0, Number(form.horas_estimadas || 0)),
        horas_realizadas: Math.max(0, Number(form.horas_realizadas || 0)),
        motivo_bloqueio: form.status === 'bloqueado' ? form.motivo_bloqueio : null,
      });
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      console.error('[Producao][Salvar]', err);
      setError('Nao foi possivel salvar a demanda.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={Boolean(job)} onClose={onClose} title={job?.cliente_nome || 'Demanda'} width="max-w-3xl">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-hagav-gray uppercase tracking-wider">Projeto</p>
          <p className="text-sm text-hagav-white mt-1">{job?.titulo}</p>
          <p className="text-xs text-hagav-gray">{job?.servico || 'Serviço não informado'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-hagav-gray">
            Etapa
            <select value={form.status || ''} onChange={(e) => field('status', e.target.value)} className="hselect w-full mt-1.5">
              {PRODUCTION_STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-hagav-gray">
            Prioridade
            <select value={form.prioridade || ''} onChange={(e) => field('prioridade', e.target.value)} className="hselect w-full mt-1.5">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="text-xs text-hagav-gray">
            Materiais
            <select value={form.materiais_status || ''} onChange={(e) => field('materiais_status', e.target.value)} className="hselect w-full mt-1.5">
              {Object.entries(MATERIAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-hagav-gray">
            Responsável
            <input value={form.responsavel || ''} onChange={(e) => field('responsavel', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Próxima ação
            <input value={form.proxima_acao || ''} onChange={(e) => field('proxima_acao', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Link ClickUp
            <input value={form.clickup_url || ''} onChange={(e) => field('clickup_url', e.target.value)} placeholder="https://app.clickup.com/t/..." className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            ID da tarefa ClickUp
            <input value={form.clickup_task_id || ''} onChange={(e) => field('clickup_task_id', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Prazo
            <input type="datetime-local" value={form.prazo_em || ''} onChange={(e) => field('prazo_em', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-hagav-gray">
              Horas previstas
              <input type="number" min="0" step="0.25" value={form.horas_estimadas || '0'} onChange={(e) => field('horas_estimadas', e.target.value)} className="hinput w-full mt-1.5" />
            </label>
            <label className="text-xs text-hagav-gray">
              Horas feitas
              <input type="number" min="0" step="0.25" value={form.horas_realizadas || '0'} onChange={(e) => field('horas_realizadas', e.target.value)} className="hinput w-full mt-1.5" />
            </label>
          </div>
          <label className="text-xs text-hagav-gray">
            Pasta do projeto
            <input value={form.pasta_local || ''} onChange={(e) => field('pasta_local', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Pasta de materiais
            <input value={form.pasta_materiais || ''} onChange={(e) => field('pasta_materiais', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Pasta export / entrega
            <input value={form.pasta_entrega || ''} onChange={(e) => field('pasta_entrega', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Projeto Premiere
            <input value={form.projeto_premiere || ''} onChange={(e) => field('projeto_premiere', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          {form.status === 'bloqueado' && (
            <label className="text-xs text-red-300 md:col-span-2">
              Motivo do bloqueio
              <input value={form.motivo_bloqueio || ''} onChange={(e) => field('motivo_bloqueio', e.target.value)} className="hinput w-full mt-1.5 border-red-500/30" />
            </label>
          )}
          <label className="text-xs text-hagav-gray md:col-span-2">
            Observações
            <textarea rows={3} value={form.observacoes || ''} onChange={(e) => field('observacoes', e.target.value)} className="hinput w-full mt-1.5 resize-none" />
          </label>
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="btn-gold">
            {saving && <RefreshCw size={13} className="animate-spin" />}
            Salvar demanda
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ProducaoPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setJobs(await fetchProductionJobs());
    } catch (err) {
      console.error('[Producao]', err);
      setLoadError('Não foi possível carregar a produção. A migração do banco pode estar pendente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const active = jobs.filter((job) => !['entregue', 'arquivado'].includes(job.status)).length;
    const blocked = jobs.filter((job) => job.status === 'bloqueado').length;
    const withoutAction = jobs.filter((job) => !String(job.proxima_acao || '').trim()).length;
    const withoutClickUp = jobs.filter((job) => !String(job.clickup_url || '').trim()).length;
    return { active, blocked, withoutAction, withoutClickUp };
  }, [jobs]);

  const owners = useMemo(() => {
    return Array.from(new Set(
      jobs
        .map((job) => String(job.responsavel || '').trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const term = normalizeSearch(search);
    return jobs.filter((job) => {
      if (term) {
        const searchable = normalizeSearch([
          job.titulo,
          job.cliente_nome,
          job.servico,
          job.responsavel,
          job.clickup_url,
          job.clickup_task_id,
          job.pasta_local,
          job.pasta_materiais,
          job.pasta_entrega,
          job.projeto_premiere,
        ].join(' '));
        if (!searchable.includes(term)) return false;
      }
      if (statusFilter && job.status !== statusFilter) return false;
      if (priorityFilter && job.prioridade !== priorityFilter) return false;
      if (materialFilter && job.materiais_status !== materialFilter) return false;
      if (ownerFilter && String(job.responsavel || '').trim() !== ownerFilter) return false;
      return true;
    });
  }, [jobs, materialFilter, ownerFilter, priorityFilter, search, statusFilter]);

  const selectedJob = selected
    ? filteredJobs.find((job) => String(job.id) === String(selected.id)) || selected
    : filteredJobs[0] || null;

  useEffect(() => {
    if (filteredJobs.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !filteredJobs.some((job) => String(job.id) === String(selected.id))) {
      setSelected(filteredJobs[0]);
    }
  }, [filteredJobs, selected]);

  async function changeStatus(job, status) {
    const previous = jobs;
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status } : item));
    setSelected((current) => current?.id === job.id ? { ...current, status } : current);
    try {
      const updated = await updateProductionJob(job.id, { status });
      setJobs((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected((current) => current?.id === updated.id ? updated : current);
      setFeedback('Etapa atualizada. ClickUp continua sendo a fonte da operação.');
      setTimeout(() => setFeedback(''), 2200);
    } catch (err) {
      console.error('[Producao][Mover]', err);
      setJobs(previous);
      setFeedback('Nao foi possivel mover a demanda.');
    }
  }

  function saveLocal(updated) {
    setJobs((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelected(updated);
    setFeedback('Demanda salva.');
    setTimeout(() => setFeedback(''), 2200);
  }

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <h1 className="page-title">Produção</h1>
          <p className="page-subtitle">Central visual da operação. ClickUp manda; o admin organiza o mapa.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        {[
          { label: 'Demandas ativas', value: metrics.active, icon: Boxes },
          { label: 'Bloqueadas', value: metrics.blocked, icon: AlertTriangle },
          { label: 'Sem proxima acao', value: metrics.withoutAction, icon: Clock3 },
          { label: 'Sem ClickUp', value: metrics.withoutClickUp, icon: Link2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="hcard p-4">
            <p className="text-xs uppercase tracking-wider text-hagav-gray flex items-center gap-2">
              <Icon size={13} className="text-hagav-gold" /> {label}
            </p>
            <p className="text-2xl font-bold text-hagav-white mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="hcard p-3 shrink-0 space-y-3">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, servico, responsavel, ClickUp ou pasta..." className="hinput w-full pl-8" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="hselect">
            <option value="">Todas as etapas</option>
            {PRODUCTION_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.label}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="hselect">
            <option value="">Todas prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
          <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} className="hselect">
            <option value="">Todos materiais</option>
            {Object.entries(MATERIAL_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="hselect">
            <option value="">Todos responsaveis</option>
            {owners.map((owner) => (
              <option key={owner} value={owner}>{owner}</option>
            ))}
          </select>
        </div>
      </div>

      {loadError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>}
      {feedback && <p className="text-xs text-hagav-light bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2">{feedback}</p>}

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><RefreshCw className="animate-spin text-hagav-gold" /></div>
      ) : jobs.length === 0 ? (
        <ProductionEmptyState title="Nenhuma demanda em produção" description="Ao aprovar um orçamento, a demanda aparecerá automaticamente aqui." />
      ) : filteredJobs.length === 0 ? (
        <ProductionEmptyState title="Nada encontrado nos filtros" description="Ajuste busca, etapa, prioridade, materiais ou responsável para voltar ao mapa da produção." />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <ProductionList
            jobs={filteredJobs}
            selectedId={selectedJob?.id}
            onSelect={setSelected}
            onEdit={setEditing}
            onStatusChange={changeStatus}
          />
        </div>
      )}

      {editing && (
        <ProductionEditor job={editing} onClose={() => setEditing(null)} onSaved={saveLocal} />
      )}
    </div>
  );
}

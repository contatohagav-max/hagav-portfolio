'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Clock3, RefreshCw, Search, TimerReset } from 'lucide-react';
import ProductionKanban from '@/components/producao/ProductionKanban';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { fetchProductionJobs, updateProductionJob } from '@/lib/supabase';
import { MATERIAL_STATUS_LABELS, PRODUCTION_STAGES } from '@/lib/operations';

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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
      pasta_local: job?.pasta_local || '',
      pasta_entrega: job?.pasta_entrega || '',
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
          <p className="text-xs text-hagav-gray">{job?.servico || 'Servico nao informado'}</p>
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
              <option value="media">Media</option>
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
            Responsavel
            <input value={form.responsavel || ''} onChange={(e) => field('responsavel', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray md:col-span-2">
            Proxima acao
            <input value={form.proxima_acao || ''} onChange={(e) => field('proxima_acao', e.target.value)} className="hinput w-full mt-1.5" />
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
            Pasta local
            <input value={form.pasta_local || ''} onChange={(e) => field('pasta_local', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          <label className="text-xs text-hagav-gray">
            Pasta de entrega
            <input value={form.pasta_entrega || ''} onChange={(e) => field('pasta_entrega', e.target.value)} className="hinput w-full mt-1.5" />
          </label>
          {form.status === 'bloqueado' && (
            <label className="text-xs text-red-300 md:col-span-2">
              Motivo do bloqueio
              <input value={form.motivo_bloqueio || ''} onChange={(e) => field('motivo_bloqueio', e.target.value)} className="hinput w-full mt-1.5 border-red-500/30" />
            </label>
          )}
          <label className="text-xs text-hagav-gray md:col-span-2">
            Observacoes
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
  const [feedback, setFeedback] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setJobs(await fetchProductionJobs({ search: search || undefined }));
    } catch (err) {
      console.error('[Producao]', err);
      setLoadError('Nao foi possivel carregar a producao. A migracao do banco pode estar pendente.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [load]);

  const metrics = useMemo(() => {
    const active = jobs.filter((job) => !['entregue', 'arquivado'].includes(job.status)).length;
    const blocked = jobs.filter((job) => job.status === 'bloqueado').length;
    const withoutAction = jobs.filter((job) => !String(job.proxima_acao || '').trim()).length;
    const hours = jobs.reduce((sum, job) => sum + Number(job.horas_estimadas || 0), 0);
    return { active, blocked, withoutAction, hours };
  }, [jobs]);

  async function move(job, status) {
    const previous = jobs;
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status } : item));
    try {
      const updated = await updateProductionJob(job.id, { status });
      setJobs((current) => current.map((item) => item.id === updated.id ? updated : item));
      setFeedback('Etapa atualizada.');
      setTimeout(() => setFeedback(''), 2200);
    } catch (err) {
      console.error('[Producao][Mover]', err);
      setJobs(previous);
      setFeedback('Nao foi possivel mover a demanda.');
    }
  }

  function saveLocal(updated) {
    setJobs((current) => current.map((item) => item.id === updated.id ? updated : item));
    setFeedback('Demanda salva.');
    setTimeout(() => setFeedback(''), 2200);
  }

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <h1 className="page-title">Producao</h1>
          <p className="page-subtitle">Do material recebido ate entrega e arquivo.</p>
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
          { label: 'Horas previstas', value: metrics.hours.toFixed(1), icon: TimerReset },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="hcard p-4">
            <p className="text-xs uppercase tracking-wider text-hagav-gray flex items-center gap-2">
              <Icon size={13} className="text-hagav-gold" /> {label}
            </p>
            <p className="text-2xl font-bold text-hagav-white mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="hcard p-3 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, servico ou responsavel..." className="hinput w-full pl-8" />
        </div>
      </div>

      {loadError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>}
      {feedback && <p className="text-xs text-hagav-light bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2">{feedback}</p>}

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><RefreshCw className="animate-spin text-hagav-gold" /></div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhuma demanda em producao" description="Ao aprovar um orcamento, a demanda aparecera automaticamente aqui." className="flex-1" />
      ) : (
        <div className="flex-1 overflow-hidden">
          <ProductionKanban jobs={jobs} onMove={move} onSelect={setSelected} />
        </div>
      )}

      {selected && (
        <ProductionEditor job={selected} onClose={() => setSelected(null)} onSaved={saveLocal} />
      )}
    </div>
  );
}

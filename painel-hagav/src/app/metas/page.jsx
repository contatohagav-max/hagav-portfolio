'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Flag,
  Monitor,
  PiggyBank,
  Plus,
  RefreshCw,
  Save,
  Target,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import {
  archiveCompanyGoal,
  createGoalContribution,
  createGoalStudySession,
  fetchCompanyGoalsBundle,
  saveCompanyGoal,
  saveCompanyGoalSetting,
} from '@/lib/goals-repository';
import {
  calculateEquipmentReadiness,
  calculateGoalProgress,
  calculateStudyProgress,
  calculateWeeklyAllocation,
} from '@/lib/goals-engine';
import { classNames, fmtBRL, fmtDate } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'financial', label: 'Financeiras' },
  { id: 'equipment', label: 'Equipamentos' },
  { id: 'study', label: 'Estudo' },
];

const PRIORITIES = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' },
];

const STATUSES = [
  { value: 'active', label: 'Ativa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'completed', label: 'Concluída' },
];

const WEEKDAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

const DEFAULT_STUDY_STEPS = [
  'Pesquisa e nicho',
  'Roteiro e thumbnail',
  'Produção',
  'Publicação e análise',
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function todayInput() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysInput(amount) {
  const date = new Date();
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseCurrencyValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').replace(/[^\d,.-]/g, '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/\./g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyInput(value) {
  const amount = parseCurrencyValue(value);
  return amount > 0 ? fmtBRL(amount) : '';
}

function formatPercent(value) {
  const amount = Number(value || 0);
  return `${amount.toFixed(amount >= 10 ? 0 : 1)}%`;
}

function priorityLabel(value) {
  return PRIORITIES.find((item) => item.value === value)?.label || 'Média';
}

function priorityClass(value) {
  if (value === 'high') return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (value === 'low') return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
}

function semaphoreClass(value) {
  if (value === 'green') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (value === 'red') return 'bg-red-500/15 text-red-300 border-red-500/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
}

function sumContributions(goalId, contributions) {
  return contributions
    .filter((item) => item.goal_id === goalId)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getGoalContributions(goalId, contributions) {
  return contributions.filter((item) => item.goal_id === goalId);
}

function statusLabel(value) {
  return STATUSES.find((item) => item.value === value)?.label || 'Ativa';
}

function ProgressBar({ value, tone = 'bg-hagav-gold' }) {
  const width = Math.min(100, Math.max(0, Number(value || 0)));
  return (
    <div className="h-2 rounded-full bg-hagav-muted/40 overflow-hidden">
      <div className={classNames('h-full rounded-full transition-all', tone)} style={{ width: `${width}%` }} />
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, helper, tone = 'text-hagav-gold' }) {
  return (
    <div className="hcard p-4 min-h-[124px]">
      <p className="text-[10px] uppercase tracking-wider text-hagav-gray flex items-center gap-1.5">
        <Icon size={13} className={tone} />
        {label}
      </p>
      <p className={classNames('mt-3 text-xl font-bold', tone)}>{value}</p>
      {helper ? <p className="mt-1 text-xs text-hagav-gray">{helper}</p> : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] uppercase tracking-wider text-hagav-gray">{label}</span>
      {children}
    </label>
  );
}

function emptyGoalForm(type) {
  return {
    title: '',
    description: '',
    targetValue: '',
    initialReserved: '',
    startDate: todayInput(),
    targetDate: addDaysInput(type === 'study' ? 30 : 132),
    priority: type === 'financial' ? 'high' : 'medium',
    status: 'active',
    isPrimary: type === 'financial',
    productLink: '',
    minutesPerSession: '60',
    pace: 'normal',
    allowedWeekdays: [1, 2, 3, 4, 5],
    studySteps: DEFAULT_STUDY_STEPS,
  };
}

function GoalFormModal({ type, goal, open, onClose, onSaved }) {
  const [form, setForm] = useState(emptyGoalForm(type));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!goal) {
      setForm(emptyGoalForm(type));
      setError('');
      return;
    }
    setForm({
      title: goal.title || '',
      description: goal.description || '',
      targetValue: goal.target_value ? fmtBRL(goal.target_value) : '',
      initialReserved: '',
      startDate: goal.start_date || todayInput(),
      targetDate: goal.target_date || addDaysInput(type === 'study' ? 30 : 132),
      priority: goal.priority || 'medium',
      status: goal.status || 'active',
      isPrimary: Boolean(goal.is_primary),
      productLink: goal.details?.product_link || '',
      minutesPerSession: String(goal.details?.minutes_per_session || 60),
      pace: goal.details?.pace || 'normal',
      allowedWeekdays: Array.isArray(goal.details?.allowed_weekdays) ? goal.details.allowed_weekdays : [1, 2, 3, 4, 5],
      studySteps: Array.isArray(goal.details?.study_steps) && goal.details.study_steps.length
        ? goal.details.study_steps
        : DEFAULT_STUDY_STEPS,
    });
    setError('');
  }, [goal, open, type]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleWeekday(day) {
    setForm((current) => {
      const exists = current.allowedWeekdays.includes(day);
      return {
        ...current,
        allowedWeekdays: exists
          ? current.allowedWeekdays.filter((item) => item !== day)
          : [...current.allowedWeekdays, day].sort((a, b) => a - b),
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (type !== 'study' && parseCurrencyValue(form.targetValue) <= 0) {
        throw new Error(type === 'equipment' ? 'Informe o preço do equipamento.' : 'Informe o valor alvo da meta.');
      }
      const details = type === 'equipment'
        ? { product_link: form.productLink.trim() }
        : type === 'study'
          ? {
              minutes_per_session: Math.max(0, Number(form.minutesPerSession || 0)),
              pace: form.pace,
              allowed_weekdays: form.allowedWeekdays,
              study_steps: form.studySteps.map((item) => String(item || '').trim()).filter(Boolean),
            }
          : {};

      const saved = await saveCompanyGoal({
        id: goal?.id,
        scope: 'company',
        category: type,
        title: form.title,
        description: form.description,
        target_value: type === 'study' ? 0 : parseCurrencyValue(form.targetValue),
        start_date: form.startDate,
        target_date: form.targetDate,
        priority: form.priority,
        status: form.status,
        is_primary: type === 'financial' && form.isPrimary,
        details,
      });

      const initialAmount = parseCurrencyValue(form.initialReserved);
      if (!goal && initialAmount > 0) {
        await createGoalContribution({
          goal_id: saved.id,
          amount: initialAmount,
          contribution_date: form.startDate || todayInput(),
          note: 'Valor inicial reservado',
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('[Metas][Salvar meta]', err);
      setError(err?.message || 'Não foi possível salvar a meta.');
    } finally {
      setSaving(false);
    }
  }

  const title = goal
    ? 'Editar meta'
    : type === 'equipment'
      ? 'Novo equipamento'
      : type === 'study'
        ? 'Novo objetivo de estudo'
        : 'Nova meta financeira';

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={type === 'study' ? 'Objetivo' : type === 'equipment' ? 'Nome do equipamento' : 'Nome da meta'}>
            <input className="hinput w-full" value={form.title} onChange={(event) => updateField('title', event.target.value)} />
          </Field>
          {type !== 'study' ? (
            <Field label={type === 'equipment' ? 'Preço' : 'Valor alvo'}>
              <input
                type="text"
                inputMode="decimal"
                className="hinput w-full"
                value={form.targetValue}
                onChange={(event) => updateField('targetValue', event.target.value)}
                onBlur={(event) => updateField('targetValue', formatCurrencyInput(event.target.value))}
                placeholder="R$ 10.000,00"
              />
            </Field>
          ) : (
            <Field label="Minutos por sessão">
              <input className="hinput w-full" type="number" min="0" value={form.minutesPerSession} onChange={(event) => updateField('minutesPerSession', event.target.value)} />
            </Field>
          )}
          {!goal && type !== 'study' ? (
            <Field label={type === 'equipment' ? 'Valor reservado' : 'Valor já reservado'}>
              <input
                type="text"
                inputMode="decimal"
                className="hinput w-full"
                value={form.initialReserved}
                onChange={(event) => updateField('initialReserved', event.target.value)}
                onBlur={(event) => updateField('initialReserved', formatCurrencyInput(event.target.value))}
                placeholder="R$ 0,00"
              />
            </Field>
          ) : null}
          {type === 'equipment' ? (
            <Field label="Link do produto">
              <input className="hinput w-full" value={form.productLink} onChange={(event) => updateField('productLink', event.target.value)} placeholder="https://..." />
            </Field>
          ) : null}
          <Field label="Data inicial">
            <input className="hinput w-full" type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} />
          </Field>
          <Field label={type === 'equipment' ? 'Data desejada' : 'Data final'}>
            <input className="hinput w-full" type="date" value={form.targetDate} onChange={(event) => updateField('targetDate', event.target.value)} />
          </Field>
          <Field label="Prioridade">
            <select className="hselect w-full" value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>
              {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          {goal ? (
            <Field label="Status">
              <select className="hselect w-full" value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
          ) : null}
        </div>

        {type === 'financial' ? (
          <label className="inline-flex items-center gap-2 text-sm text-hagav-light">
            <input type="checkbox" checked={form.isPrimary} onChange={(event) => updateField('isPrimary', event.target.checked)} />
            Definir como meta principal da empresa
          </label>
        ) : null}

        {type === 'study' ? (
          <div className="space-y-3">
            <Field label="Ritmo">
              <select className="hselect w-full" value={form.pace} onChange={(event) => updateField('pace', event.target.value)}>
                <option value="leve">Leve</option>
                <option value="normal">Normal</option>
                <option value="intenso">Intenso</option>
              </select>
            </Field>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-hagav-gray mb-2">Dias disponíveis</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    type="button"
                    key={day.value}
                    onClick={() => toggleWeekday(day.value)}
                    className={classNames('btn-sm border rounded-lg', form.allowedWeekdays.includes(day.value) ? 'bg-hagav-gold text-hagav-black border-hagav-gold' : 'bg-transparent text-hagav-light border-hagav-border')}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-hagav-gray mb-2">Plano simples</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {form.studySteps.map((step, index) => (
                  <input
                    key={index}
                    className="hinput w-full"
                    value={step}
                    onChange={(event) => {
                      const next = form.studySteps.slice();
                      next[index] = event.target.value;
                      updateField('studySteps', next);
                    }}
                    placeholder={`Semana ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <Field label="Descrição">
          <textarea className="hinput w-full" value={form.description} onChange={(event) => updateField('description', event.target.value)} />
        </Field>

        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-gold">
            <Save size={14} />
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DepositModal({ goal, open, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: '', date: todayInput(), note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ amount: '', date: todayInput(), note: '' });
    setError('');
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await createGoalContribution({
        goal_id: goal?.id,
        amount: parseCurrencyValue(form.amount),
        contribution_date: form.date,
        note: form.note,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error('[Metas][Depósito]', err);
      setError(err?.message || 'Não foi possível registrar o depósito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={goal?.category === 'equipment' ? 'Adicionar valor reservado' : 'Adicionar depósito'} width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-hagav-light">{goal?.title}</p>
        <Field label="Valor">
          <input
            type="text"
            inputMode="decimal"
            className="hinput w-full"
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            onBlur={(event) => setForm((current) => ({ ...current, amount: formatCurrencyInput(event.target.value) }))}
            placeholder="R$ 1.000,00"
          />
        </Field>
        <Field label="Data">
          <input className="hinput w-full" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
        </Field>
        <Field label="Observação opcional">
          <textarea className="hinput w-full" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </Field>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-gold">Salvar depósito</button>
        </div>
      </div>
    </Modal>
  );
}

function StudySessionModal({ goal, open, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: todayInput(),
    topic: '',
    plannedMinutes: String(goal?.details?.minutes_per_session || 60),
    completedMinutes: '',
    completed: true,
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      date: todayInput(),
      topic: '',
      plannedMinutes: String(goal?.details?.minutes_per_session || 60),
      completedMinutes: String(goal?.details?.minutes_per_session || 60),
      completed: true,
      note: '',
    });
    setError('');
  }, [goal, open]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await createGoalStudySession({
        goal_id: goal?.id,
        session_date: form.date,
        topic: form.topic,
        planned_minutes: form.plannedMinutes,
        completed_minutes: form.completed ? form.completedMinutes : 0,
        completed: form.completed,
        note: form.note,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error('[Metas][Sessão]', err);
      setError(err?.message || 'Não foi possível registrar a sessão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar sessão de estudo" width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-hagav-light">{goal?.title}</p>
        <Field label="Data">
          <input className="hinput w-full" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
        </Field>
        <Field label="Tema">
          <input className="hinput w-full" value={form.topic} onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tempo planejado">
            <input className="hinput w-full" type="number" min="0" value={form.plannedMinutes} onChange={(event) => setForm((current) => ({ ...current, plannedMinutes: event.target.value }))} />
          </Field>
          <Field label="Tempo realizado">
            <input className="hinput w-full" type="number" min="0" value={form.completedMinutes} onChange={(event) => setForm((current) => ({ ...current, completedMinutes: event.target.value }))} />
          </Field>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-hagav-light">
          <input type="checkbox" checked={form.completed} onChange={(event) => setForm((current) => ({ ...current, completed: event.target.checked }))} />
          Concluído
        </label>
        <Field label="Observação">
          <textarea className="hinput w-full" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </Field>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-gold">Salvar sessão</button>
        </div>
      </div>
    </Modal>
  );
}

function GoalDetailModal({ goal, stats, contributions, sessions, open, onClose, onDeposit, onSession }) {
  if (!goal) return null;
  const isStudy = goal.category === 'study';
  const isEquipment = goal.category === 'equipment';
  const steps = Array.isArray(goal.details?.study_steps) && goal.details.study_steps.length
    ? goal.details.study_steps
    : DEFAULT_STUDY_STEPS;

  return (
    <Modal open={open} onClose={onClose} title={goal.title} width="max-w-3xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoCard
            icon={isStudy ? BookOpen : isEquipment ? Monitor : PiggyBank}
            label={isStudy ? 'Progresso' : isEquipment ? 'Reservado' : 'Acumulado'}
            value={isStudy ? formatPercent(stats.progressPercent) : fmtBRL(stats.accumulatedValue || stats.reservedValue || 0)}
            helper={isStudy ? `${stats.completedSessions} de ${stats.plannedSessions} sessões` : `${formatPercent(stats.progressPercent)} da meta`}
          />
          <InfoCard
            icon={CalendarDays}
            label={isEquipment ? 'Data desejada' : 'Prazo'}
            value={goal.target_date ? fmtDate(goal.target_date) : '-'}
            helper={isStudy ? `${stats.weeklyMinutes} min por semana` : `${stats.daysRemaining || 0} dias restantes`}
            tone="text-blue-300"
          />
          <InfoCard
            icon={Flag}
            label="Prioridade"
            value={priorityLabel(goal.priority)}
            helper={statusLabel(goal.status)}
            tone="text-amber-300"
          />
        </div>

        {!isStudy ? (
          <div className="hcard p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-hagav-white">{isEquipment ? 'Regra de liberação' : 'Planejamento da meta'}</p>
                <p className="text-xs text-hagav-gray">
                  {isEquipment
                    ? 'Compra liberada somente com 100% do valor reservado.'
                    : 'Ritmo calculado até a data final da meta.'}
                </p>
              </div>
              <span className={classNames('badge', isEquipment ? (stats.isReady ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30') : semaphoreClass(stats.statusColor))}>
                {isEquipment ? stats.status : stats.statusLabel}
              </span>
            </div>
            <ProgressBar value={stats.progressPercent} tone={isEquipment && stats.isReady ? 'bg-emerald-400' : 'bg-hagav-gold'} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-hagav-gray">Faltam</p>
                <p className="text-hagav-white font-semibold">{fmtBRL(stats.remainingAmount)}</p>
              </div>
              {!isEquipment ? (
                <>
                  <div>
                    <p className="text-xs text-hagav-gray">Necessário por semana</p>
                    <p className="text-hagav-white font-semibold">{fmtBRL(stats.requiredWeekly)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-hagav-gray">Necessário por dia</p>
                    <p className="text-hagav-white font-semibold">{fmtBRL(stats.requiredDaily)}</p>
                  </div>
                </>
              ) : null}
            </div>
            {!isEquipment ? (
              <div className="rounded-xl border border-hagav-border bg-hagav-surface/60 p-3">
                <p className="text-xs uppercase tracking-wider text-hagav-gray mb-2">Checklist simples</p>
                <div className="space-y-1.5">
                  {stats.nextDailyPlan.map((item, index) => (
                    <div key={`${item.date.toISOString()}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-hagav-light">{index === 0 ? 'Hoje' : fmtDate(`${item.date.getFullYear()}-${pad(item.date.getMonth() + 1)}-${pad(item.date.getDate())}`)}</span>
                      <span className="text-hagav-gold">Meta sugerida: {fmtBRL(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button type="button" onClick={() => onDeposit(goal)} className="btn-gold btn-sm">
              <Plus size={13} />
              {isEquipment ? 'Adicionar valor' : 'Adicionar depósito'}
            </button>
          </div>
        ) : (
          <div className="hcard p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-hagav-white">Plano simples</p>
              <p className="text-xs text-hagav-gray">Estrutura determinística para validar a rotina antes de sofisticar.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {steps.map((step, index) => (
                <div key={`${step}-${index}`} className="rounded-xl border border-hagav-border bg-hagav-surface/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-hagav-gray">Semana {index + 1}</p>
                  <p className="text-sm text-hagav-white mt-1">{step}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onSession(goal)} className="btn-gold btn-sm">
              <Plus size={13} />
              Adicionar sessão
            </button>
          </div>
        )}

        <div className="hcard p-4">
          <p className="text-sm font-semibold text-hagav-white mb-3">{isStudy ? 'Sessões registradas' : 'Histórico'}</p>
          {isStudy ? (
            sessions.length === 0 ? (
              <p className="text-sm text-hagav-gray">Nenhuma sessão registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl bg-hagav-surface/60 border border-hagav-border px-3 py-2">
                    <div>
                      <p className="text-sm text-hagav-white">{session.topic}</p>
                      <p className="text-xs text-hagav-gray">{fmtDate(session.session_date)} · {session.completed_minutes || 0} min realizados</p>
                    </div>
                    {session.completed ? <CheckCircle2 size={16} className="text-emerald-300" /> : <span className="badge bg-amber-500/15 text-amber-300 border-amber-500/30">Aberta</span>}
                  </div>
                ))}
              </div>
            )
          ) : contributions.length === 0 ? (
            <p className="text-sm text-hagav-gray">Nenhum depósito registrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {contributions.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-hagav-surface/60 border border-hagav-border px-3 py-2">
                  <div>
                    <p className="text-sm text-hagav-white">+ {fmtBRL(item.amount)}</p>
                    {item.note ? <p className="text-xs text-hagav-gray">{item.note}</p> : null}
                  </div>
                  <span className="text-xs text-hagav-gray">{fmtDate(item.contribution_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function MetasEmpresaPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [studySessions, setStudySessions] = useState([]);
  const [weeklyBudgetInput, setWeeklyBudgetInput] = useState('');
  const [goalModal, setGoalModal] = useState({ open: false, type: 'financial', goal: null });
  const [depositGoal, setDepositGoal] = useState(null);
  const [sessionGoal, setSessionGoal] = useState(null);
  const [detailGoal, setDetailGoal] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const bundle = await fetchCompanyGoalsBundle();
      setGoals(bundle.goals);
      setContributions(bundle.contributions);
      setStudySessions(bundle.studySessions);
      const weeklyBudget = Number(bundle.settings?.company_weekly_budget?.amount || 0);
      setWeeklyBudgetInput(weeklyBudget > 0 ? fmtBRL(weeklyBudget) : '');
    } catch (err) {
      console.error('[Metas]', err);
      setError('Não foi possível carregar metas. Verifique se a migration do módulo de metas foi aplicada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const financialGoals = useMemo(() => goals.filter((goal) => goal.category === 'financial'), [goals]);
  const equipmentGoals = useMemo(() => goals.filter((goal) => goal.category === 'equipment'), [goals]);
  const studyGoals = useMemo(() => goals.filter((goal) => goal.category === 'study'), [goals]);

  const financialView = useMemo(() => financialGoals.map((goal) => ({
    goal,
    stats: calculateGoalProgress({
      targetValue: goal.target_value,
      accumulatedValue: sumContributions(goal.id, contributions),
      startDate: goal.start_date,
      targetDate: goal.target_date,
      referenceDate: new Date(),
    }),
  })), [contributions, financialGoals]);

  const equipmentView = useMemo(() => equipmentGoals.map((goal) => ({
    goal,
    stats: calculateEquipmentReadiness({
      price: goal.target_value,
      reserved: sumContributions(goal.id, contributions),
    }),
  })), [contributions, equipmentGoals]);

  const studyView = useMemo(() => studyGoals.map((goal) => {
    const sessions = studySessions.filter((session) => session.goal_id === goal.id);
    const completed = sessions.filter((session) => session.completed);
    return {
      goal,
      stats: calculateStudyProgress({
        startDate: goal.start_date,
        targetDate: goal.target_date,
        minutesPerSession: goal.details?.minutes_per_session || 60,
        allowedWeekdays: goal.details?.allowed_weekdays || [1, 2, 3, 4, 5],
        completedSessions: completed.length,
        completedMinutes: completed.reduce((sum, session) => sum + Number(session.completed_minutes || 0), 0),
        pace: goal.details?.pace || 'normal',
      }),
    };
  }), [studyGoals, studySessions]);

  const primaryGoal = financialView.find(({ goal }) => goal.is_primary && goal.status === 'active')
    || financialView.find(({ goal }) => goal.status === 'active')
    || null;
  const weeklyBudget = parseCurrencyValue(weeklyBudgetInput);
  const reservedTotal = contributions
    .filter((item) => goals.some((goal) => goal.id === item.goal_id && goal.category !== 'study'))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const nextGoal = [...financialView, ...equipmentView]
    .filter((item) => item.goal.status === 'active' && Number(item.stats.remainingAmount || 0) > 0)
    .sort((a, b) => Number(a.stats.remainingAmount || 0) - Number(b.stats.remainingAmount || 0))[0] || null;

  const allocationPlan = useMemo(() => calculateWeeklyAllocation({
    availableAmount: weeklyBudget,
    primaryGoal: primaryGoal ? {
      id: primaryGoal.goal.id,
      title: primaryGoal.goal.title,
      category: 'financial',
      isPrimary: true,
      requiredWeekly: primaryGoal.stats.requiredWeekly,
      remainingAmount: primaryGoal.stats.remainingAmount,
    } : null,
    financialGoals: financialView
      .filter(({ goal }) => goal.status === 'active' && !goal.is_primary)
      .map(({ goal, stats }) => ({
        id: goal.id,
        title: goal.title,
        category: 'financial',
        isPrimary: false,
        priority: goal.priority,
        requiredWeekly: stats.requiredWeekly,
        remainingAmount: stats.remainingAmount,
      })),
    equipmentGoals: equipmentView
      .filter(({ goal }) => goal.status === 'active')
      .map(({ goal, stats }) => ({
        id: goal.id,
        title: goal.title,
        category: 'equipment',
        priority: goal.priority,
        remainingAmount: stats.remainingAmount,
      })),
  }), [equipmentView, financialView, primaryGoal, weeklyBudget]);

  const nextAction = allocationPlan.allocations[0]
    ? `Guardar ${fmtBRL(allocationPlan.allocations[0].amount)} esta semana na ${allocationPlan.allocations[0].title}`
    : primaryGoal
      ? `Defina quanto pode destinar esta semana para calcular a próxima ação.`
      : 'Crie uma meta principal para receber recomendações.';

  async function saveWeeklyBudget() {
    setFeedback('');
    setError('');
    try {
      await saveCompanyGoalSetting('company_weekly_budget', { amount: weeklyBudget });
      setFeedback('Distribuição recalculada e valor semanal salvo.');
    } catch (err) {
      console.error('[Metas][Orçamento semanal]', err);
      setError('Não foi possível salvar o valor disponível da semana.');
    }
  }

  async function handleArchive(goal) {
    const confirmed = window.confirm('Esta meta será arquivada e sairá da lista principal. Continuar?');
    if (!confirmed) return;
    try {
      await archiveCompanyGoal(goal.id);
      setFeedback('Meta arquivada.');
      await load();
    } catch (err) {
      console.error('[Metas][Arquivar]', err);
      setError('Não foi possível arquivar a meta.');
    }
  }

  function openGoal(type, goal = null) {
    setGoalModal({ open: true, type, goal });
  }

  const detail = detailGoal
    ? [...financialView, ...equipmentView, ...studyView].find(({ goal }) => goal.id === detailGoal.id)
    : null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Metas da empresa</h1>
          <p className="page-subtitle">Planeje reservas, investimentos, equipamentos e evolução dos sócios.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button type="button" onClick={() => openGoal('financial')} className="btn-gold btn-sm">
            <Plus size={13} />
            Nova meta
          </button>
        </div>
      </div>

      <div className="hcard p-2 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={classNames('btn-sm rounded-lg border transition-colors', activeTab === tab.id ? 'bg-hagav-gold text-hagav-black border-hagav-gold' : 'bg-transparent text-hagav-light border-hagav-border hover:bg-hagav-muted/30')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p> : null}
      {feedback ? <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{feedback}</p> : null}

      {loading ? (
        <div className="py-20 flex justify-center"><RefreshCw className="animate-spin text-hagav-gold" /></div>
      ) : (
        <>
          {activeTab === 'overview' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                <InfoCard
                  icon={Target}
                  label="Meta principal"
                  value={primaryGoal ? primaryGoal.goal.title : 'Nenhuma'}
                  helper={primaryGoal ? `${fmtBRL(primaryGoal.stats.accumulatedValue)} / ${fmtBRL(primaryGoal.stats.targetValue)} · ${formatPercent(primaryGoal.stats.progressPercent)}` : 'Crie uma meta financeira principal'}
                />
                <InfoCard icon={CircleDollarSign} label="Disponível esta semana" value={weeklyBudget > 0 ? fmtBRL(weeklyBudget) : 'R$ 0,00'} helper="Valor autorizado manualmente" tone="text-blue-300" />
                <InfoCard icon={PiggyBank} label="Reservado em metas" value={fmtBRL(reservedTotal)} helper="Depósitos e valores reservados" tone="text-emerald-300" />
                <InfoCard icon={Flag} label="Próxima meta" value={nextGoal ? nextGoal.goal.title : 'Nenhuma'} helper={nextGoal ? `${fmtBRL(nextGoal.stats.accumulatedValue || nextGoal.stats.reservedValue || 0)} / ${fmtBRL(nextGoal.stats.targetValue)}` : 'Sem metas abertas'} tone="text-amber-300" />
                <InfoCard icon={CheckCircle2} label="Próxima ação" value={nextAction} helper="Sugestão do motor básico" tone="text-hagav-light" />
              </div>

              <div className="hcard p-4 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-hagav-white">Quanto podemos destinar esta semana?</h2>
                    <p className="text-xs text-hagav-gray">O motor prioriza a meta principal e distribui apenas o restante.</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Valor disponível">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="hinput w-44"
                        value={weeklyBudgetInput}
                        onChange={(event) => setWeeklyBudgetInput(event.target.value)}
                        onBlur={(event) => setWeeklyBudgetInput(formatCurrencyInput(event.target.value))}
                        placeholder="R$ 500,00"
                      />
                    </Field>
                    <button type="button" onClick={saveWeeklyBudget} className="btn-gold">
                      Calcular distribuição
                    </button>
                  </div>
                </div>

                {allocationPlan.allocations.length === 0 ? (
                  <p className="text-sm text-hagav-gray">Informe um valor semanal e tenha pelo menos uma meta ativa para receber uma sugestão.</p>
                ) : (
                  <div className="space-y-2">
                    {allocationPlan.allocations.map((item) => (
                      <div key={`${item.goalId}-${item.category}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-hagav-surface/60 border border-hagav-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-hagav-white">{item.title}</p>
                          <p className="text-xs text-hagav-gray">{item.reason}</p>
                        </div>
                        <span className="text-sm font-semibold text-hagav-gold">Sugestão: {fmtBRL(item.amount)}</span>
                      </div>
                    ))}
                    {allocationPlan.unallocatedAmount > 0 ? (
                      <p className="text-xs text-hagav-gray">Não alocado: {fmtBRL(allocationPlan.unallocatedAmount)}</p>
                    ) : null}
                    {allocationPlan.allocations.some((item) => item.category === 'equipment') ? (
                      <p className="text-xs text-emerald-300">O valor sugerido para equipamento não compromete a meta principal.</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'financial' ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" onClick={() => openGoal('financial')} className="btn-gold btn-sm">
                  <Plus size={13} /> Nova meta
                </button>
              </div>
              {financialView.length === 0 ? (
                <EmptyState icon={PiggyBank} title="Nenhuma meta financeira" description="Crie a Reserva Dezembro para começar o planejamento." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {financialView.map(({ goal, stats }) => (
                    <div key={goal.id} className="hcard p-4 space-y-4 cursor-pointer" onClick={() => setDetailGoal(goal)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-hagav-white">{goal.title}</h2>
                            {goal.is_primary ? <span className="badge bg-hagav-gold/15 text-hagav-gold border-hagav-gold/30">Meta principal</span> : null}
                          </div>
                          <p className="text-xs text-hagav-gray mt-1">{goal.description || 'Sem descrição'}</p>
                        </div>
                        <span className={classNames('badge', semaphoreClass(stats.statusColor))}>{stats.statusLabel}</span>
                      </div>
                      <ProgressBar value={stats.progressPercent} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-hagav-gray">Reservado</p><p className="text-hagav-white font-semibold">{fmtBRL(stats.accumulatedValue)}</p></div>
                        <div><p className="text-xs text-hagav-gray">Alvo</p><p className="text-hagav-white font-semibold">{fmtBRL(stats.targetValue)}</p></div>
                        <div><p className="text-xs text-hagav-gray">Faltam</p><p className="text-hagav-white font-semibold">{fmtBRL(stats.remainingAmount)}</p></div>
                        <div><p className="text-xs text-hagav-gray">Prazo</p><p className="text-hagav-white font-semibold">{goal.target_date ? fmtDate(goal.target_date) : '-'}</p></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-hagav-gray">
                        <span>{fmtBRL(stats.requiredMonthly)}/mês</span>
                        <span>{fmtBRL(stats.requiredWeekly)}/semana</span>
                        <span>{fmtBRL(stats.requiredDaily)}/dia</span>
                      </div>
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => setDepositGoal(goal)} className="btn-gold btn-sm">Adicionar depósito</button>
                        <button type="button" onClick={() => openGoal('financial', goal)} className="btn-ghost btn-sm">Editar</button>
                        <button type="button" onClick={() => handleArchive(goal)} className="btn-ghost btn-sm">
                          <Archive size={12} /> Arquivar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'equipment' ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" onClick={() => openGoal('equipment')} className="btn-gold btn-sm">
                  <Plus size={13} /> Novo equipamento
                </button>
              </div>
              {equipmentView.length === 0 ? (
                <EmptyState icon={Monitor} title="Nenhum equipamento planejado" description="Cadastre um monitor, SSD, câmera ou outro investimento." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {equipmentView.map(({ goal, stats }) => (
                    <div key={goal.id} className="hcard p-4 space-y-4 cursor-pointer" onClick={() => setDetailGoal(goal)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-hagav-white">{goal.title}</h2>
                          <p className="text-xs text-hagav-gray mt-1">{goal.description || 'Compra planejada'}</p>
                        </div>
                        <span className={classNames('badge', stats.isReady ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30')}>{stats.status}</span>
                      </div>
                      <ProgressBar value={stats.progressPercent} tone={stats.isReady ? 'bg-emerald-400' : 'bg-hagav-gold'} />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-hagav-gray">Preço</p><p className="text-hagav-white font-semibold">{fmtBRL(stats.targetValue)}</p></div>
                        <div><p className="text-xs text-hagav-gray">Reservado</p><p className="text-hagav-white font-semibold">{fmtBRL(stats.reservedValue)}</p></div>
                        <div><p className="text-xs text-hagav-gray">Falta</p><p className="text-hagav-white font-semibold">{fmtBRL(stats.remainingAmount)}</p></div>
                        <div><p className="text-xs text-hagav-gray">Progresso</p><p className="text-hagav-white font-semibold">{formatPercent(stats.progressPercent)}</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => setDepositGoal(goal)} className="btn-gold btn-sm">Adicionar valor</button>
                        {goal.details?.product_link ? (
                          <a href={goal.details.product_link} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                            <ExternalLink size={12} /> Abrir produto
                          </a>
                        ) : null}
                        <button type="button" onClick={() => openGoal('equipment', goal)} className="btn-ghost btn-sm">Editar</button>
                        <button type="button" onClick={() => handleArchive(goal)} className="btn-ghost btn-sm">
                          <Archive size={12} /> Arquivar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'study' ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" onClick={() => openGoal('study')} className="btn-gold btn-sm">
                  <Plus size={13} /> Novo objetivo
                </button>
              </div>
              {studyView.length === 0 ? (
                <EmptyState icon={BookOpen} title="Nenhum objetivo de estudo" description="Crie um objetivo para organizar a evolução dos sócios." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {studyView.map(({ goal, stats }) => (
                    <div key={goal.id} className="hcard p-4 space-y-4 cursor-pointer" onClick={() => setDetailGoal(goal)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-hagav-white">{goal.title}</h2>
                          <p className="text-xs text-hagav-gray mt-1">{goal.description || 'Plano de estudo'}</p>
                        </div>
                        <span className={classNames('badge', priorityClass(goal.priority))}>{priorityLabel(goal.priority)}</span>
                      </div>
                      <ProgressBar value={stats.progressPercent} tone="bg-blue-400" />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-hagav-gray">Prazo</p><p className="text-hagav-white font-semibold">{goal.target_date ? fmtDate(goal.target_date) : '-'}</p></div>
                        <div><p className="text-xs text-hagav-gray">Ritmo</p><p className="text-hagav-white font-semibold">{Math.round(stats.weeklyMinutes / 60)}h/semana</p></div>
                        <div><p className="text-xs text-hagav-gray">Planejadas</p><p className="text-hagav-white font-semibold">{stats.plannedSessions}</p></div>
                        <div><p className="text-xs text-hagav-gray">Concluídas</p><p className="text-hagav-white font-semibold">{stats.completedSessions}</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => setDetailGoal(goal)} className="btn-gold btn-sm">Ver plano</button>
                        <button type="button" onClick={() => setSessionGoal(goal)} className="btn-ghost btn-sm">Adicionar sessão</button>
                        <button type="button" onClick={() => openGoal('study', goal)} className="btn-ghost btn-sm">Editar</button>
                        <button type="button" onClick={() => handleArchive(goal)} className="btn-ghost btn-sm">
                          <Archive size={12} /> Arquivar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      <GoalFormModal
        open={goalModal.open}
        type={goalModal.type}
        goal={goalModal.goal}
        onClose={() => setGoalModal((current) => ({ ...current, open: false }))}
        onSaved={load}
      />
      <DepositModal
        open={Boolean(depositGoal)}
        goal={depositGoal}
        onClose={() => setDepositGoal(null)}
        onSaved={load}
      />
      <StudySessionModal
        open={Boolean(sessionGoal)}
        goal={sessionGoal}
        onClose={() => setSessionGoal(null)}
        onSaved={load}
      />
      <GoalDetailModal
        open={Boolean(detailGoal)}
        goal={detailGoal}
        stats={detail?.stats || {}}
        contributions={detailGoal ? getGoalContributions(detailGoal.id, contributions) : []}
        sessions={detailGoal ? studySessions.filter((session) => session.goal_id === detailGoal.id) : []}
        onClose={() => setDetailGoal(null)}
        onDeposit={(goal) => {
          setDetailGoal(null);
          setDepositGoal(goal);
        }}
        onSession={(goal) => {
          setDetailGoal(null);
          setSessionGoal(goal);
        }}
      />
    </div>
  );
}

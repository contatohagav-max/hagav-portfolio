import { getSupabase } from '@/lib/supabase';
import { parseCalendarDate } from '@/lib/goals-engine';

function normalizeMoney(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeGoal(row) {
  if (!row) return null;
  return {
    ...row,
    target_value: normalizeMoney(row.target_value),
    details: normalizeDetails(row.details),
  };
}

function normalizeContribution(row) {
  if (!row) return null;
  return {
    ...row,
    amount: normalizeMoney(row.amount),
  };
}

function normalizeStudySession(row) {
  if (!row) return null;
  return {
    ...row,
    planned_minutes: Number(row.planned_minutes || 0),
    completed_minutes: Number(row.completed_minutes || 0),
    completed: Boolean(row.completed),
  };
}

function calendarDateKey(value) {
  const date = parseCalendarDate(value);
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function formatCalendarDateBR(value) {
  const date = parseCalendarDate(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function validateStudySessionPeriod(goal, sessionDate) {
  if (!goal?.start_date || !goal?.target_date) return;
  const sessionKey = calendarDateKey(sessionDate);
  const startKey = calendarDateKey(goal.start_date);
  const targetKey = calendarDateKey(goal.target_date);
  if (sessionKey < startKey || sessionKey > targetKey) {
    throw new Error(
      `A sessão deve estar dentro do período do objetivo, de ${formatCalendarDateBR(goal.start_date)} a ${formatCalendarDateBR(goal.target_date)}.`,
    );
  }
}

export async function fetchCompanyGoalsBundle() {
  const client = getSupabase();
  if (!client) {
    return {
      goals: [],
      contributions: [],
      studySessions: [],
      settings: {},
    };
  }

  const { data: goalsData, error: goalsError } = await client
    .from('goals')
    .select('*')
    .eq('scope', 'company')
    .neq('status', 'archived')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false });

  if (goalsError) throw goalsError;

  const goals = (goalsData || []).map(normalizeGoal).filter(Boolean);
  const goalIds = goals.map((goal) => goal.id).filter(Boolean);

  let contributions = [];
  let studySessions = [];

  if (goalIds.length > 0) {
    const { data: contributionsData, error: contributionsError } = await client
      .from('goal_contributions')
      .select('*')
      .in('goal_id', goalIds)
      .order('contribution_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (contributionsError) throw contributionsError;
    contributions = (contributionsData || []).map(normalizeContribution).filter(Boolean);

    const { data: sessionsData, error: sessionsError } = await client
      .from('goal_study_sessions')
      .select('*')
      .in('goal_id', goalIds)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (sessionsError) throw sessionsError;
    studySessions = (sessionsData || []).map(normalizeStudySession).filter(Boolean);
  }

  const { data: settingsData, error: settingsError } = await client
    .from('goal_settings')
    .select('key, value')
    .eq('scope', 'company');

  if (settingsError) throw settingsError;

  const settings = {};
  (settingsData || []).forEach((row) => {
    if (row?.key) settings[row.key] = row.value;
  });

  return {
    goals,
    contributions,
    studySessions,
    settings,
  };
}

export async function saveCompanyGoal(fields) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const isPrimary = fields?.category === 'financial'
    && fields?.scope === 'company'
    && fields?.status === 'active'
    && Boolean(fields?.is_primary);

  if (isPrimary) {
    let query = client
      .from('goals')
      .update({ is_primary: false })
      .eq('scope', 'company')
      .eq('category', 'financial')
      .eq('status', 'active')
      .eq('is_primary', true);

    if (fields?.id) query = query.neq('id', fields.id);
    const { error } = await query;
    if (error) throw error;
  }

  const payload = {
    scope: 'company',
    category: fields?.category || 'financial',
    title: String(fields?.title || '').trim(),
    description: String(fields?.description || '').trim() || null,
    target_value: normalizeMoney(fields?.target_value),
    start_date: fields?.start_date || null,
    target_date: fields?.target_date || null,
    priority: fields?.priority || 'medium',
    status: fields?.status || 'active',
    is_primary: isPrimary,
    details: normalizeDetails(fields?.details),
  };

  if (!payload.title) throw new Error('Informe o nome da meta.');

  const query = fields?.id
    ? client.from('goals').update(payload).eq('id', fields.id)
    : client.from('goals').insert(payload);

  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return normalizeGoal(data);
}

export async function archiveCompanyGoal(id) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const { data, error } = await client
    .from('goals')
    .update({ status: 'archived', is_primary: false })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeGoal(data);
}

export async function createGoalContribution(fields) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const payload = {
    goal_id: fields?.goal_id,
    amount: normalizeMoney(fields?.amount),
    contribution_date: fields?.contribution_date || new Date().toISOString().slice(0, 10),
    note: String(fields?.note || '').trim() || null,
  };

  if (!payload.goal_id) throw new Error('Meta inválida.');
  if (payload.amount <= 0) throw new Error('Informe um valor maior que zero.');

  const { data, error } = await client
    .from('goal_contributions')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeContribution(data);
}

export async function createGoalStudySession(fields) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const payload = {
    goal_id: fields?.goal_id,
    session_date: fields?.session_date || new Date().toISOString().slice(0, 10),
    topic: String(fields?.topic || '').trim(),
    planned_minutes: Math.max(0, Number(fields?.planned_minutes || 0)),
    completed_minutes: Math.max(0, Number(fields?.completed_minutes || 0)),
    completed: Boolean(fields?.completed),
    note: String(fields?.note || '').trim() || null,
  };

  if (!payload.goal_id) throw new Error('Objetivo inválido.');
  if (!payload.topic) throw new Error('Informe o tema da sessão.');

  const { data: goalData, error: goalError } = await client
    .from('goals')
    .select('id, start_date, target_date')
    .eq('id', payload.goal_id)
    .single();

  if (goalError) throw goalError;
  validateStudySessionPeriod(goalData, payload.session_date);

  const { data, error } = await client
    .from('goal_study_sessions')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeStudySession(data);
}

export async function saveCompanyGoalSetting(key, value) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado');

  const { data, error } = await client
    .from('goal_settings')
    .upsert({
      scope: 'company',
      key,
      value,
    }, { onConflict: 'scope,key' })
    .select('key, value')
    .single();

  if (error) throw error;
  return data;
}

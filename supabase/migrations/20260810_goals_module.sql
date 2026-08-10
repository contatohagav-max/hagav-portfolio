-- HAGAV - modulo de metas da empresa.
-- Tabelas isoladas de Financeiro/Deals para planejamento e acompanhamento.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'company' check (scope in ('company', 'personal')),
  category text not null check (category in ('financial', 'equipment', 'study')),
  title text not null,
  description text,
  target_value numeric(12,2) not null default 0 check (target_value >= 0),
  start_date date,
  target_date date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'archived')),
  is_primary boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists goals_one_active_company_primary_idx
  on public.goals (is_primary)
  where scope = 'company'
    and category = 'financial'
    and is_primary = true
    and status = 'active';

create index if not exists idx_goals_scope_category_status
  on public.goals(scope, category, status);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  contribution_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_goal_contributions_goal_date
  on public.goal_contributions(goal_id, contribution_date);

create table if not exists public.goal_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'company' check (scope in ('company', 'personal')),
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope, key)
);

create table if not exists public.goal_study_sessions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  session_date date not null default current_date,
  topic text not null,
  planned_minutes integer not null default 0 check (planned_minutes >= 0),
  completed_minutes integer not null default 0 check (completed_minutes >= 0),
  completed boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goal_study_sessions_goal_date
  on public.goal_study_sessions(goal_id, session_date);

alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.goal_settings enable row level security;
alter table public.goal_study_sessions enable row level security;

grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.goal_contributions to authenticated;
grant select, insert, update, delete on public.goal_settings to authenticated;
grant select, insert, update, delete on public.goal_study_sessions to authenticated;

grant all on public.goals to service_role;
grant all on public.goal_contributions to service_role;
grant all on public.goal_settings to service_role;
grant all on public.goal_study_sessions to service_role;

drop policy if exists goals_admin_select on public.goals;
create policy goals_admin_select
on public.goals
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goals_admin_insert on public.goals;
create policy goals_admin_insert
on public.goals
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goals_admin_update on public.goals;
create policy goals_admin_update
on public.goals
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goals_admin_delete on public.goals;
create policy goals_admin_delete
on public.goals
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists goal_contributions_admin_select on public.goal_contributions;
create policy goal_contributions_admin_select
on public.goal_contributions
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_contributions_admin_insert on public.goal_contributions;
create policy goal_contributions_admin_insert
on public.goal_contributions
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_contributions_admin_update on public.goal_contributions;
create policy goal_contributions_admin_update
on public.goal_contributions
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_contributions_admin_delete on public.goal_contributions;
create policy goal_contributions_admin_delete
on public.goal_contributions
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists goal_settings_admin_select on public.goal_settings;
create policy goal_settings_admin_select
on public.goal_settings
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_settings_admin_insert on public.goal_settings;
create policy goal_settings_admin_insert
on public.goal_settings
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_settings_admin_update on public.goal_settings;
create policy goal_settings_admin_update
on public.goal_settings
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_settings_admin_delete on public.goal_settings;
create policy goal_settings_admin_delete
on public.goal_settings
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists goal_study_sessions_admin_select on public.goal_study_sessions;
create policy goal_study_sessions_admin_select
on public.goal_study_sessions
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_study_sessions_admin_insert on public.goal_study_sessions;
create policy goal_study_sessions_admin_insert
on public.goal_study_sessions
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_study_sessions_admin_update on public.goal_study_sessions;
create policy goal_study_sessions_admin_update
on public.goal_study_sessions
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists goal_study_sessions_admin_delete on public.goal_study_sessions;
create policy goal_study_sessions_admin_delete
on public.goal_study_sessions
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.hagav_set_updated_at();

drop trigger if exists goal_settings_set_updated_at on public.goal_settings;
create trigger goal_settings_set_updated_at
before update on public.goal_settings
for each row execute function public.hagav_set_updated_at();

drop trigger if exists goal_study_sessions_set_updated_at on public.goal_study_sessions;
create trigger goal_study_sessions_set_updated_at
before update on public.goal_study_sessions
for each row execute function public.hagav_set_updated_at();

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key,
  email text not null unique,
  role text not null default 'viewer' check (role in ('admin', 'comercial', 'operacao', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  resource_type text,
  resource_id text,
  status text,
  route text,
  origin text,
  ip text,
  user_agent text,
  details jsonb
);

create or replace function public.hagav_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role
      from public.admin_users
      where user_id = auth.uid()
        and active = true
      limit 1
    ),
    'viewer'
  );
$$;

create or replace function public.hagav_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hagav_admin_role() = any(allowed_roles);
$$;

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.deals enable row level security;
alter table public.contatos enable row level security;
alter table public.configuracoes enable row level security;

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row
execute function public.hagav_set_updated_at();

drop policy if exists admin_users_self_select on public.admin_users;
create policy admin_users_self_select
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists admin_users_admin_select on public.admin_users;
create policy admin_users_admin_select
on public.admin_users
for select
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists admin_users_admin_manage on public.admin_users;
create policy admin_users_admin_manage
on public.admin_users
for all
to authenticated
using (public.hagav_has_role(array['admin']))
with check (public.hagav_has_role(array['admin']));

drop policy if exists admin_audit_logs_admin_select on public.admin_audit_logs;
create policy admin_audit_logs_admin_select
on public.admin_audit_logs
for select
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists deals_public_insert on public.deals;
create policy deals_public_insert
on public.deals
for insert
to anon
with check (true);

drop policy if exists deals_admin_select on public.deals;
create policy deals_admin_select
on public.deals
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao', 'viewer']));

drop policy if exists deals_admin_insert on public.deals;
create policy deals_admin_insert
on public.deals
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial', 'operacao']));

drop policy if exists deals_admin_update on public.deals;
create policy deals_admin_update
on public.deals
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao']))
with check (public.hagav_has_role(array['admin', 'comercial', 'operacao']));

drop policy if exists deals_admin_delete on public.deals;
create policy deals_admin_delete
on public.deals
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists contatos_admin_select on public.contatos;
create policy contatos_admin_select
on public.contatos
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao', 'viewer']));

drop policy if exists contatos_admin_insert on public.contatos;
create policy contatos_admin_insert
on public.contatos
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial', 'operacao']));

drop policy if exists contatos_admin_update on public.contatos;
create policy contatos_admin_update
on public.contatos
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao']))
with check (public.hagav_has_role(array['admin', 'comercial', 'operacao']));

drop policy if exists contatos_admin_delete on public.contatos;
create policy contatos_admin_delete
on public.contatos
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists configuracoes_admin_select on public.configuracoes;
create policy configuracoes_admin_select
on public.configuracoes
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao', 'viewer']));

drop policy if exists configuracoes_admin_insert on public.configuracoes;
create policy configuracoes_admin_insert
on public.configuracoes
for insert
to authenticated
with check (public.hagav_has_role(array['admin']));

drop policy if exists configuracoes_admin_update on public.configuracoes;
create policy configuracoes_admin_update
on public.configuracoes
for update
to authenticated
using (public.hagav_has_role(array['admin']))
with check (public.hagav_has_role(array['admin']));

drop policy if exists configuracoes_admin_delete on public.configuracoes;
create policy configuracoes_admin_delete
on public.configuracoes
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

insert into public.admin_users (user_id, email, role, active)
select
  id,
  email,
  coalesce(
    nullif(raw_app_meta_data ->> 'hagav_role', ''),
    nullif(raw_app_meta_data ->> 'role', ''),
    nullif(raw_user_meta_data ->> 'hagav_role', ''),
    nullif(raw_user_meta_data ->> 'role', ''),
    'admin'
  ),
  true
from auth.users
where email is not null
on conflict (user_id) do update
set
  email = excluded.email,
  role = excluded.role,
  active = true,
  updated_at = now();

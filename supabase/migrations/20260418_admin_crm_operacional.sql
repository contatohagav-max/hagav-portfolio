-- HAGAV Studio - CRM operacional no painel /admin
-- Ajustes comerciais para leads, orcamentos e configuracoes de regras.

alter table if exists public.leads
  add column if not exists servico text not null default '',
  add column if not exists quantidade text not null default '',
  add column if not exists material_gravado text not null default '',
  add column if not exists tempo_bruto text not null default '',
  add column if not exists prazo text not null default '',
  add column if not exists referencia text not null default '',
  add column if not exists resumo_orcamento text not null default '',
  add column if not exists resumo_comercial text not null default '',
  add column if not exists score_lead integer not null default 0,
  add column if not exists urgencia text not null default 'media',
  add column if not exists prioridade text not null default 'media',
  add column if not exists temperatura text not null default 'Morno',
  add column if not exists proxima_acao text not null default '',
  add column if not exists ultimo_contato_em timestamptz,
  add column if not exists proximo_followup_em timestamptz,
  add column if not exists valor_estimado numeric(12,2) not null default 0,
  add column if not exists margem_estimada numeric(6,2) not null default 0;

alter table if exists public.orcamentos
  add column if not exists score_lead integer not null default 0,
  add column if not exists urgencia text not null default 'media',
  add column if not exists prioridade text not null default 'media',
  add column if not exists temperatura text not null default 'Morno',
  add column if not exists proxima_acao text not null default '',
  add column if not exists ultimo_contato_em timestamptz,
  add column if not exists proximo_followup_em timestamptz,
  add column if not exists valor_estimado numeric(12,2) not null default 0,
  add column if not exists margem_estimada numeric(6,2) not null default 0,
  add column if not exists resumo_comercial text not null default '';

create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

create or replace function public.touch_configuracoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_configuracoes_touch_updated_at on public.configuracoes;
create trigger trg_configuracoes_touch_updated_at
before update on public.configuracoes
for each row
execute function public.touch_configuracoes_updated_at();

create index if not exists idx_leads_score on public.leads (score_lead desc);
create index if not exists idx_leads_urgencia on public.leads (urgencia);
create index if not exists idx_leads_prioridade on public.leads (prioridade);
create index if not exists idx_leads_followup on public.leads (proximo_followup_em);
create index if not exists idx_leads_valor_estimado on public.leads (valor_estimado desc);

create index if not exists idx_orcamentos_score on public.orcamentos (score_lead desc);
create index if not exists idx_orcamentos_urgencia on public.orcamentos (urgencia);
create index if not exists idx_orcamentos_prioridade on public.orcamentos (prioridade);
create index if not exists idx_orcamentos_followup on public.orcamentos (proximo_followup_em);
create index if not exists idx_orcamentos_valor_estimado on public.orcamentos (valor_estimado desc);

alter table public.configuracoes enable row level security;

drop policy if exists configuracoes_admin_select on public.configuracoes;
create policy configuracoes_admin_select
on public.configuracoes
for select
to authenticated
using (true);

drop policy if exists configuracoes_admin_insert on public.configuracoes;
create policy configuracoes_admin_insert
on public.configuracoes
for insert
to authenticated
with check (true);

drop policy if exists configuracoes_admin_update on public.configuracoes;
create policy configuracoes_admin_update
on public.configuracoes
for update
to authenticated
using (true)
with check (true);

insert into public.configuracoes (chave, valor)
values
  ('score_weights', '{"urgenciaAlta":18,"fluxoRecorrente":20,"referenciaVisual":8,"materialGravado":10,"servicoAltoValor":12}'::jsonb),
  ('pricing_rules', '{"urgencia24h":1.2,"urgenciaSemana":1.08,"materialNaoGravado":1.35,"recorrencia40Plus":0.88}'::jsonb),
  ('pipeline_status', '["novo","chamado","proposta enviada","fechado","perdido"]'::jsonb)
on conflict (chave) do nothing;

-- Constraints de dominio comercial

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_urgencia_check'
  ) then
    alter table public.leads
      add constraint leads_urgencia_check
      check (urgencia in ('alta', 'media', 'baixa'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_prioridade_check'
  ) then
    alter table public.leads
      add constraint leads_prioridade_check
      check (prioridade in ('alta', 'media', 'baixa'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orcamentos_urgencia_check'
  ) then
    alter table public.orcamentos
      add constraint orcamentos_urgencia_check
      check (urgencia in ('alta', 'media', 'baixa'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orcamentos_prioridade_check'
  ) then
    alter table public.orcamentos
      add constraint orcamentos_prioridade_check
      check (prioridade in ('alta', 'media', 'baixa'));
  end if;
end $$;

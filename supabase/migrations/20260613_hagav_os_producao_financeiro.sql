-- HAGAV OS - producao e financeiro operacional.
-- Aprovacao comercial cria uma demanda e uma conta a receber, sem duplicidade.

create schema if not exists hagav_private;
revoke all on schema hagav_private from public, anon, authenticated;

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  status text not null default 'aguardando_materiais' check (
    status in (
      'aguardando_materiais',
      'pronto_preparar',
      'em_edicao',
      'revisao_interna',
      'revisao_cliente',
      'ajustes',
      'aprovado',
      'renderizando',
      'pronto_entrega',
      'entregue',
      'arquivado',
      'bloqueado'
    )
  ),
  titulo text not null,
  cliente_nome text not null,
  servico text,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  materiais_status text not null default 'pendente' check (
    materiais_status in ('pendente', 'parcial', 'completo')
  ),
  responsavel text,
  proxima_acao text,
  prazo_em timestamptz,
  horas_estimadas numeric(8,2) not null default 0,
  horas_realizadas numeric(8,2) not null default 0,
  upload_token uuid not null default gen_random_uuid() unique,
  pasta_local text,
  pasta_entrega text,
  observacoes text,
  motivo_bloqueio text,
  entregue_em timestamptz,
  arquivado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_jobs_status
  on public.production_jobs(status);
create index if not exists idx_production_jobs_prazo
  on public.production_jobs(prazo_em);
create index if not exists idx_production_jobs_responsavel
  on public.production_jobs(responsavel);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  production_job_id uuid references public.production_jobs(id) on delete set null,
  origin_key text unique,
  tipo text not null check (tipo in ('receber', 'pagar')),
  categoria text not null default 'projeto',
  descricao text not null,
  cliente_fornecedor text,
  valor numeric(12,2) not null check (valor >= 0),
  valor_pago numeric(12,2) not null default 0 check (valor_pago >= 0),
  status text not null default 'pendente' check (
    status in ('pendente', 'parcial', 'pago', 'atrasado', 'cancelado')
  ),
  vencimento date,
  pago_em timestamptz,
  forma_pagamento text,
  parcela_numero integer not null default 1 check (parcela_numero > 0),
  parcelas_total integer not null default 1 check (parcelas_total > 0),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_entries_status
  on public.financial_entries(status);
create index if not exists idx_financial_entries_vencimento
  on public.financial_entries(vencimento);
create index if not exists idx_financial_entries_deal
  on public.financial_entries(deal_id);

alter table public.production_jobs enable row level security;
alter table public.financial_entries enable row level security;

grant select, insert, update, delete on public.production_jobs to authenticated;
grant select, insert, update, delete on public.financial_entries to authenticated;
grant all on public.production_jobs to service_role;
grant all on public.financial_entries to service_role;

drop policy if exists production_jobs_admin_select on public.production_jobs;
create policy production_jobs_admin_select
on public.production_jobs
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao', 'viewer']));

drop policy if exists production_jobs_admin_insert on public.production_jobs;
create policy production_jobs_admin_insert
on public.production_jobs
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial', 'operacao']));

drop policy if exists production_jobs_admin_update on public.production_jobs;
create policy production_jobs_admin_update
on public.production_jobs
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial', 'operacao']))
with check (public.hagav_has_role(array['admin', 'comercial', 'operacao']));

drop policy if exists production_jobs_admin_delete on public.production_jobs;
create policy production_jobs_admin_delete
on public.production_jobs
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop policy if exists financial_entries_admin_select on public.financial_entries;
create policy financial_entries_admin_select
on public.financial_entries
for select
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists financial_entries_admin_insert on public.financial_entries;
create policy financial_entries_admin_insert
on public.financial_entries
for insert
to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists financial_entries_admin_update on public.financial_entries;
create policy financial_entries_admin_update
on public.financial_entries
for update
to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists financial_entries_admin_delete on public.financial_entries;
create policy financial_entries_admin_delete
on public.financial_entries
for delete
to authenticated
using (public.hagav_has_role(array['admin']));

drop trigger if exists production_jobs_set_updated_at on public.production_jobs;
create trigger production_jobs_set_updated_at
before update on public.production_jobs
for each row execute function public.hagav_set_updated_at();

drop trigger if exists financial_entries_set_updated_at on public.financial_entries;
create trigger financial_entries_set_updated_at
before update on public.financial_entries
for each row execute function public.hagav_set_updated_at();

create or replace function hagav_private.sync_approved_deal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_id uuid;
  deal_value numeric(12,2);
begin
  if new.status not in ('aprovado', 'fechado') then
    return new;
  end if;

  deal_value := greatest(
    coalesce(new.valor_fechado, new.preco_final, new.valor_sugerido, new.valor_estimado, 0),
    0
  );

  insert into public.production_jobs (
    deal_id,
    titulo,
    cliente_nome,
    servico,
    prioridade,
    responsavel,
    proxima_acao,
    prazo_em
  )
  values (
    new.id,
    coalesce(nullif(new.servico, ''), 'Projeto HAGAV') || ' - ' || new.nome,
    new.nome,
    new.servico,
    case when new.prioridade in ('baixa', 'media', 'alta') then new.prioridade else 'media' end,
    new.responsavel,
    coalesce(nullif(new.proxima_acao, ''), 'Confirmar materiais e preparar projeto'),
    new.proximo_followup_em
  )
  on conflict (deal_id) do update
  set
    cliente_nome = excluded.cliente_nome,
    servico = excluded.servico,
    titulo = excluded.titulo
  returning id into job_id;

  insert into public.financial_entries (
    deal_id,
    production_job_id,
    origin_key,
    tipo,
    categoria,
    descricao,
    cliente_fornecedor,
    valor,
    status,
    vencimento
  )
  values (
    new.id,
    job_id,
    'deal:' || new.id::text || ':receber',
    'receber',
    'projeto',
    'Projeto aprovado - ' || new.nome,
    new.nome,
    deal_value,
    'pendente',
    current_date + 7
  )
  on conflict (origin_key) do update
  set
    production_job_id = excluded.production_job_id,
    cliente_fornecedor = excluded.cliente_fornecedor,
    descricao = excluded.descricao,
    valor = case
      when public.financial_entries.status in ('pago', 'cancelado')
        then public.financial_entries.valor
      else excluded.valor
    end;

  return new;
end;
$$;

revoke all on function hagav_private.sync_approved_deal() from public, anon, authenticated;

drop trigger if exists deals_sync_hagav_os on public.deals;
create trigger deals_sync_hagav_os
after insert or update of status, nome, servico, preco_final, valor_fechado, valor_sugerido
on public.deals
for each row
execute function hagav_private.sync_approved_deal();

insert into public.production_jobs (
  deal_id,
  titulo,
  cliente_nome,
  servico,
  prioridade,
  responsavel,
  proxima_acao,
  prazo_em
)
select
  d.id,
  coalesce(nullif(d.servico, ''), 'Projeto HAGAV') || ' - ' || d.nome,
  d.nome,
  d.servico,
  case when d.prioridade in ('baixa', 'media', 'alta') then d.prioridade else 'media' end,
  d.responsavel,
  coalesce(nullif(d.proxima_acao, ''), 'Confirmar materiais e preparar projeto'),
  d.proximo_followup_em
from public.deals d
where d.status in ('aprovado', 'fechado')
on conflict (deal_id) do nothing;

insert into public.financial_entries (
  deal_id,
  production_job_id,
  origin_key,
  tipo,
  categoria,
  descricao,
  cliente_fornecedor,
  valor,
  status,
  vencimento
)
select
  d.id,
  p.id,
  'deal:' || d.id::text || ':receber',
  'receber',
  'projeto',
  'Projeto aprovado - ' || d.nome,
  d.nome,
  greatest(coalesce(d.valor_fechado, d.preco_final, d.valor_sugerido, d.valor_estimado, 0), 0),
  'pendente',
  current_date + 7
from public.deals d
join public.production_jobs p on p.deal_id = d.id
where d.status in ('aprovado', 'fechado')
on conflict (origin_key) do nothing;

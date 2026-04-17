-- HAGAV Studio - ajuste incremental para rastreamento comercial
-- Execute este SQL se voce ja criou as tabelas com a versao anterior.

alter table if exists public.leads
  add column if not exists fluxo text not null default 'WhatsApp',
  add column if not exists pagina text not null default '',
  add column if not exists origem text not null default '',
  add column if not exists status text not null default 'novo',
  add column if not exists observacoes text not null default '',
  alter column nome set default '',
  alter column whatsapp set default '';

alter table if exists public.orcamentos
  add column if not exists fluxo text not null default '',
  add column if not exists pagina text not null default 'orcamento',
  add column if not exists origem text not null default 'hagav.com.br',
  add column if not exists status text not null default 'novo',
  add column if not exists quantidade text not null default '',
  add column if not exists material_gravado text not null default '',
  add column if not exists tempo_bruto text not null default '',
  add column if not exists prazo text not null default '',
  add column if not exists referencia text not null default '',
  add column if not exists observacoes text not null default '',
  add column if not exists detalhes text not null default '',
  alter column nome set default '',
  alter column whatsapp set default '',
  alter column servico set default '';

alter table if exists public.contatos
  add column if not exists fluxo text not null default 'Contato',
  add column if not exists pagina text not null default '',
  add column if not exists origem text not null default '',
  add column if not exists status text not null default 'novo',
  alter column nome set default '',
  alter column whatsapp set default '';

create index if not exists idx_leads_fluxo on public.leads (fluxo);
create index if not exists idx_leads_origem on public.leads (origem);
create index if not exists idx_leads_status on public.leads (status);

create index if not exists idx_orcamentos_fluxo on public.orcamentos (fluxo);
create index if not exists idx_orcamentos_origem on public.orcamentos (origem);
create index if not exists idx_orcamentos_status on public.orcamentos (status);
create index if not exists idx_orcamentos_whatsapp on public.orcamentos (whatsapp);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_status_check'
  ) then
    alter table public.leads
      add constraint leads_status_check
      check (status in ('novo', 'chamado', 'proposta enviada', 'fechado', 'perdido'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orcamentos_status_check'
  ) then
    alter table public.orcamentos
      add constraint orcamentos_status_check
      check (status in ('novo', 'chamado', 'proposta enviada', 'fechado', 'perdido'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contatos_status_check'
  ) then
    alter table public.contatos
      add constraint contatos_status_check
      check (status in ('novo', 'chamado', 'proposta enviada', 'fechado', 'perdido'));
  end if;
end $$;

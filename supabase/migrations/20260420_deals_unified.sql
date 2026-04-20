-- HAGAV Studio - consolidacao de leads + orcamentos em deals
-- Estrategia: criar tabela unificada + preservar retrocompatibilidade via views leads/orcamentos.

create extension if not exists pgcrypto;

create or replace function public.hagav_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.hagav_safe_jsonb(input_text text)
returns jsonb
language plpgsql
as $$
begin
  if input_text is null or btrim(input_text) = '' then
    return null;
  end if;

  return input_text::jsonb;
exception
  when others then
    return jsonb_build_object('raw', left(input_text, 12000));
end;
$$;

create or replace function public.hagav_safe_timestamptz(input_text text)
returns timestamptz
language plpgsql
as $$
begin
  if input_text is null or btrim(input_text) = '' then
    return null;
  end if;

  return input_text::timestamptz;
exception
  when others then
    return null;
end;
$$;

create or replace function public.hagav_safe_integer(input_text text)
returns integer
language plpgsql
as $$
declare
  digits text;
begin
  if input_text is null or btrim(input_text) = '' then
    return null;
  end if;

  digits := substring(input_text from '(\d+)');
  if digits is null or digits = '' then
    return null;
  end if;

  return digits::integer;
exception
  when others then
    return null;
end;
$$;

create or replace function public.hagav_safe_numeric(input_text text)
returns numeric
language plpgsql
as $$
begin
  if input_text is null or btrim(input_text) = '' then
    return null;
  end if;

  return input_text::numeric;
exception
  when others then
    return null;
end;
$$;

create or replace function public.hagav_safe_boolean(input_text text)
returns boolean
language plpgsql
as $$
declare
  normalized text;
begin
  if input_text is null or btrim(input_text) = '' then
    return null;
  end if;

  normalized := lower(
    translate(
      input_text,
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  );
  normalized := regexp_replace(normalized, '[^a-z0-9]+', '_', 'g');

  if normalized in ('sim', 'true', '1', 'yes', 'y') then
    return true;
  end if;

  if normalized in ('nao', 'false', '0', 'no', 'n') then
    return false;
  end if;

  return null;
end;
$$;

create or replace function public.hagav_normalize_key(input_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      lower(
        translate(
          coalesce(input_text, ''),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
        )
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    ),
    '^_+|_+$',
    '',
    'g'
  );
$$;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  status text not null default 'novo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  fluxo text,
  pagina text,
  origem text,

  nome text not null,
  whatsapp text not null,
  observacoes text,

  servico text,
  quantidade integer,
  material_gravado boolean,
  tempo_bruto text,
  prazo text,
  referencia boolean,
  multicamera boolean not null default false,

  resumo_orcamento text,
  resumo_comercial text,
  detalhes jsonb,

  score_lead integer,
  urgencia text,
  prioridade text,
  temperatura text,

  complexidade_nivel text,
  multiplicador_complexidade numeric,
  multiplicador_urgencia numeric,
  desconto_volume_percent numeric,
  ajuste_referencia_percent numeric,
  ajuste_multicamera_percent numeric,
  preco_base numeric(10,2),
  valor_sugerido numeric(10,2),
  preco_final numeric(10,2),
  valor_estimado numeric(10,2),
  margem_estimada numeric(5,2),
  faixa_sugerida text,
  motivo_calculo text,
  pacote_sugerido text,

  revisao_manual boolean not null default false,
  alerta_capacidade boolean not null default false,
  operacao_especial boolean not null default false,

  link_pdf text,
  proposta_gerada_em timestamptz,
  validade_ate date,

  fechado_em timestamptz,
  valor_fechado numeric(10,2),
  motivo_perda text,

  proxima_acao text,
  responsavel text,
  ultimo_contato_em timestamptz,
  proximo_followup_em timestamptz,
  observacoes_internas text
);

create index if not exists idx_deals_status on public.deals (status);
create index if not exists idx_deals_whatsapp on public.deals (whatsapp);
create index if not exists idx_deals_created_at on public.deals (created_at desc);
create unique index if not exists idx_deals_codigo on public.deals (codigo) where codigo is not null;
create index if not exists idx_deals_proximo_followup_em on public.deals (proximo_followup_em);

alter table public.deals enable row level security;

drop policy if exists deals_public_insert on public.deals;
create policy deals_public_insert
on public.deals
for insert
to anon, authenticated
with check (true);

drop policy if exists deals_admin_select on public.deals;
create policy deals_admin_select
on public.deals
for select
to authenticated
using (true);

drop policy if exists deals_admin_insert on public.deals;
create policy deals_admin_insert
on public.deals
for insert
to authenticated
with check (true);

drop policy if exists deals_admin_update on public.deals;
create policy deals_admin_update
on public.deals
for update
to authenticated
using (true)
with check (true);

drop policy if exists deals_admin_delete on public.deals;
create policy deals_admin_delete
on public.deals
for delete
to authenticated
using (true);

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
before update on public.deals
for each row
execute function public.hagav_set_updated_at();

-- Migracao de dados: executa apenas enquanto leads/orcamentos ainda forem tabelas base.
do $$
declare
  has_leads_table boolean;
  has_orcamentos_table boolean;
begin
  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
      and c.relkind = 'r'
  ) into has_leads_table;

  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'orcamentos'
      and c.relkind = 'r'
  ) into has_orcamentos_table;

  if has_orcamentos_table then
    insert into public.deals (
      created_at,
      fluxo,
      pagina,
      origem,
      nome,
      whatsapp,
      observacoes,
      servico,
      quantidade,
      material_gravado,
      tempo_bruto,
      prazo,
      referencia,
      resumo_orcamento,
      resumo_comercial,
      detalhes,
      preco_base,
      preco_final,
      valor_estimado,
      valor_sugerido,
      margem_estimada,
      faixa_sugerida,
      motivo_calculo,
      revisao_manual,
      alerta_capacidade,
      operacao_especial,
      complexidade_nivel,
      multiplicador_complexidade,
      multiplicador_urgencia,
      desconto_volume_percent,
      ajuste_referencia_percent,
      ajuste_multicamera_percent,
      pacote_sugerido,
      score_lead,
      urgencia,
      prioridade,
      temperatura,
      proxima_acao,
      responsavel,
      ultimo_contato_em,
      proximo_followup_em,
      observacoes_internas,
      link_pdf,
      status
    )
    select
      coalesce(public.hagav_safe_timestamptz(o.payload ->> 'created_at'), now()),
      nullif(o.payload ->> 'fluxo', ''),
      nullif(o.payload ->> 'pagina', ''),
      nullif(o.payload ->> 'origem', ''),
      coalesce(o.payload ->> 'nome', ''),
      coalesce(o.payload ->> 'whatsapp', ''),
      nullif(o.payload ->> 'observacoes', ''),
      nullif(o.payload ->> 'servico', ''),
      public.hagav_safe_integer(o.payload ->> 'quantidade'),
      public.hagav_safe_boolean(o.payload ->> 'material_gravado'),
      nullif(o.payload ->> 'tempo_bruto', ''),
      nullif(o.payload ->> 'prazo', ''),
      public.hagav_safe_boolean(o.payload ->> 'referencia'),
      nullif(o.payload ->> 'resumo_orcamento', ''),
      nullif(o.payload ->> 'resumo_comercial', ''),
      public.hagav_safe_jsonb(o.payload ->> 'detalhes'),
      public.hagav_safe_numeric(o.payload ->> 'preco_base'),
      public.hagav_safe_numeric(o.payload ->> 'preco_final'),
      public.hagav_safe_numeric(o.payload ->> 'valor_estimado'),
      public.hagav_safe_numeric(o.payload ->> 'valor_sugerido'),
      public.hagav_safe_numeric(o.payload ->> 'margem_estimada'),
      nullif(o.payload ->> 'faixa_sugerida', ''),
      nullif(o.payload ->> 'motivo_calculo', ''),
      coalesce(public.hagav_safe_boolean(o.payload ->> 'revisao_manual'), false),
      coalesce(public.hagav_safe_boolean(o.payload ->> 'alerta_capacidade'), false),
      coalesce(public.hagav_safe_boolean(o.payload ->> 'operacao_especial'), false),
      lower(coalesce(nullif(o.payload ->> 'complexidade_nivel', ''), 'n2')),
      public.hagav_safe_numeric(o.payload ->> 'multiplicador_complexidade'),
      public.hagav_safe_numeric(o.payload ->> 'multiplicador_urgencia'),
      public.hagav_safe_numeric(o.payload ->> 'desconto_volume_percent'),
      public.hagav_safe_numeric(o.payload ->> 'ajuste_referencia_percent'),
      public.hagav_safe_numeric(o.payload ->> 'ajuste_multicamera_percent'),
      nullif(o.payload ->> 'pacote_sugerido', ''),
      public.hagav_safe_integer(o.payload ->> 'score_lead'),
      lower(coalesce(nullif(o.payload ->> 'urgencia', ''), 'media')),
      lower(coalesce(nullif(o.payload ->> 'prioridade', ''), 'media')),
      coalesce(nullif(o.payload ->> 'temperatura', ''), 'Morno'),
      nullif(o.payload ->> 'proxima_acao', ''),
      nullif(o.payload ->> 'responsavel', ''),
      public.hagav_safe_timestamptz(o.payload ->> 'ultimo_contato_em'),
      public.hagav_safe_timestamptz(o.payload ->> 'proximo_followup_em'),
      nullif(o.payload ->> 'observacoes_internas', ''),
      nullif(o.payload ->> 'link_pdf', ''),
      case
        when public.hagav_normalize_key(o.payload ->> 'status_orcamento') in ('pendente_revisao', 'em_revisao', 'orcamento') then 'orcamento'
        when public.hagav_normalize_key(o.payload ->> 'status_orcamento') in ('enviado', 'proposta_enviada') then 'proposta_enviada'
        when public.hagav_normalize_key(o.payload ->> 'status_orcamento') in ('aprovado', 'ganho', 'fechado') then 'fechado'
        when public.hagav_normalize_key(o.payload ->> 'status_orcamento') in ('arquivado', 'cancelado', 'perdido') then 'perdido'
        when public.hagav_normalize_key(o.payload ->> 'status') in ('fechado', 'aprovado', 'ganho') then 'fechado'
        when public.hagav_normalize_key(o.payload ->> 'status') in ('perdido', 'arquivado', 'cancelado') then 'perdido'
        else 'orcamento'
      end
    from (
      select distinct on (
        coalesce(
          nullif(trim(payload ->> 'whatsapp'), ''),
          '__id_' || coalesce(payload ->> 'id', md5(payload::text))
        )
      )
        payload
      from (
        select to_jsonb(src) as payload
        from public.orcamentos src
      ) raw
      order by
        coalesce(
          nullif(trim(payload ->> 'whatsapp'), ''),
          '__id_' || coalesce(payload ->> 'id', md5(payload::text))
        ),
        public.hagav_safe_timestamptz(payload ->> 'created_at') desc nulls last,
        coalesce(payload ->> 'id', '') desc
    ) o
    where not exists (
      select 1
      from public.deals d
      where nullif(trim(d.whatsapp), '') is not null
        and nullif(trim(o.payload ->> 'whatsapp'), '') is not null
        and d.whatsapp = (o.payload ->> 'whatsapp')
    );
  end if;

  if has_leads_table then
    if has_orcamentos_table then
      insert into public.deals (
        created_at,
        fluxo,
        pagina,
        origem,
        nome,
        whatsapp,
        observacoes,
        servico,
        quantidade,
        material_gravado,
        tempo_bruto,
        prazo,
        referencia,
        resumo_orcamento,
        resumo_comercial,
        score_lead,
        urgencia,
        prioridade,
        temperatura,
        proxima_acao,
        responsavel,
        ultimo_contato_em,
        proximo_followup_em,
        valor_estimado,
        margem_estimada,
        status
      )
      select
        coalesce(public.hagav_safe_timestamptz(l.payload ->> 'created_at'), now()),
        nullif(l.payload ->> 'fluxo', ''),
        nullif(l.payload ->> 'pagina', ''),
        nullif(l.payload ->> 'origem', ''),
        coalesce(l.payload ->> 'nome', ''),
        coalesce(l.payload ->> 'whatsapp', ''),
        nullif(l.payload ->> 'observacoes', ''),
        nullif(l.payload ->> 'servico', ''),
        public.hagav_safe_integer(l.payload ->> 'quantidade'),
        public.hagav_safe_boolean(l.payload ->> 'material_gravado'),
        nullif(l.payload ->> 'tempo_bruto', ''),
        nullif(l.payload ->> 'prazo', ''),
        public.hagav_safe_boolean(l.payload ->> 'referencia'),
        nullif(l.payload ->> 'resumo_orcamento', ''),
        nullif(l.payload ->> 'resumo_comercial', ''),
        public.hagav_safe_integer(l.payload ->> 'score_lead'),
        lower(coalesce(nullif(l.payload ->> 'urgencia', ''), 'media')),
        lower(coalesce(nullif(l.payload ->> 'prioridade', ''), 'media')),
        coalesce(nullif(l.payload ->> 'temperatura', ''), 'Morno'),
        nullif(l.payload ->> 'proxima_acao', ''),
        nullif(l.payload ->> 'responsavel', ''),
        public.hagav_safe_timestamptz(l.payload ->> 'ultimo_contato_em'),
        public.hagav_safe_timestamptz(l.payload ->> 'proximo_followup_em'),
        public.hagav_safe_numeric(l.payload ->> 'valor_estimado'),
        public.hagav_safe_numeric(l.payload ->> 'margem_estimada'),
        case
          when public.hagav_normalize_key(l.payload ->> 'status') in ('novo') then 'novo'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('chamado', 'contatado', 'em_contato', 'qualificado') then 'qualificado'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('proposta_enviada', 'proposta', 'orcamento') then 'proposta_enviada'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('fechado', 'aprovado', 'ganho') then 'fechado'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('perdido', 'arquivado', 'cancelado') then 'perdido'
          else 'novo'
        end
      from (
        select distinct on (
          coalesce(
            nullif(trim(payload ->> 'whatsapp'), ''),
            '__id_' || coalesce(payload ->> 'id', md5(payload::text))
          )
        )
          payload
        from (
          select to_jsonb(src) as payload
          from public.leads src
        ) raw
        order by
          coalesce(
            nullif(trim(payload ->> 'whatsapp'), ''),
            '__id_' || coalesce(payload ->> 'id', md5(payload::text))
          ),
          public.hagav_safe_timestamptz(payload ->> 'created_at') desc nulls last,
          coalesce(payload ->> 'id', '') desc
      ) l
      where not exists (
        select 1
        from public.orcamentos o
        where nullif(trim(to_jsonb(o) ->> 'whatsapp'), '') is not null
          and nullif(trim(l.payload ->> 'whatsapp'), '') is not null
          and (to_jsonb(o) ->> 'whatsapp') = (l.payload ->> 'whatsapp')
      )
        and not exists (
          select 1
          from public.deals d
          where nullif(trim(d.whatsapp), '') is not null
            and nullif(trim(l.payload ->> 'whatsapp'), '') is not null
            and d.whatsapp = (l.payload ->> 'whatsapp')
        );
    else
      insert into public.deals (
        created_at,
        fluxo,
        pagina,
        origem,
        nome,
        whatsapp,
        observacoes,
        servico,
        quantidade,
        material_gravado,
        tempo_bruto,
        prazo,
        referencia,
        resumo_orcamento,
        resumo_comercial,
        score_lead,
        urgencia,
        prioridade,
        temperatura,
        proxima_acao,
        responsavel,
        ultimo_contato_em,
        proximo_followup_em,
        valor_estimado,
        margem_estimada,
        status
      )
      select
        coalesce(public.hagav_safe_timestamptz(l.payload ->> 'created_at'), now()),
        nullif(l.payload ->> 'fluxo', ''),
        nullif(l.payload ->> 'pagina', ''),
        nullif(l.payload ->> 'origem', ''),
        coalesce(l.payload ->> 'nome', ''),
        coalesce(l.payload ->> 'whatsapp', ''),
        nullif(l.payload ->> 'observacoes', ''),
        nullif(l.payload ->> 'servico', ''),
        public.hagav_safe_integer(l.payload ->> 'quantidade'),
        public.hagav_safe_boolean(l.payload ->> 'material_gravado'),
        nullif(l.payload ->> 'tempo_bruto', ''),
        nullif(l.payload ->> 'prazo', ''),
        public.hagav_safe_boolean(l.payload ->> 'referencia'),
        nullif(l.payload ->> 'resumo_orcamento', ''),
        nullif(l.payload ->> 'resumo_comercial', ''),
        public.hagav_safe_integer(l.payload ->> 'score_lead'),
        lower(coalesce(nullif(l.payload ->> 'urgencia', ''), 'media')),
        lower(coalesce(nullif(l.payload ->> 'prioridade', ''), 'media')),
        coalesce(nullif(l.payload ->> 'temperatura', ''), 'Morno'),
        nullif(l.payload ->> 'proxima_acao', ''),
        nullif(l.payload ->> 'responsavel', ''),
        public.hagav_safe_timestamptz(l.payload ->> 'ultimo_contato_em'),
        public.hagav_safe_timestamptz(l.payload ->> 'proximo_followup_em'),
        public.hagav_safe_numeric(l.payload ->> 'valor_estimado'),
        public.hagav_safe_numeric(l.payload ->> 'margem_estimada'),
        case
          when public.hagav_normalize_key(l.payload ->> 'status') in ('novo') then 'novo'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('chamado', 'contatado', 'em_contato', 'qualificado') then 'qualificado'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('proposta_enviada', 'proposta', 'orcamento') then 'proposta_enviada'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('fechado', 'aprovado', 'ganho') then 'fechado'
          when public.hagav_normalize_key(l.payload ->> 'status') in ('perdido', 'arquivado', 'cancelado') then 'perdido'
          else 'novo'
        end
      from (
        select distinct on (
          coalesce(
            nullif(trim(payload ->> 'whatsapp'), ''),
            '__id_' || coalesce(payload ->> 'id', md5(payload::text))
          )
        )
          payload
        from (
          select to_jsonb(src) as payload
          from public.leads src
        ) raw
        order by
          coalesce(
            nullif(trim(payload ->> 'whatsapp'), ''),
            '__id_' || coalesce(payload ->> 'id', md5(payload::text))
          ),
          public.hagav_safe_timestamptz(payload ->> 'created_at') desc nulls last,
          coalesce(payload ->> 'id', '') desc
      ) l
      where not exists (
        select 1
        from public.deals d
        where nullif(trim(d.whatsapp), '') is not null
          and nullif(trim(l.payload ->> 'whatsapp'), '') is not null
          and d.whatsapp = (l.payload ->> 'whatsapp')
      );
    end if;
  end if;
end;
$$;

-- Preserva tabelas antigas para auditoria e fallback.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
      and c.relkind = 'r'
  ) then
    alter table public.leads rename to leads_legacy;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'orcamentos'
      and c.relkind = 'r'
  ) then
    alter table public.orcamentos rename to orcamentos_legacy;
  end if;
end;
$$;

drop view if exists public.leads;
drop view if exists public.orcamentos;

create or replace view public.leads as
select
  d.id,
  d.created_at,
  coalesce(d.fluxo, 'WhatsApp') as fluxo,
  coalesce(d.pagina, '') as pagina,
  coalesce(d.origem, '') as origem,
  case d.status
    when 'novo' then 'novo'
    when 'qualificado' then 'chamado'
    when 'orcamento' then 'proposta enviada'
    when 'proposta_enviada' then 'proposta enviada'
    when 'fechado' then 'fechado'
    when 'perdido' then 'perdido'
    else 'novo'
  end as status,
  coalesce(d.nome, '') as nome,
  coalesce(d.whatsapp, '') as whatsapp,
  coalesce(d.observacoes, '') as observacoes,
  coalesce(d.servico, '') as servico,
  coalesce(d.quantidade::text, '') as quantidade,
  case
    when d.material_gravado is true then 'Sim'
    when d.material_gravado is false then 'Nao'
    else ''
  end as material_gravado,
  coalesce(d.tempo_bruto, '') as tempo_bruto,
  coalesce(d.prazo, '') as prazo,
  case
    when d.referencia is true then 'Sim'
    when d.referencia is false then 'Nao'
    else ''
  end as referencia,
  coalesce(d.resumo_orcamento, '') as resumo_orcamento,
  coalesce(d.resumo_comercial, '') as resumo_comercial,
  coalesce(d.score_lead, 0) as score_lead,
  coalesce(d.urgencia, 'media') as urgencia,
  coalesce(d.prioridade, 'media') as prioridade,
  coalesce(d.temperatura, 'Morno') as temperatura,
  coalesce(d.proxima_acao, '') as proxima_acao,
  coalesce(d.responsavel, '') as responsavel,
  d.ultimo_contato_em,
  d.proximo_followup_em,
  coalesce(d.valor_estimado, 0)::numeric(12,2) as valor_estimado,
  coalesce(d.margem_estimada, 0)::numeric(6,2) as margem_estimada
from public.deals d
where d.status in ('novo', 'qualificado');

create or replace view public.orcamentos as
select
  d.id,
  d.created_at,
  coalesce(d.fluxo, '') as fluxo,
  coalesce(d.pagina, 'orcamento') as pagina,
  coalesce(d.origem, 'hagav.com.br') as origem,
  case d.status
    when 'novo' then 'novo'
    when 'qualificado' then 'chamado'
    when 'orcamento' then 'proposta enviada'
    when 'proposta_enviada' then 'proposta enviada'
    when 'fechado' then 'fechado'
    when 'perdido' then 'perdido'
    else 'novo'
  end as status,
  coalesce(d.nome, '') as nome,
  coalesce(d.whatsapp, '') as whatsapp,
  coalesce(d.servico, '') as servico,
  coalesce(d.resumo_orcamento, '') as resumo_orcamento,
  coalesce(d.preco_base, 0)::numeric(12,2) as preco_base,
  coalesce(d.preco_final, 0)::numeric(12,2) as preco_final,
  coalesce(d.pacote_sugerido, '') as pacote_sugerido,
  case d.status
    when 'orcamento' then 'em_revisao'
    when 'proposta_enviada' then 'enviado'
    when 'fechado' then 'aprovado'
    when 'perdido' then 'arquivado'
    else 'pendente_revisao'
  end as status_orcamento,
  coalesce(d.observacoes_internas, '') as observacoes_internas,
  coalesce(d.link_pdf, '') as link_pdf,
  coalesce(d.quantidade::text, '') as quantidade,
  case
    when d.material_gravado is true then 'Sim'
    when d.material_gravado is false then 'Nao'
    else ''
  end as material_gravado,
  coalesce(d.tempo_bruto, '') as tempo_bruto,
  coalesce(d.prazo, '') as prazo,
  case
    when d.referencia is true then 'Sim'
    when d.referencia is false then 'Nao'
    else ''
  end as referencia,
  coalesce(d.observacoes, '') as observacoes,
  coalesce(d.detalhes::text, '') as detalhes,
  coalesce(d.score_lead, 0) as score_lead,
  coalesce(d.urgencia, 'media') as urgencia,
  coalesce(d.prioridade, 'media') as prioridade,
  coalesce(d.temperatura, 'Morno') as temperatura,
  coalesce(d.proxima_acao, '') as proxima_acao,
  coalesce(d.responsavel, '') as responsavel,
  d.ultimo_contato_em,
  d.proximo_followup_em,
  coalesce(d.valor_estimado, 0)::numeric(12,2) as valor_estimado,
  coalesce(d.valor_sugerido, 0)::numeric(12,2) as valor_sugerido,
  coalesce(d.margem_estimada, 0)::numeric(6,2) as margem_estimada,
  coalesce(d.faixa_sugerida, '') as faixa_sugerida,
  coalesce(d.motivo_calculo, '') as motivo_calculo,
  coalesce(d.revisao_manual, false) as revisao_manual,
  coalesce(d.alerta_capacidade, false) as alerta_capacidade,
  coalesce(d.operacao_especial, false) as operacao_especial,
  coalesce(d.complexidade_nivel, 'n2') as complexidade_nivel,
  coalesce(d.multiplicador_complexidade, 1) as multiplicador_complexidade,
  coalesce(d.multiplicador_urgencia, 1) as multiplicador_urgencia,
  coalesce(d.desconto_volume_percent, 0) as desconto_volume_percent,
  coalesce(d.ajuste_referencia_percent, 0) as ajuste_referencia_percent,
  coalesce(d.ajuste_multicamera_percent, 0) as ajuste_multicamera_percent,
  coalesce(d.resumo_comercial, '') as resumo_comercial
from public.deals d
where d.status in ('orcamento', 'proposta_enviada', 'fechado', 'perdido');

grant select on public.leads to anon, authenticated, service_role;
grant select on public.orcamentos to anon, authenticated, service_role;

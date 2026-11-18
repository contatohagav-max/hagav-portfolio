-- HAGAV - Prospeccao automatica + base de automacoes.
-- Escopo:
--   prospects               -> topo de funil (encontrados pela automacao, antes de virar lead)
--   prospect_messages       -> mensagens enviadas e respostas recebidas
--   outreach_suppression    -> quem pediu para nao ser contatado (nunca mais recebe nada)
--   automation_runs         -> registro do que cada automacao fez (para acompanhar no painel)
--   admin_notifications     -> avisos para a equipe (ex.: "fulano quer conversar")
--   financial_entries       -> colunas para importacao de extrato/email do banco
-- Seguro para rodar mais de uma vez.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- prospects
-- ---------------------------------------------------------------------------
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- chave de deduplicacao: email, @instagram ou dominio normalizado
  dedupe_key text not null unique,

  status text not null default 'novo' check (status in (
    'novo',            -- encontrado e qualificado, ainda nao abordado
    'em_sequencia',    -- recebeu a primeira mensagem, follow-ups em andamento
    'respondeu',       -- respondeu, aguardando classificacao/resposta da automacao
    'quer_conversar',  -- demonstrou interesse: equipe assume
    'em_conversa',     -- equipe ja assumiu a conversa
    'convertido',      -- virou lead no CRM (deals)
    'nao_agora',       -- pediu para falar depois
    'sem_interesse',   -- respondeu que nao tem interesse
    'sem_resposta',    -- sequencia terminou sem resposta
    'descartado',      -- sem perfil ou contato invalido
    'descadastrado'    -- pediu para nao receber mais mensagens
  )),

  nome text not null,
  empresa text,
  perfil text,           -- expert, coprodutor, agencia, criador, empresa, outro
  nicho text,
  instagram text,
  seguidores integer,
  email text,
  whatsapp text,
  site text,

  fonte text,            -- meta_ads, hotmart, kiwify, eduzz, google, youtube, instagram, indicacao, outro
  fonte_url text,

  score integer not null default 0 check (score between 0 and 100),
  score_motivos text,
  momento text,          -- pre_lancamento, captacao, carrinho_aberto, perpetuo, sem_sinal
  sinais jsonb not null default '{}'::jsonb,
  resumo text,           -- por que e um bom cliente para a HAGAV

  canal text not null default 'email' check (canal in ('email', 'instagram', 'whatsapp', 'linkedin', 'outro')),
  tentativas integer not null default 0 check (tentativas >= 0),
  ultimo_contato_em timestamptz,
  proximo_contato_em timestamptz,
  respondeu_em timestamptz,
  ultima_resposta text,
  resumo_resposta text,

  deal_id uuid references public.deals(id) on delete set null,
  responsavel text,
  notas text
);

create index if not exists idx_prospects_status on public.prospects(status);
create index if not exists idx_prospects_score on public.prospects(score desc);
create index if not exists idx_prospects_proximo_contato on public.prospects(proximo_contato_em);
create index if not exists idx_prospects_created_at on public.prospects(created_at desc);
create index if not exists idx_prospects_email on public.prospects(lower(email));
create index if not exists idx_prospects_instagram on public.prospects(lower(instagram));

-- ---------------------------------------------------------------------------
-- prospect_messages
-- ---------------------------------------------------------------------------
create table if not exists public.prospect_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  canal text not null default 'email' check (canal in ('email', 'instagram', 'whatsapp', 'linkedin', 'outro')),
  direcao text not null check (direcao in ('saida', 'entrada')),
  etapa integer not null default 1 check (etapa >= 0), -- 1 = primeira abordagem, 2+ = follow-ups, 0 = resposta recebida

  assunto text,
  corpo text not null,

  status text not null default 'agendado' check (status in (
    'rascunho', 'agendado', 'enviando', 'enviado', 'falhou', 'cancelado', 'recebido'
  )),
  agendado_para timestamptz,
  enviado_em timestamptz,
  recebido_em timestamptz,

  provider_message_id text,
  thread_id text,

  classificacao text check (classificacao in (
    'interessado', 'duvida', 'nao_agora', 'sem_interesse', 'descadastro',
    'resposta_automatica', 'bounce', 'outro'
  )),
  resumo text,
  erro text
);

create index if not exists idx_prospect_messages_prospect on public.prospect_messages(prospect_id, created_at desc);
create index if not exists idx_prospect_messages_fila on public.prospect_messages(status, agendado_para);
create index if not exists idx_prospect_messages_thread on public.prospect_messages(thread_id);
create unique index if not exists idx_prospect_messages_provider_id
  on public.prospect_messages(provider_message_id)
  where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- outreach_suppression
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_suppression (
  valor text primary key, -- email, dominio ou @instagram normalizado (minusculo)
  motivo text not null default 'descadastro',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- automation_runs
-- ---------------------------------------------------------------------------
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,      -- prospeccao, envio, respostas, financeiro_import, resumo_diario
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'parcial', 'erro')),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  resumo text,
  metricas jsonb not null default '{}'::jsonb,
  erro text
);

create index if not exists idx_automation_runs_iniciado on public.automation_runs(iniciado_em desc);
create index if not exists idx_automation_runs_tipo on public.automation_runs(tipo, iniciado_em desc);

-- ---------------------------------------------------------------------------
-- admin_notifications
-- ---------------------------------------------------------------------------
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tipo text not null default 'info', -- quer_conversar, respondeu, resumo_diario, financeiro, erro, info
  titulo text not null,
  corpo text,
  link text,
  prospect_id uuid references public.prospects(id) on delete cascade,
  lida_em timestamptz
);

create index if not exists idx_admin_notifications_created on public.admin_notifications(created_at desc);
create index if not exists idx_admin_notifications_nao_lidas on public.admin_notifications(created_at desc) where lida_em is null;

-- ---------------------------------------------------------------------------
-- financial_entries: suporte a importacao de banco
-- (natureza Empresa/Pessoal continua no bloco [HAGAV_FINANCEIRO_META] das observacoes,
--  que e o que o painel ja le hoje)
-- ---------------------------------------------------------------------------
alter table public.financial_entries
  add column if not exists fonte text not null default 'manual',  -- manual, deal, c6_extrato, c6_email
  add column if not exists revisar boolean not null default false, -- importado com duvida: precisa de conferencia humana
  add column if not exists dados_banco jsonb;                      -- linha original do extrato/email

create index if not exists idx_financial_entries_revisar
  on public.financial_entries(revisar)
  where revisar = true;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists prospects_set_updated_at on public.prospects;
create trigger prospects_set_updated_at
before update on public.prospects
for each row execute function public.hagav_set_updated_at();

drop trigger if exists prospect_messages_set_updated_at on public.prospect_messages;
create trigger prospect_messages_set_updated_at
before update on public.prospect_messages
for each row execute function public.hagav_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: painel (admin/comercial) le e edita; automacao usa service_role pelo endpoint
-- ---------------------------------------------------------------------------
alter table public.prospects enable row level security;
alter table public.prospect_messages enable row level security;
alter table public.outreach_suppression enable row level security;
alter table public.automation_runs enable row level security;
alter table public.admin_notifications enable row level security;

grant select, insert, update, delete on public.prospects to authenticated;
grant select, insert, update, delete on public.prospect_messages to authenticated;
grant select, insert, update, delete on public.outreach_suppression to authenticated;
grant select on public.automation_runs to authenticated;
grant select, update on public.admin_notifications to authenticated;

grant all on public.prospects to service_role;
grant all on public.prospect_messages to service_role;
grant all on public.outreach_suppression to service_role;
grant all on public.automation_runs to service_role;
grant all on public.admin_notifications to service_role;

-- prospects
drop policy if exists prospects_admin_select on public.prospects;
create policy prospects_admin_select on public.prospects
for select to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists prospects_admin_insert on public.prospects;
create policy prospects_admin_insert on public.prospects
for insert to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists prospects_admin_update on public.prospects;
create policy prospects_admin_update on public.prospects
for update to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists prospects_admin_delete on public.prospects;
create policy prospects_admin_delete on public.prospects
for delete to authenticated
using (public.hagav_has_role(array['admin']));

-- prospect_messages
drop policy if exists prospect_messages_admin_select on public.prospect_messages;
create policy prospect_messages_admin_select on public.prospect_messages
for select to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists prospect_messages_admin_insert on public.prospect_messages;
create policy prospect_messages_admin_insert on public.prospect_messages
for insert to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists prospect_messages_admin_update on public.prospect_messages;
create policy prospect_messages_admin_update on public.prospect_messages
for update to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists prospect_messages_admin_delete on public.prospect_messages;
create policy prospect_messages_admin_delete on public.prospect_messages
for delete to authenticated
using (public.hagav_has_role(array['admin']));

-- outreach_suppression
drop policy if exists outreach_suppression_admin_select on public.outreach_suppression;
create policy outreach_suppression_admin_select on public.outreach_suppression
for select to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists outreach_suppression_admin_insert on public.outreach_suppression;
create policy outreach_suppression_admin_insert on public.outreach_suppression
for insert to authenticated
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists outreach_suppression_admin_update on public.outreach_suppression;
create policy outreach_suppression_admin_update on public.outreach_suppression
for update to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists outreach_suppression_admin_delete on public.outreach_suppression;
create policy outreach_suppression_admin_delete on public.outreach_suppression
for delete to authenticated
using (public.hagav_has_role(array['admin']));

-- automation_runs (somente leitura no painel)
drop policy if exists automation_runs_admin_select on public.automation_runs;
create policy automation_runs_admin_select on public.automation_runs
for select to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

-- admin_notifications (ler e marcar como lida)
drop policy if exists admin_notifications_admin_select on public.admin_notifications;
create policy admin_notifications_admin_select on public.admin_notifications
for select to authenticated
using (public.hagav_has_role(array['admin', 'comercial']));

drop policy if exists admin_notifications_admin_update on public.admin_notifications;
create policy admin_notifications_admin_update on public.admin_notifications
for update to authenticated
using (public.hagav_has_role(array['admin', 'comercial']))
with check (public.hagav_has_role(array['admin', 'comercial']));

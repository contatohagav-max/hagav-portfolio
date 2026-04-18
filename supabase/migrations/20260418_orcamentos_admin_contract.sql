-- HAGAV Studio - alinhamento de contrato entre backend de submit e painel /admin
-- Garante as colunas operacionais esperadas no painel de orçamentos.

alter table if exists public.orcamentos
  add column if not exists fluxo text not null default '',
  add column if not exists pagina text not null default 'orcamento',
  add column if not exists origem text not null default 'hagav.com.br',
  add column if not exists status text not null default 'novo',
  add column if not exists nome text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists servico text not null default '',
  add column if not exists quantidade text not null default '',
  add column if not exists material_gravado text not null default '',
  add column if not exists tempo_bruto text not null default '',
  add column if not exists prazo text not null default '',
  add column if not exists referencia text not null default '',
  add column if not exists observacoes text not null default '',
  add column if not exists detalhes text not null default '',
  add column if not exists resumo_orcamento text not null default '',
  add column if not exists preco_base numeric(12,2) not null default 0,
  add column if not exists preco_final numeric(12,2) not null default 0,
  add column if not exists pacote_sugerido text not null default '',
  add column if not exists status_orcamento text not null default 'pendente_revisao',
  add column if not exists observacoes_internas text not null default '',
  add column if not exists link_pdf text not null default '';

create index if not exists idx_orcamentos_status_orcamento on public.orcamentos (status_orcamento);
create index if not exists idx_orcamentos_created_at on public.orcamentos (created_at desc);

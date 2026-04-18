-- HAGAV Studio — RLS para acesso autenticado do painel interno
-- Execute no SQL Editor do Supabase após criar um usuário admin via Dashboard > Authentication > Users

-- ─── leads ────────────────────────────────────────────────────────────────────

drop policy if exists leads_admin_select on public.leads;
create policy leads_admin_select
on public.leads
for select
to authenticated
using (true);

drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update
on public.leads
for update
to authenticated
using (true)
with check (true);

-- ─── orcamentos ───────────────────────────────────────────────────────────────

drop policy if exists orcamentos_admin_select on public.orcamentos;
create policy orcamentos_admin_select
on public.orcamentos
for select
to authenticated
using (true);

drop policy if exists orcamentos_admin_update on public.orcamentos;
create policy orcamentos_admin_update
on public.orcamentos
for update
to authenticated
using (true)
with check (true);

-- ─── contatos ─────────────────────────────────────────────────────────────────

drop policy if exists contatos_admin_select on public.contatos;
create policy contatos_admin_select
on public.contatos
for select
to authenticated
using (true);

drop policy if exists contatos_admin_update on public.contatos;
create policy contatos_admin_update
on public.contatos
for update
to authenticated
using (true)
with check (true);

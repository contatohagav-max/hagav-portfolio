# Supabase - HAGAV

## 1) Criar estrutura no banco
Execute o SQL de migracao no painel do Supabase:

- `supabase/migrations/20260417_init_hagav.sql`
- Se o banco ja existe com estrutura antiga, executar tambem:
  - `supabase/migrations/20260417_commercial_tracking_update.sql`

## 2) Variaveis de ambiente (Cloudflare Pages)
Configurar no projeto Pages (Production e Preview):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SERVICE_ROLE_KEY` (backend)

> O endpoint `/api/validate-submit` usa `SERVICE_ROLE_KEY` quando disponivel.
> Se nao existir, usa `SUPABASE_ANON_KEY` como fallback.

## 3) Tabelas usadas atualmente
- `orcamentos` (principal para DU/DR)
- `leads` (eventos de interesse como clique no WhatsApp)
- `contatos` (reserva para futuros fluxos)

## 4) Fluxo atual do formulario
1. Front envia para `/api/validate-submit`
2. Function valida/sanitiza + antispam
3. Function grava em `orcamentos` com:
   - `fluxo` = `DU` ou `DR`
   - `pagina` = `orcamento`
   - `origem` = `hagav.com.br`
   - `status` = `novo`
4. Campos para precificacao ficam separados e tambem serializados em `detalhes`
5. Front mostra sucesso sem reload

## 5) Rastreamento de clique no WhatsApp
- Endpoint: `/api/track-whatsapp-click`
- Home:
  - `fluxo` = `WhatsApp`
  - `pagina` = `home`
  - `origem` = `H - HOME`
  - `status` = `novo`
- Portfolio:
  - `fluxo` = `WhatsApp`
  - `pagina` = `portfolio`
  - `origem` = `W - PORTFÓLIO`
  - `status` = `novo`
- Registros entram na tabela `leads`.

## 6) Fallback legado (opcional)
Se as variaveis `GOOGLE_SHEETS_WEBHOOK_URL_DU` / `GOOGLE_SHEETS_WEBHOOK_URL_DR` existirem, o endpoint pode usar fallback para webhook quando Supabase falhar.

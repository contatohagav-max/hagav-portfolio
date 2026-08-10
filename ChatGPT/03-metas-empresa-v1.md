# Metas da Empresa V1

## Estado

V1 funcional do módulo `Metas da empresa`, criada para validação visual e operacional no painel antes de evoluir para IA, Calendar, metas pessoais ou integrações automáticas.

## Implementado

- Nova rota do painel: `/admin/metas`.
- Novo item na sidebar: `Metas da empresa`, abaixo de `Financeiro`.
- Página com tabs:
  - Visão geral;
  - Financeiras;
  - Equipamentos;
  - Estudo.
- Motor central de metas em `painel-hagav/src/lib/goals-engine.js`.
- Repositório Supabase isolado em `painel-hagav/src/lib/goals-repository.js`.
- Migration própria com tabelas:
  - `goals`;
  - `goal_contributions`;
  - `goal_settings`;
  - `goal_study_sessions`.
- RLS habilitado nas quatro tabelas novas.
- Policies seguindo o padrão admin/comercial do painel.
- Dinheiro salvo como `numeric(12,2)`, nunca como string BRL.
- Datas de metas salvas como `date`.
- Trava de banco para no máximo uma meta principal ativa da empresa.

## Funcionalidades da V1

- Criar e editar meta financeira.
- Definir meta principal.
- Registrar depósito em meta financeira.
- Visualizar progresso, valor restante e necessidade por mês, semana e dia.
- Ver checklist simples dos próximos dias da meta.
- Informar valor disponível na semana.
- Calcular distribuição semanal priorizando a meta principal.
- Criar e editar equipamento.
- Registrar valor reservado em equipamento.
- Bloquear liberação de equipamento enquanto o valor reservado for menor que o preço.
- Criar objetivo de estudo.
- Gerar plano simples de quatro semanas.
- Registrar sessão de estudo.
- Atualizar progresso do estudo por sessões concluídas.
- Arquivar metas sem apagar histórico.

## Não Implementado Nesta V1

- OpenAI.
- Agente de IA.
- Google Calendar.
- Metas pessoais.
- Integração automática com Financeiro.
- Criação automática de lançamentos financeiros.
- Automação externa.
- Calendário visual avançado.

## Validações Técnicas

- `npm.cmd run test:goals` passou.
- `npm.cmd run build` passou e exportou a rota `/metas`.
- `git diff --check` passou.
- A migration foi validada por inspeção de estrutura, RLS, policies e tipos monetários.

## Observações

- O ambiente local desta sessão não possui `supabase/config.toml`, Supabase CLI, `psql` ou credenciais de banco para aplicar a migration diretamente no Supabase remoto.
- Antes de usar a página em produção com persistência real, a migration `supabase/migrations/20260810_goals_module.sql` precisa ser aplicada no projeto Supabase.
- A validação visual autenticada depende de ambiente com variáveis reais de Supabase e sessão admin ativa.

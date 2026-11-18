# Polimento do Painel

## Estado

Revisão geral do painel `/admin`: bugs de lógica, layout, textos e limpeza de arquivos mortos. Nenhuma alteração de banco nesta entrega.

## Como foi testado

- Todas as migrações rodadas em um Postgres local, com as mesmas permissões padrão do Supabase.
- Painel compilado apontando para uma API local compatível com o Supabase (RLS ativa, usuário admin).
- Navegação automática por todas as telas no computador (1440px) e no celular (390px), abrindo o primeiro item de cada lista: zero erros de console, zero requisições com falha.
- `scripts/test-automacao-api.mjs` e `npm run test:goals` passando; build de produção sem erros.

## Bugs corrigidos

- **Financeiro — contas vencidas sumiam na virada do mês.** Recebimentos e pagamentos vencidos em meses anteriores e ainda em aberto agora aparecem no topo da lista do mês atual e entram no card "Em atraso" (com aviso de quanto vem de meses anteriores).
- **Pipeline — negócios aprovados apareciam como "Proposta".** Status `aprovado` (cliente aprovou, falta contrato; produção e conta a receber já foram criadas) agora fica na coluna Fechado com o selo "Aguardando contrato" e não conta mais como prioridade imediata.
- **Cabeçalhos tortos em várias telas.** O componente de dica (`EduTooltip`) forçava largura total mesmo quando a página pedia `w-auto`, espremendo o título e empilhando botões. Também corrigida a ordem dos hooks nesse componente.
- **Mensagem do Pipeline mostrava o ID interno** ("Lead #uuid movido…"); agora mostra o nome.
- **Drawers mostravam o UUID inteiro** ("Orçamento #F7808648-A56A-…"); agora mostram um código curto.
- **Sino do topo estava desativado.** Agora mostra os avisos (ex.: "Fulano quer conversar"), com contador e link direto para o contato.
- **Erro no console de todas as páginas do site:** o script de estatísticas do Cloudflare era bloqueado pela política de segurança (CSP). Liberado em `_headers`.

## Layout

- Tabelas de Orçamentos, Clientes, Financeiro e Produção cabem num notebook (antes exigiam 1.120–1.380px e escondiam as ações à direita). Coluna de ações fica fixa quando a tabela rola.
- Cards do Dashboard com largura e altura iguais.
- Dashboard com cabeçalho no mesmo padrão das outras telas.

## Enxugado

- Dashboard: sem o bloco grande do topo, sem o texto "Indicador comercial" repetido em todo card e sem descrições longas das seções.
- Orçamentos: 4 indicadores em vez de 6 (três valores em reais confundiam); removido o bloco "Alertas rápidos", que repetia os mesmos números; tabela sem as colunas Fluxo e Revisão (viraram selos) e com uma margem só.
- Clientes: Início e Vencimento viraram "Vigência"; Recorrente virou selo "Mensal"; botão "Ver" removido (a linha já abre o cliente).
- Financeiro: 6 cards fixos (antes 6 ou 7 conforme o mês); "Clientes necessários" virou linha do card da meta; Tipo e Natureza na mesma coluna; botão "Editar" removido (a linha já abre o lançamento).
- Produção: tabela com o essencial (projeto, etapa, prazo, responsável, próxima ação); o resto continua no painel lateral. Card "Sem ClickUp" trocado por "Prazo vencido".
- Removidos arquivos mortos: `orcamentos-admin.html` + `assets/orcamentos-admin.js` + `functions/api/admin-orcamentos.js` (painel antigo, já substituído pelo `/admin`, abria sem estilo e seguia publicado) e a cópia antiga do site em `ChatGPT/hagav-portfolio-main/`.

## Textos

- Acentos corrigidos nos textos visíveis (ex.: "Só atrasados", "Sem responsável", "Todos os responsáveis", "Último contato", "Só renovação próxima", "Resumo de precificação").

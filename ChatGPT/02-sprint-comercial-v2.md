# Sprint Comercial V2

## Estado

Sprint em implementação nesta branch.

Esta documentação registra somente o que foi implementado nesta entrega. Itens planejados que não foram executados devem permanecer separados de funcionalidades concluídas.

---

## Implementado

- Cabeçalho comercial da proposta revisado para remover repetição de "proposta" no subtítulo.
- Badges superiores ajustados para número da proposta, data de emissão e validade.
- Badge de modelo removido da proposta exibida ao cliente.
- Dados do cliente no preview/PDF reduzidos para nome.
- Modo Direta mantido enxuto, sem blocos extras de referência/observação.
- Modo Comparativo reorganizado como planos comerciais: Pedido atual, Plano Crescimento e Plano Escala.
- Planos comparativos passaram a exibir subtítulo comercial, valor por entrega e economia/desconto quando aplicável.
- Modo Mensal reorganizado com valor mensal, quantidade mensal, duração, escopo e estrutura recorrente.
- Modo Personalizada preservado como proposta livre/premium com campos editáveis.
- Validade da proposta exibida no cabeçalho e removida das condições comerciais padrão.
- Próximos passos padronizados como: 01 Aprovação, 02 Recebimento dos materiais, 03 Início da produção.
- Campo de proposta ajustado para número editável, com incremento/decremento.
- Numeração automática sugerida por cliente a partir do maior número já salvo em propostas anteriores.
- Nome do arquivo PDF ajustado para padrão comercial `proposta-hagav-{cliente}-n{numero}.pdf`.
- Mensagem de envio por WhatsApp revisada para citar a proposta comercial HAGAV e o número da proposta.
- Preview interno, preview externo legado e template oficial de PDF foram alinhados nos textos e blocos principais.

---

## Arquivos Alterados

- `functions/api/admin-orcamentos-pdf.js`
- `painel-hagav/src/components/orcamentos/OrcamentoDrawer.jsx`
- `painel-hagav/src/components/orcamentos/ProposalPreview.jsx`
- `painel-hagav/src/lib/proposal.js`
- `painel-hagav/src/lib/supabase.js`
- `templates/proposta-hagav-template.html`
- `templates/proposta-hagav-preview-modos.html`
- `ChatGPT/02-sprint-comercial-v2.md`

---

## Decisões de Projeto

- Nenhuma alteração de banco foi feita.
- Nenhuma rota nova foi criada.
- A numeração automática usa dados já existentes em `deals.detalhes.comercial.numero_proposta`.
- O WhatsApp é usado como chave principal para identificar propostas anteriores do mesmo cliente; nome é fallback quando não há WhatsApp.
- O preview interno continua em React, mas foi alinhado à estrutura e aos textos do template oficial de PDF.
- O preview externo legado foi atualizado para não contradizer a proposta oficial.

---

## Validações Realizadas

- Build do painel Next executado com sucesso.
- Checagem de sintaxe do endpoint `admin-orcamentos-pdf.js` executada com sucesso.
- Busca textual confirmou remoção de textos antigos no fluxo principal da proposta.
- Prévia local estática validou carregamento da tela de login quando variáveis públicas fictícias do Supabase foram fornecidas.

---

## Observações e Riscos

- A validação visual autenticada do drawer de orçamentos depende de credenciais e variáveis reais de Supabase, não disponíveis no ambiente local.
- A paridade visual perfeita entre PDF renderizado por engine remota e preview React ainda deve ser conferida em ambiente com geração real de PDF.
- O deploy Cloudflare deve ser acompanhado após merge para confirmar que a versão publicada usa o commit final.

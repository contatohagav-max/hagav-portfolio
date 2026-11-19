# Prospecção Automática V1 — Base

## Estado

Base técnica pronta nesta branch. Ainda **não envia mensagens**: falta escolher e configurar a caixa de email de prospecção (ver "Próximos passos").

---

## Implementado

- Migração `supabase/migrations/20261118_prospeccao_automacao.sql` (pode rodar mais de uma vez):
  - `prospects`: topo de funil, separado de `deals`. Prospect só vira lead quando a equipe assume.
  - `prospect_messages`: mensagens enviadas e respostas recebidas, com fila (`rascunho` → aprovação no painel → `agendado` → `enviando` → `enviado`).
  - `outreach_suppression`: lista de "nunca mais contatar" (email, domínio ou @instagram).
  - `automation_runs`: registro do que cada automação fez.
  - `admin_notifications`: avisos para a equipe (ex.: "Fulano quer conversar").
  - `financial_entries`: novas colunas `fonte`, `revisar` e `dados_banco` para importar extrato/emails do banco.
  - RLS: admin e comercial leem e editam; a automação usa a chave de servidor pelo endpoint abaixo.
- Endpoint `functions/api/automacao/[[path]].js`, protegido por token próprio (`AUTOMATION_TOKEN`).
- Tela `/admin/prospeccao` no painel:
  - indicadores: querem conversar, encontrados hoje, enviados hoje, taxa de resposta em 30 dias;
  - abas: Querem conversar, Em conversa, Responderam, Em sequência, Na fila, Encerrados, Atividade;
  - detalhe do prospect: motivo do score, sinais, contatos, histórico de mensagens e notas;
  - ações: Assumir conversa, Virar lead no CRM, Sem interesse, Descartar, Nunca mais contatar.
- Item "Prospecção" no menu, com contador de quem quer conversar.
- Permissões novas `readProspeccao` e `manageProspeccao` (admin e comercial).
- Teste do endpoint: `node scripts/test-automacao-api.mjs` (19 cenários com banco simulado).

---

## Como ativar (uma vez)

1. **Banco:** no Supabase, abrir *SQL Editor*, colar o conteúdo de `supabase/migrations/20261118_prospeccao_automacao.sql` e executar.
2. **Token da automação:** no Cloudflare Pages → projeto do site → *Settings* → *Variables and Secrets*, criar (Production e Preview):
   - `AUTOMATION_TOKEN`: texto aleatório com 40+ caracteres (gerador de senhas). Tipo *Secret*.
   - `OUTREACH_DAILY_CAP` (opcional): limite de emails de prospecção por dia. Padrão: 30.
3. Fazer o deploy desta branch (ou merge na `main`).

Sem o `AUTOMATION_TOKEN`, o endpoint responde `503 automacao_nao_configurada` e nada é exposto.

---

## Funil do prospect

```
novo ──(1º envio)──> em_sequencia ──(resposta)──> respondeu / quer_conversar
                          │                               │
                          │                      equipe assume → em_conversa → convertido (vira lead)
                          ├─(sem resposta)──> sem_resposta
                          └─(pediu p/ sair)──> descadastrado (bloqueio permanente)
```

Regras automáticas no endpoint:

- Qualquer resposta (exceto resposta automática de férias) **cancela os follow-ups agendados**.
- `interessado` → `quer_conversar` + aviso no painel.
- `duvida`/sem classificação → `respondeu` + aviso.
- `nao_agora` → volta a contatar em 60 dias (ou data informada).
- `descadastro` → bloqueio permanente do email e do @.
- `bounce` → descartado.
- Se a equipe já assumiu (`em_conversa`/`convertido`), respostas novas não mudam o status.
- Antes de cadastrar, o endpoint ignora: quem já é prospect, quem está bloqueado e quem já é lead/cliente no CRM (por email, WhatsApp ou @).
- A fila de envio respeita o limite diário, manda no máximo 1 mensagem por prospect por rodada, só libera um follow-up 2 dias depois da etapa anterior enviada e devolve para a fila mensagens presas em "enviando" por mais de 30 minutos.
- Mensagens cadastradas sem `status` chegam como `rascunho` e só entram na fila depois que alguém clica em **Aprovar e agendar** na aba Prospecção → Para aprovar (lá também dá para editar o texto, marcar DM enviada à mão ou reprovar com motivo).

---

## API `/api/automacao`

Header: `Authorization: Bearer <AUTOMATION_TOKEN>`

| Método | Rota | Uso |
|---|---|---|
| GET | `/status` | Contadores rápidos |
| POST | `/prospects` | Cadastrar até 200 prospects (`{ prospects: [...] }`). Cada um pode trazer `mensagens: [{ etapa, assunto, corpo, agendado_para }]` (chegam como rascunho para aprovação) |
| POST | `/prospects/check` | Antes de pesquisar a fundo: `{ candidatos: [{ email, instagram, site, whatsapp }] }` → diz quem é novo |
| GET | `/prospects?status=a,b&due=1&limit=100` | Listar (ex.: follow-ups vencidos) |
| GET | `/prospects/:id` | Prospect + histórico de mensagens |
| PATCH | `/prospects/:id` | Atualizar campos/status |
| POST | `/mensagens` | Registrar mensagem enviada ou resposta recebida (`direcao: saida/entrada`, `classificacao`) |
| GET | `/mensagens/fila?canal=email&limit=10` | Próximas mensagens a enviar (já respeita limite diário) |
| PATCH | `/mensagens/:id` | Marcar `enviado`/`falhou`, gravar IDs do provedor, reclassificar resposta |
| POST | `/execucoes` · PATCH `/execucoes/:id` | Registrar o que cada rodada fez |
| POST | `/notificacoes` | Criar aviso para a equipe |
| POST | `/bloqueios` | `{ valores: ["email", "dominio", "@instagram"] }` |
| POST | `/financeiro/lancamentos` | Importar até 1000 lançamentos do banco, sem duplicar (`origin_key`, ex.: `c6:<id>`). Aceita `simular: true` |

Campos do prospect: `nome`*, `email`/`instagram`/`site` (pelo menos um)*, `empresa`, `perfil`, `nicho`, `seguidores`, `whatsapp`, `fonte`, `fonte_url`, `score` (0–100), `score_motivos`, `momento`, `sinais` (objeto), `resumo`, `canal`.

Campos do lançamento financeiro: `origin_key`*, `tipo` (`receber`/`pagar`)*, `valor`*, `descricao`*, `data`/`vencimento`, `natureza` (`Empresa`/`Pessoal`), `categoria`, `cliente_fornecedor`, `forma_pagamento`, `status` (padrão `pago`), `revisar`, `fonte`, `dados_banco`, `observacoes`.

---

## Decisões de projeto

- Prospect fica fora de `deals` para não poluir as métricas de conversão do CRM e porque prospect frio muitas vezes não tem WhatsApp (obrigatório em `deals`).
- O endpoint não expõe a chave mestra do Supabase. Trocar o `AUTOMATION_TOKEN` corta o acesso de todas as automações.
- `natureza` (Empresa/Pessoal) do financeiro continua no bloco `[HAGAV_FINANCEIRO_META]` das observações, que é o que a tela de Financeiro já lê. A importação grava nesse mesmo formato.
- Envio automático só por **email**. DM automática no Instagram e mensagem fria automática no WhatsApp violam as regras das plataformas e colocam a conta/número em risco de bloqueio.

---

## Próximos passos

1. Caixa de email de prospecção (domínio separado + Google Workspace), com SPF/DKIM/DMARC e aquecimento.
2. Script de envio e leitura de respostas (Google Apps Script na caixa de prospecção).
3. Tarefa diária de prospecção (pesquisa, qualificação, mensagem personalizada, cadastro via API).
4. Importação do extrato do C6 e tela de conferência no Financeiro (`revisar = true`).
5. Avisos fora do painel (email/push) quando alguém quiser conversar.

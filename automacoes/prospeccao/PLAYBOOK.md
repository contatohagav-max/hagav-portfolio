# Playbook de Prospecção HAGAV

Roteiro que a automação (ou qualquer pessoa da equipe) segue para encontrar, qualificar e abordar clientes. Quem executa: a tarefa diária de prospecção. Onde os dados vão parar: `/admin/prospeccao`, via `/api/automacao`.

---

## 1. Quem é o cliente

**Quem contrata edição de vídeo e pode contratar a HAGAV para escalar o volume de vídeos.**

| Perfil | Por que é bom | Exemplo de sinal |
|---|---|---|
| **Expert / infoprodutor** com lançamento ou perpétuo | Precisa de Reels, criativos de anúncio, aulas/CPL e VSL em todo ciclo | Página de captação, "lista de espera", anúncios de aula gratuita |
| **Coprodutor / agência de lançamento** | Atende vários experts: um contrato vira vários fluxos de vídeo | Portfólio de lançamentos, "case de R$ X milhões" |
| **Criador ou empresa com anúncio em vídeo constante** | Precisa de volume de criativos toda semana | Muitos anúncios ativos na Biblioteca da Meta |

**Não abordar:** perfis sem produto/serviço vendável e com menos de 5 mil seguidores; empresas grandes com estúdio interno; conteúdo adulto, apostas ou promessas de enriquecimento rápido; quem já é cliente, lead ou pediu para sair (a API bloqueia esses automaticamente).

---

## 2. Score (0–100)

Somar e limitar a 100. **Só abordar com score ≥ 60.**

| Sinal | Pontos |
|---|---|
| Anúncios em vídeo ativos agora | +25 |
| Momento: pré-lançamento ou captação | +20 |
| Momento: carrinho aberto ou perpétuo rodando | +10 |
| Posta 3+ vídeos por semana | +15 |
| Coprodutor/agência (vários experts) | +15 |
| Edição atual fraca ou inconsistente (oportunidade clara) | +10 |
| Edição boa mas volume baixo para o porte | +5 |
| Audiência entre 10 mil e 500 mil | +10 |
| Audiência acima de 500 mil | +5 |
| Produto de ticket alto (≥ R$ 497, mentoria, high ticket) | +10 |
| Email comercial público | +10 |

Guardar em `score_motivos` a conta feita (ex.: "Anúncios ativos +25, captação +20, 3 reels/sem +15 = 60").
`momento`: `pre_lancamento`, `captacao`, `carrinho_aberto`, `perpetuo` ou `sem_sinal`.

---

## 3. Onde procurar (precisa de navegador)

1. **Biblioteca de Anúncios da Meta** (Brasil, todos os anúncios): termos como "aula gratuita", "imersão", "masterclass", "lista de espera", "semana", "jornada", "desafio", "inscreva-se". Quem tem vários anúncios em vídeo ativos é o melhor sinal.
2. **Instagram:** bio com link para Hotmart, Kiwify, Eduzz, "lista de espera" ou página de captação. Ver frequência e qualidade dos Reels.
3. **Marketplaces** (Hotmart, Kiwify, Eduzz): produtos em destaque → nome do produtor → Instagram e site.
4. **Google:** páginas de captação e vendas (`"lista de espera" "aula" site:.com.br`, `site:pay.hotmart.com` + nicho).
5. **Vagas de editor** (Workana, 99Freelas, LinkedIn): quem procura editor agora é cliente quente. Nas plataformas de freela a resposta é pela própria plataforma (não há email); registrar como prospect com `canal: "outro"` e `fonte_url` da vaga.

**Contato:** usar só contato profissional público (email de "contato", "parcerias", "comercial" na bio, no site ou na página de vendas). Nunca adivinhar email.

---

## 4. Mensagens

Regras:
- Primeira linha cita algo **concreto** da pessoa (o anúncio, o lançamento, um Reel específico).
- Até ~120 palavras, um pedido só, fácil de responder ("faz sentido eu te mandar 2 exemplos?").
- Sem anexos e sem links no primeiro email (entregabilidade). Portfólio entra no 2º.
- O rodapé de descadastro é colocado automaticamente pelo script de envio.

**Cadência (máximo 3 emails; qualquer resposta para tudo):**

| Etapa | Quando | Conteúdo |
|---|---|---|
| 1 | D0 | Abordagem personalizada |
| 2 | D+3 | Retomada curta + 1 exemplo/portfólio (hagav.com.br/portfolio) |
| 3 | D+8 | Último contato, deixa a porta aberta |

Modelo — expert em captação (etapa 1):

> **Assunto:** Os vídeos da sua captação de {mês}
>
> Oi {nome}, tudo bem?
>
> Vi que você está com {n} anúncios em vídeo rodando para {evento/turma}. Na reta de captação, o gargalo costuma ser volume: criativo novo toda semana, Reels para aquecer e as aulas editadas no prazo.
>
> A HAGAV é um estúdio de edição que entra como o time de vídeo do lançamento: Reels, criativos para anúncio, aulas e VSL, com entregas recorrentes.
>
> Faz sentido eu te mandar 2 exemplos parecidos com o que você está fazendo?

Modelo — coprodutor/agência (etapa 1):

> **Assunto:** Edição de vídeo para os lançamentos da {agência}
>
> Oi {nome}! Acompanhei o lançamento de {expert} que vocês tocaram. Imagino que, com vários experts ao mesmo tempo, edição vira gargalo bem no pico.
>
> A HAGAV edita Reels, criativos e aulas para lançamentos, com fila dedicada por expert e prazo combinado.
>
> Vale uma conversa rápida para ver se dá para tirar esse peso do time?

Modelo — etapa 2:

> Oi {nome}, retomando rapidinho: separei alguns trabalhos nossos aqui → hagav.com.br/portfolio. Se fizer sentido para {projeto}, me responde por aqui que eu te explico como funciona.

Modelo — etapa 3:

> {nome}, vou parar de te escrever por aqui para não encher sua caixa. Se em algum lançamento a edição apertar, é só responder este email que a gente conversa.

---

## 5. Respostas

O script da caixa já reconhece bounce, resposta automática e "sair". O resto chega como **respondeu** e a equipe recebe aviso. A tarefa diária classifica:

| Resposta | Classificação | O que acontece |
|---|---|---|
| Quer conversar, pediu contato, pediu WhatsApp, pediu proposta | `interessado` | Vai para **Querem conversar**; equipe assume |
| Pergunta como funciona, prazo, formato | `duvida` | Automação responde com as informações padrão e pergunta se quer conversar |
| Pergunta preço | `duvida` | **Equipe responde** (preço não sai automático até a HAGAV definir faixas) |
| "Agora não", "depois do lançamento" | `nao_agora` | Volta em 60 dias (ou na data citada) |
| Não tem interesse | `sem_interesse` | Encerra |
| Pediu para não receber | `descadastro` | Bloqueio permanente |

---

## 6. Volume e entregabilidade

- Caixa de prospecção em **domínio separado** do hagav.com.br, com SPF, DKIM e DMARC configurados.
- Aquecimento: semanas 1–2 até 10 emails/dia; semana 3 até 20; depois até 30 (`OUTREACH_DAILY_CAP` no Cloudflare).
- Só dias úteis, 8h–18h (o script já respeita).
- Taxa de bounce acima de 3% ou reclamações: pausar e revisar a lista.

---

## 7. LGPD

Prospecção B2B com base em legítimo interesse: apenas contatos profissionais públicos, mensagem relevante para a atividade da pessoa, identificação clara da HAGAV e descadastro atendido na hora (lista `outreach_suppression`, que a API consulta antes de qualquer cadastro ou envio).

---

## 8. Como registrar (API)

Base: `https://hagav.com.br/api/automacao` · Header: `Authorization: Bearer <AUTOMATION_TOKEN>`

1. `POST /prospects/check` com os candidatos (email/instagram/site) → pesquisar a fundo só os `novo: true`.
2. `POST /prospects` com até 200 prospects, cada um já com `mensagens` (etapas 1–3 e `agendado_para` de cada uma).
3. `POST /execucoes` no início e `PATCH /execucoes/:id` no fim, com resumo do dia (aparece em **Atividade** no painel).
4. Respostas classificadas: `PATCH /mensagens/:id` com `classificacao` (o painel muda o status e avisa a equipe).

Detalhes de todos os campos: `ChatGPT/04-prospeccao-automatica-v1.md`.

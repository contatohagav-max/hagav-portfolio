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

## 2. Chance de fechar (o painel calcula)

O painel calcula a chance de cada prospect a partir dos sinais (`painel-hagav/src/lib/prospeccao-chance.js`). A nota tem duas metades de 0 a 50:

- **Momento de compra**: o quanto a pessoa precisa de vídeo **agora**.
- **Perfil de cliente**: o quanto ela é um bom cliente para a HAGAV.

| Momento (até 50) | Pontos | | Perfil (até 50) | Pontos |
|---|---|---|---|---|
| Está procurando editor (vaga, post pedindo editor) | +22 | | Seguidores entre 20 mil e 300 mil (tamanho ideal) | +15 |
| 10+ anúncios em vídeo ativos | +16 | | 300 mil a 700 mil | +10 |
| 5 a 9 anúncios | +13 | | 5 mil a 20 mil | +6 |
| 2 a 4 anúncios | +9 | | 700 mil a 1,5 mi (pode ter time interno) | +5 |
| 1 anúncio | +5 | | Acima de 1,5 mi (costuma ter time interno) | +1 |
| Pré-lançamento | +14 | | Agência ou coprodutor (vários clientes) | +14 |
| Captando agora (aula, imersão, lista) | +12 | | Expert/infoprodutor com produto à venda | +9 |
| Perpétuo com anúncios | +7 | | Criador de conteúdo | +4 |
| Carrinho aberto | +5 | | Ticket alto (≥ R$ 997, mentoria) | +8 |
| 3+ vídeos por semana | +5 | | Ticket médio (≥ R$ 297) | +4 |
| Edição atual fraca ou inconsistente | +5 | | Email comercial público | +8 |
| | | | Só Instagram (DM manual) | +2 |
| | | | Já tem editor/agência de vídeo | −15 |

**Faixas:** alta ≥ 65 · média 45–64 · baixa < 45.

**Quadrantes do radar:**
- **Atacar agora:** momento ≥ 25 e perfil ≥ 25.
- **Nutrir:** perfil bom, mas sem urgência; acompanhar o próximo lançamento.
- **Venda rápida, cliente menor:** precisa agora, mas o contrato tende a ser pequeno.
- **Deixar de lado:** o resto.

**Meta diária:** cadastrar só quem fica com chance **≥ 55** ou no quadrante **Atacar agora**. Prospects de chance baixa não entram, mesmo com email.

**Sinais padronizados.** Grave no campo `sinais` com estes nomes, para o painel conseguir ler:

| Chave | Exemplo |
|---|---|
| `anuncios_ativos` | `7` (anúncios em vídeo ativos na Biblioteca da Meta) |
| `vaga_editor` | `true` ou o link da vaga ou post pedindo editor |
| `posts_semana` | `4` |
| `edicao` | `"fraca"`, `"inconsistente"` ou `"boa"` |
| `ticket_max` | `1997` (maior preço visto, em reais) |
| `coprodutor` | `true` se for agência, coprodutor ou lançador |
| `tem_time_video` | `true` se citar editor ou agência própria |
| `produto` | `"Mentoria X, R$ 1.997"` |

Também preencha `seguidores` (número), `perfil` (`expert`, `agência`, `coprodutor`, `criador`, `empresa`) e `momento`, que aceita `pre_lancamento`, `captacao`, `carrinho_aberto`, `perpetuo` ou `sem_sinal`. Em `score`, repita a chance calculada, e em `score_motivos` a conta feita.

**Aprender com as reprovações.** Antes de buscar, leia os prospects `descartado` cujas notas começam com "Reprovado na aprovação: …" e evite perfis parecidos. Os motivos são "Não é o perfil", "Já tem editor ou agência", "Grande demais", "Pequeno demais", "Momento errado" e "Mensagem ruim". No radar, a tabela "A nota está acertando?" mostra a taxa de resposta por faixa. Se a faixa alta não responder mais que a baixa, ajuste os pesos.

---

## 3. Onde procurar, na ordem de chance

1. **Quem está pedindo editor agora**, que é a chance mais alta:
   - Workana e 99Freelas: projetos de "editor de vídeo" para lançamento, Reels, criativos e VSL. A resposta vai pela própria plataforma: registrar com `canal: "outro"` e `fonte_url` da vaga;
   - LinkedIn: posts "procuro editor de vídeo" de experts, agências e lançadores;
   - Instagram e X: posts e stories pedindo indicação de editor.
2. **Agências e coprodutores de lançamento**: um contrato vira vários experts. Procure no Google "agência de lançamento", "coprodução de infoprodutos" e "estrategista de lançamento", e nos cases citados por experts. O contato costuma estar no site (comercial@, contato@).
3. **Biblioteca de Anúncios da Meta**, priorizando quem tem **5 ou mais anúncios em vídeo ativos** e o mesmo vídeo repetido em vários anúncios (precisa de variações).
   - Termos: "aula gratuita", "imersão", "masterclass", "lista de espera", "semana", "jornada", "desafio", "inscreva-se", "mentoria".
   - Filtre pelo tamanho ideal: 20 mil a 300 mil seguidores.
4. **Hotmart, Kiwify e Eduzz**: produtos em destaque, depois o produtor, depois o Instagram e o site (de onde vem o email comercial).
5. **Google**: páginas de captação e de vendas, com buscas como `"lista de espera" "aula" site:.com.br` ou `site:pay.hotmart.com` mais o nicho.

Prompt pronto para o Claude do Chrome fazer a busca na Biblioteca de Anúncios: [`PROMPT-CHROME-BUSCA.md`](PROMPT-CHROME-BUSCA.md).

**Contato:** use só contato profissional público, como os emails de "contato", "parcerias" ou "comercial" na bio, no site ou na página de vendas. Nunca adivinhe email.

**Cadastro:** as mensagens entram **sempre como rascunho** (sem `status`, ou `status: "rascunho"`). A equipe aprova, edita ou reprova na aba **Prospecção → Para aprovar**, e só depois o email entra na fila.

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
2. `POST /prospects` com até 200 prospects, cada um já com `mensagens` (etapas 1–3 e `agendado_para` de cada uma). Elas chegam como **rascunho**; ao aprovar no painel, a 1ª sai na próxima rodada e os follow-ups mantêm a distância (padrão D+3 e D+8). A fila só libera um follow-up 2 dias depois da etapa anterior enviada.
3. `POST /execucoes` no início e `PATCH /execucoes/:id` no fim, com resumo do dia (aparece em **Atividade** no painel).
4. Respostas classificadas: `PATCH /mensagens/:id` com `classificacao` (o painel muda o status e avisa a equipe).

Detalhes de todos os campos: `ChatGPT/04-prospeccao-automatica-v1.md`.

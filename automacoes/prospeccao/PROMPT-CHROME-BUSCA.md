# Prompt diário de busca (Claude no Chrome)

Cole o texto abaixo no Claude do Chrome da HAGAV. Ele **só pesquisa e devolve os dados**: não envia mensagem, não segue ninguém e não comenta. Traga o JSON de volta para o Claude Code, que calcula a chance, escreve as mensagens e cadastra tudo como rascunho na aba **Prospecção → Para aprovar**.

---

```
Tarefa: encontrar até 10 prospects com ALTA chance de contratar a HAGAV (estúdio de edição de vídeo para lançamentos: Reels, criativos de anúncio, aulas e VSL). Só pesquisar e anotar. Não envie mensagens, não siga, não curta, não comente e não preencha formulários.

1. Abra a Biblioteca de Anúncios da Meta (facebook.com/ads/library), país Brasil, categoria "Todos os anúncios", só anúncios ativos.
   Busque, um por vez: "aula gratuita", "imersão", "masterclass", "lista de espera", "jornada", "desafio", "mentoria", "semana".
2. Para cada anunciante, anote quantos anúncios EM VÍDEO estão ativos. Fique só com quem tem 5 ou mais
   (ou 3 ou mais, se o mesmo vídeo estiver repetido em vários anúncios).
3. Abra o Instagram do anunciante e confira:
   - seguidores: priorize de 20 mil a 300 mil. Descarte acima de 1,5 milhão e abaixo de 5 mil;
   - se é expert/infoprodutor, mentor, agência/coprodutor ou criador;
   - quantos vídeos posta por semana (aproximado) e se a edição parece fraca, inconsistente ou boa;
   - se cita editor, agência de vídeo ou "edição por @fulano" (sinal de que já tem time de vídeo).
4. Procure um email PROFISSIONAL PÚBLICO (bio, site, página de vendas: contato@, comercial@, parcerias@).
   Nunca adivinhe email. Se não houver, deixe vazio.
5. Anote o produto e o maior preço visto (página de vendas ou de captação).
6. Descarte: conteúdo adulto, apostas, promessas de dinheiro fácil, empresas grandes com estúdio próprio.

Devolva APENAS um JSON neste formato (uma linha por prospect, sem comentários):

[
  {
    "nome": "Nome da pessoa ou marca",
    "empresa": "Marca/empresa (se houver)",
    "perfil": "expert | agência | coprodutor | criador | empresa",
    "nicho": "ex.: finanças pessoais",
    "seguidores": 85000,
    "instagram": "usuario_sem_arroba",
    "email": "contato@exemplo.com.br ou vazio",
    "site": "exemplo.com.br",
    "fonte": "meta_ads",
    "fonte_url": "link do anúncio na Biblioteca",
    "momento": "pre_lancamento | captacao | carrinho_aberto | perpetuo | sem_sinal",
    "resumo": "1 ou 2 frases: o que está anunciando agora e por que precisaria de vídeo",
    "sinais": {
      "anuncios_ativos": 7,
      "posts_semana": 4,
      "edicao": "fraca | inconsistente | boa",
      "ticket_max": 1997,
      "produto": "Nome do produto, R$ 1.997",
      "coprodutor": false,
      "tem_time_video": false
    },
    "detalhe_para_mensagem": "algo concreto e específico para citar na 1ª frase (o nome da aula, o gancho do anúncio, um Reel)"
  }
]
```

---

## O que acontece depois

1. O Claude Code confere se cada um já é cliente, lead ou pediu para sair (`POST /prospects/check`).
2. Calcula a chance pelo mesmo modelo do painel e só cadastra quem fica com **55 ou mais** ou no quadrante **Atacar agora**.
3. Escreve as mensagens (email em 3 etapas ou DM) a partir do `detalhe_para_mensagem` e cadastra como **rascunho**.
4. A equipe aprova, edita ou reprova em **Prospecção → Para aprovar**. Os motivos das reprovações ajustam a busca seguinte.

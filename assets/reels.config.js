(function () {
  "use strict";

  var videoLibrary = {
    daianeViana: {
      title: "Daiane Viana",
      label: "Short com presença e ritmo",
      category: "Conteúdo vertical",
      type: "Short vertical",
      client: "Daiane Viana",
      status: "Publicado",
      provider: "youtube",
      videoUrl: "https://www.youtube-nocookie.com/embed/_XgE-UY-JII",
      poster: "https://i.ytimg.com/vi/_XgE-UY-JII/maxresdefault.jpg",
      altText: "Thumbnail do Short vertical de Daiane Viana, editado pela HAGAV.",
      autoPlay: true
    },
    paulCabannes: {
      title: "Paul Cabannes",
      label: "Short criativo e dinâmico",
      category: "Conteúdo vertical",
      type: "Short vertical",
      client: "Paul Cabannes",
      status: "Publicado",
      provider: "youtube",
      videoUrl: "https://www.youtube-nocookie.com/embed/zmFo2_v9QRo",
      poster: "https://i.ytimg.com/vi/zmFo2_v9QRo/maxresdefault.jpg",
      altText: "Thumbnail do Short vertical de Paul Cabannes, editado pela HAGAV.",
      autoPlay: false
    },
    taisVoila: {
      title: "Tais - Escola Voilà",
      label: "Lettering e apoio visual",
      category: "Lettering e apoio visual",
      type: "Reels vertical",
      client: "Escola Voilà",
      format: "9:16",
      description: "Lettering, enquadramento e apoio visual para organizar a mensagem no celular.",
      status: "Publicado",
      provider: "youtube",
      videoUrl: "https://www.youtube-nocookie.com/embed/mzN4WzVtlqM",
      poster: "https://i.ytimg.com/vi/mzN4WzVtlqM/maxresdefault.jpg",
      altText: "Thumbnail do Reels vertical de Tais para a Escola Voilà, editado pela HAGAV.",
      autoPlay: false
    },
    reels12: {
      title: "Reels, TikTok, Shorts — 12",
      label: "Talking head dinâmico",
      category: "Talking head dinâmico",
      type: "Talking head",
      format: "9:16",
      description: "Cortes, ritmo, legendas e identidade visual aplicada ao formato vertical.",
      status: "Publicado",
      provider: "youtube",
      videoUrl: "https://www.youtube-nocookie.com/embed/5ORpPc86nb8",
      poster: "https://i.ytimg.com/vi_webp/5ORpPc86nb8/hqdefault.webp",
      altText: "Frame de um Reels vertical com apresentador e identidade visual em rosa.",
      autoPlay: false
    },
    creativeAds11: {
      title: "Criativo para Ads — 11",
      label: "Criativo de produto",
      category: "Criativo com identidade visual",
      type: "Criativo",
      format: "9:16",
      description: "Composição de produto, ritmo e identidade visual forte para mídia vertical.",
      status: "Publicado",
      provider: "youtube",
      videoUrl: "https://www.youtube-nocookie.com/embed/eE7aAgiNvDI",
      poster: "https://i.ytimg.com/vi_webp/eE7aAgiNvDI/hqdefault.webp",
      altText: "Frame de um criativo vertical de produto com composição em amarelo e preto.",
      autoPlay: false
    }
  };

  window.HAGAV_REELS_CONFIG = {
    whatsappNumber: "5573982284382",
    instagramUrl: "https://www.instagram.com/hagav.studio/",
    logoUrl: "/assets/logo-oficial-master-bg.png",
    contentPendingNote: "",
    offerNote:
      "Os valores e condições desta página fazem parte de uma oferta em validação e poderão ser ajustados antes do lançamento oficial.",
    whatsappMessages: {
      start: "Olá! Quero começar uma operação de edição recorrente de Reels com a HAGAV.",
      specialist: "Olá! Quero falar com um especialista da HAGAV sobre edição recorrente de Reels.",
      test: "Olá! Quero testar o plano de 3 vídeos da HAGAV.",
      flow: "Olá! Tenho interesse no plano mensal de 12 vídeos.",
      scale: "Olá! Quero conversar sobre uma operação de 30 vídeos mensais."
    },
    authority: [
      "Formatos para Reels, Shorts e TikTok",
      "Pós-produção organizada para demandas recorrentes",
      "Vídeos adaptados à identidade de cada projeto",
      "Atendimento humano e acompanhamento próximo"
    ],
    problems: [
      "Horas perdidas na edição",
      "Falta de consistência visual",
      "Atrasos nas publicações",
      "Comunicação confusa com editores",
      "Conteúdo gravado acumulando",
      "Dificuldade para aumentar o volume"
    ],
    benefits: [
      {
        title: "Identidade preservada",
        text: "Cada projeto recebe uma direção visual alinhada à sua marca, ao seu público e ao seu posicionamento."
      },
      {
        title: "Atendimento próximo",
        text: "Você fala diretamente com a equipe responsável pela organização e pelo acompanhamento da sua demanda."
      },
      {
        title: "Entregas organizadas",
        text: "Os conteúdos são recebidos, editados, revisados e entregues por um fluxo claro, sem arquivos espalhados."
      },
      {
        title: "Edição dinâmica",
        text: "Cortes, mudanças de enquadramento, destaques, prints, elementos gráficos, transições e efeitos aplicados com intenção."
      },
      {
        title: "B-roll e apoio visual",
        text: "Cenas, imagens e elementos complementares ajudam a sustentar a atenção e contextualizar a mensagem."
      },
      {
        title: "Áudio tratado",
        text: "Redução de ruído, equilíbrio de volume, tratamento de voz, música e efeitos sonoros."
      },
      {
        title: "Correção de cor",
        text: "Ajustes de exposição, pele, contraste e consistência visual."
      },
      {
        title: "Formato pronto para publicar",
        text: "Entrega otimizada para Reels, Shorts ou TikTok, respeitando áreas seguras e leitura no celular."
      }
    ],
    marquee: [
      "Talking head",
      "Legendas dinâmicas",
      "B-roll",
      "Motion graphics",
      "Criativos de anúncio",
      "Conteúdo educacional",
      "Reels profissionais",
      "Cortes verticais"
    ],
    videoLibrary: videoLibrary,
    featuredVideos: [videoLibrary.daianeViana, videoLibrary.paulCabannes, videoLibrary.taisVoila],
    portfolioVideos: [videoLibrary.reels12, videoLibrary.taisVoila, videoLibrary.creativeAds11],
    process: [
      {
        title: "Alinhamento",
        text: "Entendemos seu conteúdo, referências, identidade e objetivo."
      },
      {
        title: "Envio do material",
        text: "Você envia as gravações e orientações pelo canal definido com a equipe."
      },
      {
        title: "Pós-produção",
        text: "A HAGAV organiza, edita, trata áudio, cor, legendas e elementos visuais."
      },
      {
        title: "Revisão e entrega",
        text: "Você recebe o conteúdo, solicita os ajustes previstos e aprova a versão final."
      }
    ],
    dashboard: [
      { label: "Material recebido", count: "03", status: "Entrada" },
      { label: "Em edição", count: "06", status: "Produção" },
      { label: "Em revisão", count: "02", status: "Ajustes" },
      { label: "Aprovado", count: "04", status: "Validação" },
      { label: "Exportado", count: "08", status: "Entrega" }
    ],
    testimonials: [],
    pricing: [
      {
        key: "test",
        name: "Plano Teste",
        price: "R$ 375",
        cadence: "pagamento único",
        description: "Para validar o padrão HAGAV antes de uma rotina mensal.",
        cta: "Quero testar",
        featured: false,
        includes: [
          "3 vídeos",
          "Até 2 minutos por vídeo",
          "Edição vertical",
          "Tratamento de áudio e cor",
          "Legendas e elementos visuais",
          "1 rodada de ajustes"
        ]
      },
      {
        key: "flow",
        name: "Plano Fluxo",
        price: "R$ 1.500/mês",
        cadence: "12 vídeos mensais",
        description: "Para manter uma cadência recorrente com organização.",
        cta: "Escolher plano",
        badge: "Mais escolhido",
        featured: true,
        includes: [
          "12 vídeos mensais",
          "Até 2 minutos por vídeo",
          "Entregas organizadas em lotes",
          "Identidade visual alinhada",
          "Tratamento de áudio e cor",
          "Legendas, B-roll e elementos dinâmicos",
          "1 rodada de ajustes por lote"
        ]
      },
      {
        key: "scale",
        name: "Plano Escala",
        price: "R$ 3.050/mês",
        cadence: "30 vídeos mensais",
        description: "Para alta demanda com fluxo semanal de produção.",
        cta: "Falar com especialista",
        featured: false,
        includes: [
          "30 vídeos mensais",
          "Até 2 minutos por vídeo",
          "Entregas semanais em lotes",
          "Fluxo de alta demanda",
          "Identidade visual alinhada",
          "Tratamento completo",
          "1 rodada de ajustes por lote"
        ]
      }
    ],
    goodFit: [
      "Publica conteúdo com frequência",
      "Já possui gravações ou consegue gravar",
      "Precisa de consistência",
      "Quer delegar a pós-produção",
      "Precisa aumentar o volume com organização"
    ],
    badFit: [
      "Busca apenas o menor preço possível",
      "Ainda não consegue enviar o material",
      "Precisa de captação presencial incluída",
      "Espera resultados garantidos de alcance ou vendas",
      "Precisa de alterações ilimitadas"
    ],
    faq: [
      {
        question: "Vocês também criam os roteiros?",
        answer: "Esta oferta foi estruturada para pós-produção. Demandas de roteiro podem ser conversadas com a equipe, mas não estão incluídas automaticamente nos planos desta página."
      },
      {
        question: "Vocês selecionam cortes de podcasts e aulas?",
        answer: "Sim, a HAGAV trabalha com cortes e trechos quando o material permite essa curadoria. O volume, a duração e o critério de seleção devem ser alinhados no atendimento."
      },
      {
        question: "Os vídeos precisam chegar prontos para editar?",
        answer: "Não precisam chegar finalizados, mas precisam vir com gravação, contexto e orientação mínima para que a equipe entenda objetivo, referência e prioridade."
      },
      {
        question: "Posso pedir vídeos adicionais?",
        answer: "Pode. Vídeos adicionais devem ser combinados com a equipe conforme disponibilidade, volume e formato."
      },
      {
        question: "Quantos ajustes estão incluídos?",
        answer: "A estrutura inicial considera uma rodada de ajustes. Pedidos fora do escopo, mudanças completas de direção ou revisões extras devem ser alinhados com a equipe."
      },
      {
        question: "Qual é o prazo de entrega?",
        answer: "O prazo é confirmado no atendimento de acordo com volume, fila de produção e complexidade do material. Esta página teste não promete um prazo fixo."
      },
      {
        question: "Vocês editam vídeos para YouTube?",
        answer: "Sim, mas vídeos longos ou formatos horizontais devem ser orçados separadamente com base em duração, complexidade e objetivo."
      },
      {
        question: "Existe fidelidade nos planos mensais?",
        answer: "As condições contratuais devem ser confirmadas no atendimento. Esta página apresenta uma oferta em validação, sem criar regras comerciais definitivas."
      },
      {
        question: "Como envio os arquivos?",
        answer: "O canal de envio é definido com a equipe após o alinhamento. A prioridade é manter o material organizado e fácil de acompanhar."
      },
      {
        question: "Posso manter o estilo que já utilizo?",
        answer: "Sim. A HAGAV pode preservar referências visuais existentes e adaptar a edição ao padrão da sua marca."
      },
      {
        question: "A HAGAV também faz criativos para anúncios?",
        answer: "Sim. Criativos para anúncios podem ser avaliados conforme objetivo, formato, roteiro e volume necessário."
      }
    ]
  };
})();

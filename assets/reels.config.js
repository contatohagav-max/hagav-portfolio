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
      autoPlay: false
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
    savingsWords: ["TEMPO", "DINHEIRO", "RETRABALHO", "DOR DE CABEÇA"],
    trialCredit:
      "Contratou um pacote mensal em até 7 dias? O valor pago no teste vira crédito na sua primeira mensalidade.",
    whatsappMessages: {
      specialist: "Olá! Quero falar com um especialista da HAGAV sobre edição recorrente de Reels.",
      trialEssential: "Olá! Quero o Teste Essencial de edição de Reel por R$ 47.",
      trialComplete: "Olá! Quero o Teste Completo de edição de Reel por R$ 97.",
      begin: "Olá! Quero o pacote Começo com 5 Reels por mês por R$ 597/mês.",
      consistency: "Olá! Quero o pacote Constância com 12 Reels por mês por R$ 1.197/mês.",
      everyDay: "Olá! Quero o pacote Todo Dia com 30 Reels por mês por R$ 2.197/mês."
    },
    marquee: [
      "Reels profissionais",
      "Conteúdo educativo",
      "Cortes de podcast",
      "Talking head",
      "Vídeos para experts",
      "Conteúdo para empresas",
      "Shorts",
      "Criativos verticais"
    ],
    videoLibrary: videoLibrary,
    featuredVideos: [videoLibrary.daianeViana, videoLibrary.paulCabannes, videoLibrary.taisVoila],
    portfolioVideos: [videoLibrary.reels12, videoLibrary.taisVoila, videoLibrary.creativeAds11],
    beforeAfterVideos: [
      {
        id: "DaVUuOUzc6w",
        platform: "instagram",
        url: "https://www.instagram.com/reel/DaVUuOUzc6w/",
        embedUrl: "https://www.instagram.com/reel/DaVUuOUzc6w/embed/"
      },
      {
        id: "DaNsKVbTDUf",
        platform: "instagram",
        url: "https://www.instagram.com/reel/DaNsKVbTDUf/",
        embedUrl: "https://www.instagram.com/reel/DaNsKVbTDUf/embed/"
      },
      {
        id: "DaQGizATgDG",
        platform: "instagram",
        url: "https://www.instagram.com/reel/DaQGizATgDG/",
        embedUrl: "https://www.instagram.com/reel/DaQGizATgDG/embed/"
      }
    ],
    trials: [
      {
        key: "trialEssential",
        name: "Teste Essencial",
        price: "R$ 47",
        description: "Para conhecer a qualidade da HAGAV em uma edição mais direta.",
        cta: "Quero o Teste Essencial",
        featured: false,
        includes: [
          "1 Reel de até 60 segundos",
          "Material bruto de até 3 minutos",
          "Cortes e remoção de pausas",
          "Legendas revisadas",
          "Música e tratamento de áudio",
          "Acabamento visual profissional",
          "Entrega em até 48 horas após o envio"
        ]
      },
      {
        key: "trialComplete",
        name: "Teste Completo",
        price: "R$ 97",
        description: "Para experimentar uma edição mais dinâmica e completa.",
        cta: "Quero o Teste Completo",
        badge: "Mais escolhido",
        featured: true,
        includes: [
          "1 Reel de até 60 segundos",
          "Material bruto de até 3 minutos",
          "Cortes, ritmo e remoção de pausas",
          "Legendas com destaques",
          "Música, efeitos e tratamento de áudio",
          "Imagens de apoio quando necessário",
          "Identidade visual",
          "Entrega em até 48 horas após o envio"
        ]
      }
    ],
    process: [
      {
        title: "Envie",
        text: "Grave pelo celular, câmera ou envie um material que já possui."
      },
      {
        title: "A HAGAV edita",
        text: "Cuidamos dos cortes, ritmo, legendas, música, áudio e acabamento visual."
      },
      {
        title: "Receba e publique",
        text: "Acompanhe pelo painel e receba seus Reels organizados e prontos para Instagram, TikTok e YouTube Shorts."
      }
    ],
    dashboard: [
      { label: "Material recebido", count: "03", status: "Entrada" },
      { label: "Em edição", count: "06", status: "Produção" },
      { label: "Em revisão", count: "02", status: "Revisão" },
      { label: "Aprovado", count: "04", status: "Validação" },
      { label: "Exportado", count: "08", status: "Entrega" }
    ],
    testimonials: [],
    pricing: [
      {
        key: "begin",
        name: "Começo",
        volume: "5 Reels por mês",
        price: "R$ 597/mês",
        description: "Para começar a publicar com qualidade e consistência.",
        cta: "Quero 5 Reels",
        featured: false,
        includes: [
          "5 Reels de até 60 segundos",
          "Entregas organizadas durante o mês",
          "Cortes e remoção de pausas",
          "Legendas revisadas",
          "Música e tratamento de áudio",
          "Identidade visual",
          "Arquivos prontos para Instagram, TikTok e YouTube Shorts",
          "Acompanhamento pelo painel HAGAV"
        ]
      },
      {
        key: "consistency",
        name: "Constância",
        volume: "12 Reels por mês",
        price: "R$ 1.197/mês",
        description: "Para publicar aproximadamente três vezes por semana sem acumular edição.",
        cta: "Quero 12 Reels",
        badge: "Mais escolhido",
        featured: true,
        includes: [
          "12 Reels de até 60 segundos",
          "Entregas semanais",
          "Cortes, ritmo e remoção de pausas",
          "Legendas revisadas com destaques",
          "Música e tratamento de áudio",
          "Identidade visual",
          "Imagens de apoio quando necessário",
          "Arquivos prontos para Instagram, TikTok e YouTube Shorts",
          "Acompanhamento pelo painel HAGAV"
        ]
      },
      {
        key: "everyDay",
        name: "Todo Dia",
        volume: "30 Reels por mês",
        price: "R$ 2.197/mês",
        description: "Para transformar suas gravações em uma operação constante de conteúdo.",
        cta: "Quero 30 Reels",
        featured: false,
        includes: [
          "30 Reels de até 60 segundos",
          "Entregas semanais prioritárias",
          "Até 7 Reels por semana em lotes organizados",
          "Cortes, ritmo e remoção de pausas",
          "Legendas revisadas com destaques",
          "Música, efeitos e tratamento de áudio",
          "Identidade visual",
          "Imagens de apoio quando necessário",
          "Arquivos prontos para Instagram, TikTok e YouTube Shorts",
          "Reunião mensal de avaliação",
          "Análise dos conteúdos que tiveram melhor resultado",
          "Sugestões de pautas e ganchos para o próximo mês",
          "Acompanhamento completo pelo painel HAGAV"
        ]
      }
    ],
    faq: [
      {
        question: "Posso enviar uma gravação feita pelo celular?",
        answer: "Sim. Você pode gravar pelo celular, câmera ou enviar materiais de podcast, entrevista, aula e outros formatos."
      },
      {
        question: "Qual é a diferença entre o teste de R$ 47 e o de R$ 97?",
        answer: "O teste de R$ 47 oferece uma edição mais direta, com cortes, legendas, música, áudio e acabamento visual. O teste de R$ 97 oferece uma edição mais dinâmica, com destaques nas legendas, efeitos, imagens de apoio e identidade visual."
      },
      {
        question: "O que recebo no teste?",
        answer: "Um Reel profissional de até 60 segundos, finalizado e pronto para publicar."
      },
      {
        question: "Em quanto tempo recebo?",
        answer: "O resultado do teste é entregue em até 48 horas após o envio correto do material."
      },
      {
        question: "O valor do teste é descontado do pacote?",
        answer: "Sim. Contratando qualquer pacote mensal em até 7 dias, o valor pago no teste vira crédito na primeira mensalidade."
      },
      {
        question: "Os vídeos servem para outras plataformas?",
        answer: "Sim. Os arquivos são entregues em formato vertical e ficam prontos para Instagram Reels, TikTok e YouTube Shorts."
      },
      {
        question: "Vocês selecionam trechos de podcasts, aulas e vídeos longos?",
        answer: "Podemos selecionar os melhores momentos. O valor será calculado conforme o tempo total do material enviado."
      }
    ]
  };
})();

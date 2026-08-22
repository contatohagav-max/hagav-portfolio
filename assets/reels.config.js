(function () {
  "use strict";

  function youtubeVideo(id, title, label, source) {
    return {
      id: id,
      title: title,
      label: label,
      source: source || "Canal oficial HAGAV no YouTube",
      provider: "youtube",
      videoUrl: "https://www.youtube-nocookie.com/embed/" + id,
      poster: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
      altText: "Thumbnail de " + title + ", trabalho oficial da HAGAV."
    };
  }

  var videos = {
    daiane: youtubeVideo("_XgE-UY-JII", "Daiane Viana", "Narrativa vertical"),
    paul: youtubeVideo("zmFo2_v9QRo", "Paul Cabannes", "Ritmo e humor"),
    tais: youtubeVideo("mzN4WzVtlqM", "Tais - Escola Voila", "Lettering e apoio visual"),
    reels16: youtubeVideo("SCHvQrYctn4", "Reels, TikTok, Shorts - 16", "Talking head"),
    reels15: youtubeVideo("e1PgXkM4QZE", "Reels, TikTok, Shorts - 15", "Conteudo vertical"),
    ads11: youtubeVideo("eE7aAgiNvDI", "Criativo para Ads - 11", "Criativo de produto"),
    farofa: youtubeVideo("RaP_riXANEQ", "AD01 Farofa", "Criativo para anuncios"),
    brasboat: youtubeVideo("8u5C4RG_spg", "Os Barcos da Brasboat", "Criativo vertical"),
    ads08: youtubeVideo("oVQraLDd_Pw", "Criativo para Ads - 08", "Composicao e ritmo"),
    reels14: youtubeVideo("vgINgvVWvcM", "Reels, TikTok, Shorts - 14", "Edicao dinamica"),
    reels13: youtubeVideo("hQ4DgwdBMNg", "Reels, TikTok, Shorts - 13", "Legendas e motion"),
    corte09: youtubeVideo("VNQDGTkcNeg", "Corte - 09", "Corte vertical")
  };

  window.HAGAV_REELS_CONFIG = {
    whatsappNumber: "5573982284382",
    instagramUrl: "https://www.instagram.com/hagav.studio/",
    logoUrl: "/assets/logo-oficial-master-bg.png",
    whatsappMessages: {
      delegate: "Ola! Acessei a pagina da HAGAV e quero delegar minha edicao de videos.",
      specialist: "Ola! Acessei a pagina da HAGAV e quero falar com um especialista sobre edicao de videos.",
      sample: "Ola! Acessei a pagina da HAGAV e quero solicitar minha amostra de edicao com 50% de desconto.",
      test: "Ola! Tenho interesse no Plano Teste de 3 videos da HAGAV.",
      flow: "Ola! Tenho interesse no Plano Fluxo de 12 videos mensais da HAGAV.",
      scale: "Ola! Tenho interesse no Plano Escala de 30 videos mensais da HAGAV."
    },
    marquee: ["Reels profissionais", "Cortes verticais", "Shorts", "TikTok", "Criativos para anuncios", "Talking head", "Cortes de podcast", "Conteudo educacional", "VSL", "Videos para YouTube", "Legendas e motion", "Localizacao de conteudo"],
    videoLibrary: videos,
    featuredVideos: [videos.daiane, videos.paul, videos.tais],
    showcaseVideos: [videos.reels16, videos.reels15, videos.ads11, videos.farofa, videos.brasboat, videos.ads08, videos.reels14, videos.reels13, videos.corte09],
    process: [
      { title: "Alinhamento", text: "Entendemos seu conteudo, referencias e identidade." },
      { title: "Envio", text: "Voce envia as gravacoes e orientacoes pelo fluxo definido." },
      { title: "Pos-producao", text: "Organizamos cortes, ritmo, audio, cor, legendas e elementos visuais." },
      { title: "Revisao e entrega", text: "Voce acompanha, solicita os ajustes previstos e aprova." }
    ],
    trackingFlow: {
      label: "Fluxo visual de acompanhamento HAGAV",
      disclaimer: "Representacao do fluxo de acompanhamento.",
      client: "Projeto Demonstracao",
      columns: ["Material recebido", "Em edicao", "Em revisao", "Entregue"],
      cards: ["Reel 01 - Hook principal", "Reel 02 - Conteudo educativo", "Reel 03 - Criativo de anuncio", "Reel 04 - Corte vertical"],
      statuses: ["Editor atribuido", "Edicao em andamento", "Primeira versao disponivel", "Video aprovado"]
    },
    pricing: [
      { key: "test", name: "Plano Teste", price: "R$ 375", cadence: "pagamento unico", description: "Para validar o padrao HAGAV antes de uma rotina mensal.", cta: "Quero testar", includes: ["3 videos", "Ate 2 minutos por video", "Edicao vertical", "Tratamento de audio e cor", "Legendas e elementos visuais", "1 rodada de ajustes"] },
      { key: "flow", name: "Plano Fluxo", price: "R$ 1.500/mes", cadence: "12 videos mensais", description: "Para manter uma cadencia recorrente com organizacao.", cta: "Escolher plano", badge: "Mais escolhido", featured: true, includes: ["12 videos mensais", "Ate 2 minutos por video", "Entregas organizadas em lotes", "Identidade visual alinhada", "Tratamento de audio e cor", "Legendas, B-roll e elementos dinamicos", "1 rodada de ajustes por lote"] },
      { key: "scale", name: "Plano Escala", price: "R$ 3.050/mes", cadence: "30 videos mensais", description: "Para alta demanda com fluxo semanal de producao.", cta: "Falar com especialista", includes: ["30 videos mensais", "Ate 2 minutos por video", "Entregas semanais em lotes", "Fluxo de alta demanda", "Identidade visual alinhada", "Tratamento completo", "1 rodada de ajustes por lote"], bonus: { title: "1 reuniao estrategica de alinhamento", items: ["Analise do conteudo atual", "Sugestoes de temas, formatos e oportunidades de melhoria", "Leitura de desempenho e visualizacoes disponiveis"], note: "Recomendacoes baseadas no conteudo e nos dados disponibilizados pelo cliente." } }
    ],
    goodFit: ["Grava, mas nao consegue manter frequencia", "Quer delegar a edicao", "Precisa preservar a identidade", "Deseja aumentar o volume", "Busca um processo organizado"],
    badFit: ["Busca somente o menor preco", "Ainda nao consegue enviar materiais", "Precisa de mudancas ilimitadas", "Espera alcance ou vendas garantidas", "Precisa de captacao presencial incluida"],
    faq: [
      { question: "Vocês também criam os roteiros?", answer: "Esta oferta foi estruturada para pós-produção. Demandas de roteiro podem ser avaliadas separadamente com a equipe." },
      { question: "Vocês selecionam cortes de podcasts e aulas?", answer: "Sim, quando o material permite essa curadoria. Volume, duração e critérios de seleção são alinhados antes do início." },
      { question: "Os vídeos precisam chegar prontos para editar?", answer: "Não. Precisamos da gravação completa, contexto, referências e orientações mínimas para confirmar o briefing." },
      { question: "Quantos ajustes estão incluídos?", answer: "A estrutura atual considera uma rodada de ajustes. Revisões extras ou mudanças completas de direção são alinhadas separadamente." },
      { question: "Todos os vídeos ficam prontos em 48 horas?", answer: "O prazo de até 48 horas úteis se refere à primeira prévia, após o recebimento completo do material e do alinhamento. Os demais prazos dependem do plano, volume e complexidade da demanda." },
      { question: "Como acompanho meus vídeos?", answer: "A equipe organiza demandas, prazos, revisões e entregas em um fluxo visual de acompanhamento. O formato de acesso e o canal usado são confirmados no alinhamento inicial." },
      { question: "Vocês editam vídeos para YouTube?", answer: "Sim. Vídeos longos e formatos horizontais são orçados conforme duração, complexidade e objetivo." },
      { question: "Como envio os arquivos?", answer: "O canal de envio é definido com a equipe. A contagem da primeira prévia começa apenas após material completo, referências enviadas e briefing confirmado." }
    ],
    sampleOffer: { enabled: true, discountPercentage: 50, durationDays: 7, appliesTo: "uma amostra de edicao", onePerCustomer: true, storageKey: "hagav_sample_offer_started_at" }
  };
})();

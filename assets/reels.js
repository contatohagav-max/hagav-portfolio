(function () {
  "use strict";

  var config = window.HAGAV_REELS_CONFIG || {};
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function text(value) {
    return String(value || "");
  }

  function onlyDigits(value) {
    return text(value).replace(/\D/g, "");
  }

  function waUrl(message) {
    var number = onlyDigits(config.whatsappNumber || "5573982284382");
    var body = encodeURIComponent(text(message || config.whatsappMessages && config.whatsappMessages.specialist));
    return "https://wa.me/" + number + (body ? "?text=" + body : "");
  }

  function setWhatsAppLinks() {
    qsa("[data-whatsapp-link]").forEach(function (element) {
      var key = element.getAttribute("data-whatsapp-link") || "specialist";
      var message = config.whatsappMessages && config.whatsappMessages[key];
      element.href = waUrl(message);
    });
  }

  function createEl(tag, className, content) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function renderList(root, items) {
    if (!root) return;
    root.innerHTML = "";
    (items || []).forEach(function (item) {
      root.appendChild(createEl("li", "", item));
    });
  }

  function renderAuthority() {
    var root = qs("[data-authority]");
    if (!root) return;
    root.innerHTML = "";
    (config.authority || []).forEach(function (item) {
      var card = createEl("div", "reels-authority__item reveal");
      card.appendChild(createEl("span", "", "•"));
      card.appendChild(createEl("p", "", item));
      root.appendChild(card);
    });
  }

  function renderProblems() {
    var root = qs("[data-problems]");
    if (!root) return;
    root.innerHTML = "";
    (config.problems || []).forEach(function (item, index) {
      var card = createEl("article", "reels-problem-card");
      card.appendChild(createEl("span", "reels-card-number", String(index + 1).padStart(2, "0")));
      card.appendChild(createEl("h3", "", item));
      root.appendChild(card);
    });
  }

  function renderBenefits() {
    var root = qs("[data-benefits]");
    if (!root) return;
    root.innerHTML = "";
    (config.benefits || []).forEach(function (item, index) {
      var card = createEl("article", "reels-benefit-card reveal");
      card.appendChild(createEl("span", "reels-card-number", String(index + 1).padStart(2, "0")));
      card.appendChild(createEl("h3", "", item.title));
      card.appendChild(createEl("p", "", item.text));
      root.appendChild(card);
    });
  }

  function renderMarquee() {
    var root = qs("[data-marquee]");
    if (!root) return;
    root.innerHTML = "";
    var items = (config.marquee || []).concat(config.marquee || []);
    items.forEach(function (item) {
      root.appendChild(createEl("span", "", item));
    });
  }

  function mediaPlaceholder(item) {
    var wrap = createEl("div", "reels-video-placeholder");
    var pulse = createEl("span", "reels-video-placeholder__pulse");
    var copy = createEl("div", "");
    copy.appendChild(createEl("strong", "", item.status || "Vídeo pendente"));
    copy.appendChild(createEl("small", "", "Adicionar: " + text(item.expectedFile || "arquivo de vídeo HAGAV")));
    wrap.appendChild(pulse);
    wrap.appendChild(copy);
    return wrap;
  }

  function youtubeEmbedUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      if (!/(^|\.)youtube(-nocookie)?\.com$/i.test(url.hostname)) return "";
      url.searchParams.set("enablejsapi", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("controls", "1");
      url.searchParams.set("rel", "0");
      url.searchParams.set("modestbranding", "1");
      url.searchParams.set("mute", "1");
      url.searchParams.set("autoplay", "0");
      var videoId = url.pathname.split("/").filter(Boolean).pop();
      if (videoId) {
        url.searchParams.set("loop", "1");
        url.searchParams.set("playlist", videoId);
      }
      url.searchParams.set("origin", window.location.origin);
      return url.toString();
    } catch (error) {
      return "";
    }
  }

  function createMediaControl(item) {
    var button = createEl("button", "reels-video-control");
    button.type = "button";
    button.setAttribute("data-video-control", "");
    button.setAttribute("aria-label", "Reproduzir " + text(item.title || item.label || "vídeo HAGAV"));
    button.appendChild(createEl("span", "sr-only", "Reproduzir ou pausar vídeo"));
    return button;
  }

  function createVideoSlot(item, mode, index) {
    var card = createEl("article", mode === "hero" ? "reels-phone reels-phone--" + (index + 1) : "reels-video-card reveal");
    var frame = createEl("div", "reels-phone__screen reels-media-shell");
    var hasVideo = !!item.videoUrl;

    if (hasVideo) {
      var isYouTube = item.provider === "youtube" || /youtube(?:-nocookie)?\.com/i.test(item.videoUrl);
      frame.setAttribute("data-media-provider", isYouTube ? "youtube" : "native");
      frame.setAttribute("data-src", item.videoUrl);
      frame.setAttribute("data-media-title", item.title || item.label || "Vídeo HAGAV");
      frame.setAttribute("data-autoplay", item.autoPlay ? "true" : "false");
      frame.setAttribute("data-playing", "false");

      if (isYouTube) {
        var poster = createEl("img", "reels-video-poster");
        poster.src = item.poster;
        poster.alt = item.altText || ("Poster de " + text(item.title || item.label || "vídeo HAGAV"));
        poster.loading = "lazy";
        poster.decoding = "async";
        poster.width = 720;
        poster.height = 1280;
        frame.appendChild(poster);
      } else {
        var video = createEl("video", "reels-video");
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("data-src", item.videoUrl);
        if (item.poster) video.poster = item.poster;
        video.setAttribute("aria-label", item.altText || item.title || item.label || "Vídeo HAGAV");
        frame.appendChild(video);
      }
      frame.appendChild(createMediaControl(item));
    } else {
      frame.appendChild(mediaPlaceholder(item));
    }

    var meta = createEl("div", mode === "hero" ? "reels-phone__meta" : "reels-video-card__meta");
    meta.appendChild(createEl("span", "", item.type || item.format || "9:16"));
    meta.appendChild(createEl("h3", "", item.title || item.label));
    if (mode !== "hero" && item.description) meta.appendChild(createEl("p", "", item.description));
    card.appendChild(frame);
    card.appendChild(meta);
    return card;
  }

  function renderVideos() {
    var heroRoot = qs("[data-hero-videos]");
    if (heroRoot) {
      heroRoot.innerHTML = "";
      (config.featuredVideos || config.heroVideos || []).forEach(function (item, index) {
        heroRoot.appendChild(createVideoSlot(item, "hero", index));
      });
    }

    var portfolioRoot = qs("[data-portfolio]");
    if (portfolioRoot) {
      portfolioRoot.innerHTML = "";
      (config.portfolioVideos || config.portfolioItems || []).forEach(function (item, index) {
        portfolioRoot.appendChild(createVideoSlot(item, "portfolio", index));
      });
    }

    var note = qs("[data-portfolio-note]");
    if (note) {
      note.textContent = config.contentPendingNote || "";
      note.hidden = !note.textContent;
    }
  }

  function renderProcess() {
    var root = qs("[data-process]");
    if (!root) return;
    root.innerHTML = "";
    (config.process || []).forEach(function (item, index) {
      var step = createEl("article", "reels-process-step reveal");
      step.appendChild(createEl("span", "reels-process-step__number", String(index + 1).padStart(2, "0")));
      step.appendChild(createEl("h3", "", item.title));
      step.appendChild(createEl("p", "", item.text));
      root.appendChild(step);
    });
  }

  function renderDashboard() {
    var root = qs("[data-dashboard]");
    if (!root) return;
    root.innerHTML = "";
    (config.dashboard || []).forEach(function (item) {
      var column = createEl("article", "reels-dashboard-card");
      column.appendChild(createEl("span", "reels-dashboard-card__status", item.status));
      column.appendChild(createEl("strong", "", item.count));
      column.appendChild(createEl("p", "", item.label));
      root.appendChild(column);
    });
  }

  function renderTestimonials() {
    var section = qs("[data-testimonials-section]");
    var root = qs("[data-testimonials]");
    var items = config.testimonials || [];
    if (!section || !root) return;
    if (!items.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    root.innerHTML = "";
    items.forEach(function (item) {
      var card = createEl("article", "reels-testimonial-card reveal");
      card.appendChild(createEl("p", "", item.quote));
      card.appendChild(createEl("strong", "", item.name));
      if (item.role) card.appendChild(createEl("span", "", item.role));
      root.appendChild(card);
    });
  }

  function renderPricing() {
    var root = qs("[data-pricing]");
    if (!root) return;
    root.innerHTML = "";
    (config.pricing || []).forEach(function (plan) {
      var card = createEl("article", "reels-pricing-card reveal" + (plan.featured ? " reels-pricing-card--featured" : ""));
      if (plan.badge) card.appendChild(createEl("span", "reels-badge", plan.badge));
      card.appendChild(createEl("h3", "", plan.name));
      card.appendChild(createEl("p", "reels-pricing-card__description", plan.description));
      var price = createEl("div", "reels-price");
      price.appendChild(createEl("strong", "", plan.price));
      price.appendChild(createEl("span", "", plan.cadence));
      card.appendChild(price);
      var list = createEl("ul", "reels-check-list");
      (plan.includes || []).forEach(function (item) {
        list.appendChild(createEl("li", "", item));
      });
      card.appendChild(list);
      var cta = createEl("a", "reels-button" + (plan.featured ? "" : " reels-button--secondary"), plan.cta);
      cta.href = waUrl(config.whatsappMessages && config.whatsappMessages[plan.key]);
      cta.setAttribute("data-whatsapp-track", "");
      cta.setAttribute("data-track-page", "reels-teste");
      cta.setAttribute("data-track-origin", "REELS - PLANO " + plan.name.toUpperCase());
      card.appendChild(cta);
      root.appendChild(card);
    });

    var note = qs("[data-offer-note]");
    if (note) note.textContent = config.offerNote || "";
  }

  function renderFAQ() {
    var root = qs("[data-faq]");
    if (!root) return;
    root.innerHTML = "";
    (config.faq || []).forEach(function (item, index) {
      var panel = createEl("article", "reels-faq-item reveal");
      var button = createEl("button", "reels-faq-item__button");
      var answerId = "faq-answer-" + index;
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", answerId);
      button.appendChild(createEl("span", "", item.question));
      button.appendChild(createEl("span", "reels-faq-item__icon", "+"));
      var answer = createEl("div", "reels-faq-item__answer");
      answer.id = answerId;
      answer.hidden = true;
      answer.appendChild(createEl("p", "", item.answer));
      button.addEventListener("click", function () {
        var expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        answer.hidden = expanded;
        qs(".reels-faq-item__icon", button).textContent = expanded ? "+" : "−";
      });
      panel.appendChild(button);
      panel.appendChild(answer);
      root.appendChild(panel);
    });
  }

  function injectSchema() {
    var faqItems = config.faq || [];
    var schemas = [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "Edição recorrente de Reels e vídeos curtos",
        provider: {
          "@type": "Organization",
          name: "HAGAV Studio de Edição",
          url: "https://hagav.com.br/"
        },
        serviceType: "Pós-produção de vídeos curtos",
        areaServed: "Brasil",
        url: "https://hagav.com.br/reels-teste",
        description: "Pós-produção recorrente para Reels, Shorts e TikTok com edição dinâmica, identidade visual, áudio tratado e entregas organizadas."
      }
    ];

    if (faqItems.length && qs("[data-faq]")) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map(function (item) {
          return {
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer
            }
          };
        })
      });
    }

    schemas.forEach(function (schema, index) {
      var script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "reels-schema-" + index;
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });
  }

  function setupReveal() {
    var items = qsa(".reveal");
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });
    items.forEach(function (item) { observer.observe(item); });
  }

  function setupVideos() {
    var shells = qsa(".reels-media-shell[data-src]");
    if (!shells.length) return;

    function setPlaying(shell, playing) {
      var button = qs("[data-video-control]", shell);
      var title = shell.getAttribute("data-media-title") || "vídeo HAGAV";
      shell.setAttribute("data-playing", playing ? "true" : "false");
      shell.classList.toggle("is-playing", playing);
      if (button) button.setAttribute("aria-label", (playing ? "Pausar " : "Reproduzir ") + title);
    }

    function youtubeCommand(iframe, command) {
      if (!iframe || !iframe.contentWindow) return;
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "*");
    }

    function loadYouTube(shell, shouldPlay) {
      var iframe = qs("iframe", shell);
      shell.setAttribute("data-requested-play", shouldPlay ? "true" : "false");
      if (iframe) {
        if (shouldPlay) {
          youtubeCommand(iframe, "mute");
          youtubeCommand(iframe, "playVideo");
          setPlaying(shell, true);
        }
        return;
      }

      var src = youtubeEmbedUrl(shell.getAttribute("data-src"));
      if (!src) return;
      iframe = createEl("iframe", "reels-youtube-embed");
      iframe.title = shell.getAttribute("data-media-title") || "Vídeo HAGAV";
      iframe.loading = "lazy";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.setAttribute("allowfullscreen", "");
      iframe.addEventListener("load", function () {
        shell.classList.add("is-loaded");
        youtubeCommand(iframe, "mute");
        if (shell.getAttribute("data-requested-play") === "true") {
          youtubeCommand(iframe, "playVideo");
          setPlaying(shell, true);
        }
      });
      iframe.src = src;
      var control = qs("[data-video-control]", shell);
      shell.insertBefore(iframe, control || null);
    }

    function loadNative(shell, shouldPlay) {
      var video = qs("video[data-src]", shell);
      if (!video) return;
      if (!video.src) video.src = video.getAttribute("data-src");
      if (shouldPlay) {
        video.muted = true;
        video.play().then(function () { setPlaying(shell, true); }).catch(function () { setPlaying(shell, false); });
      }
    }

    function play(shell) {
      if (shell.getAttribute("data-media-provider") === "youtube") {
        loadYouTube(shell, true);
      } else {
        loadNative(shell, true);
      }
    }

    function pause(shell) {
      var iframe = qs("iframe", shell);
      var video = qs("video", shell);
      shell.setAttribute("data-requested-play", "false");
      if (iframe) youtubeCommand(iframe, "pauseVideo");
      if (video) video.pause();
      setPlaying(shell, false);
    }

    function load(shell) {
      if (shell.getAttribute("data-media-provider") === "youtube") {
        loadYouTube(shell, false);
      } else {
        loadNative(shell, false);
      }
    }

    shells.forEach(function (shell) {
      var button = qs("[data-video-control]", shell);
      var video = qs("video", shell);
      if (button) {
        button.addEventListener("click", function () {
          if (shell.getAttribute("data-playing") === "true") pause(shell);
          else play(shell);
        });
      }
      if (video) {
        video.addEventListener("play", function () { setPlaying(shell, true); });
        video.addEventListener("pause", function () { setPlaying(shell, false); });
      }
    });

    if (!("IntersectionObserver" in window)) {
      shells.forEach(load);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var shell = entry.target;
        if (entry.isIntersecting) {
          load(shell);
          if (!reduceMotion && shell.getAttribute("data-autoplay") === "true") play(shell);
        } else {
          pause(shell);
        }
      });
    }, { threshold: 0.4 });
    shells.forEach(function (shell) { observer.observe(shell); });
  }

  function setupMenu() {
    var button = qs(".reels-menu-button");
    var nav = qs("#reels-nav");
    if (!button || !nav) return;
    button.addEventListener("click", function () {
      var expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      nav.classList.toggle("is-open", !expanded);
    });
    qsa("a", nav).forEach(function (link) {
      link.addEventListener("click", function () {
        button.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      });
    });
  }

  function updateYear() {
    qsa("[data-footer-year]").forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function init() {
    setWhatsAppLinks();
    renderAuthority();
    renderProblems();
    renderBenefits();
    renderMarquee();
    renderVideos();
    renderProcess();
    renderDashboard();
    renderTestimonials();
    renderPricing();
    renderList(qs("[data-good-fit]"), config.goodFit || []);
    renderList(qs("[data-bad-fit]"), config.badFit || []);
    renderFAQ();
    injectSchema();
    setupMenu();
    setupReveal();
    setupVideos();
    updateYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

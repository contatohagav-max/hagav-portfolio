(function () {
  "use strict";

  var config = window.HAGAV_REELS_CONFIG || {};
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var activePlayer = null;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function waUrl(message) {
    return "https://wa.me/" + (config.whatsappNumber || "") + "?text=" + encodeURIComponent(message || "");
  }

  function setWhatsAppLinks() {
    qsa("[data-whatsapp-link]").forEach(function (link) {
      var key = link.getAttribute("data-whatsapp-link");
      link.href = waUrl((config.whatsappMessages || {})[key]);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  function stopActivePlayer(except) {
    if (!activePlayer || activePlayer === except) return;
    var frame = qs("iframe", activePlayer);
    if (frame) frame.remove();
    activePlayer.classList.remove("is-playing");
    var button = qs("[data-video-play]", activePlayer);
    if (button) button.hidden = false;
    activePlayer = null;
  }

  function playVideo(shell) {
    if (!shell || shell.classList.contains("is-playing")) return;
    stopActivePlayer(shell);
    var id = shell.getAttribute("data-video-id");
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id || "")) return;
    var iframe = el("iframe", "reels-video-frame");
    iframe.title = shell.getAttribute("data-video-title") || "Vídeo HAGAV";
    iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&mute=1&controls=1&playsinline=1&rel=0&enablejsapi=1";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("allowfullscreen", "");
    shell.appendChild(iframe);
    shell.classList.add("is-playing");
    var button = qs("[data-video-play]", shell);
    if (button) button.hidden = true;
    activePlayer = shell;
  }

  function createVideoCard(item, index) {
    var card = el("article", "reels-video-card");
    card.setAttribute("data-slide", "");
    card.setAttribute("aria-label", item.title);
    var shell = el("div", "reels-video-shell");
    shell.setAttribute("data-video-id", item.id);
    shell.setAttribute("data-video-title", item.title);
    var image = el("img");
    image.src = item.poster;
    image.alt = item.altText;
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    image.width = 480;
    image.height = 854;
    var shade = el("span", "reels-video-shade");
    var play = el("button", "reels-video-play", "▶");
    play.type = "button";
    play.setAttribute("data-video-play", "");
    play.setAttribute("aria-label", "Reproduzir " + item.title + " sem som");
    play.addEventListener("click", function () { playVideo(shell); });
    shell.appendChild(image);
    shell.appendChild(shade);
    shell.appendChild(play);
    var meta = el("div", "reels-video-meta");
    meta.appendChild(el("strong", "", item.title));
    meta.appendChild(el("span", "", item.label));
    card.appendChild(shell);
    card.appendChild(meta);
    return card;
  }

  function renderCarousel(root, items, type) {
    if (!root || !items.length) return;
    var viewport = el("div", "reels-carousel__viewport");
    var track = el("div", "reels-carousel__track");
    viewport.appendChild(track);
    items.forEach(function (item, index) { track.appendChild(createVideoCard(item, index)); });
    var controls = el("div", "reels-carousel__controls");
    var previous = el("button", "reels-carousel__arrow", "←");
    var next = el("button", "reels-carousel__arrow", "→");
    previous.type = next.type = "button";
    previous.setAttribute("aria-label", "Trabalho anterior");
    next.setAttribute("aria-label", "Próximo trabalho");
    var dots = el("div", "reels-carousel__dots");
    var counter = el("span", "reels-carousel__counter", "01 / " + String(items.length).padStart(2, "0"));
    controls.appendChild(previous);
    controls.appendChild(dots);
    controls.appendChild(counter);
    controls.appendChild(next);
    if (type === "showcase") {
      var nextLabel = el("button", "reels-button reels-button--secondary reels-carousel__next-label", "VER PRÓXIMO TRABALHO");
      nextLabel.type = "button";
      controls.appendChild(nextLabel);
      nextLabel.addEventListener("click", function () { setIndex(state.index + 1); });
    }
    root.appendChild(viewport);
    root.appendChild(controls);

    var state = { index: 0, startX: 0 };
    items.forEach(function (_, index) {
      var dot = el("button", "reels-carousel__dot");
      dot.type = "button";
      dot.setAttribute("aria-label", "Ver trabalho " + (index + 1));
      dot.addEventListener("click", function () { setIndex(index); });
      dots.appendChild(dot);
    });

    function setIndex(value) {
      state.index = (value + items.length) % items.length;
      stopActivePlayer();
      qsa("[data-slide]", track).forEach(function (slide, index) {
        var delta = index - state.index;
        if (delta > items.length / 2) delta -= items.length;
        if (delta < -items.length / 2) delta += items.length;
        slide.style.setProperty("--slide-offset", String(delta));
        slide.classList.toggle("is-active", delta === 0);
        slide.classList.toggle("is-near", Math.abs(delta) === 1);
        slide.setAttribute("aria-hidden", Math.abs(delta) > 1 ? "true" : "false");
      });
      qsa(".reels-carousel__dot", dots).forEach(function (dot, index) {
        dot.classList.toggle("is-active", index === state.index);
        dot.setAttribute("aria-current", index === state.index ? "true" : "false");
      });
      counter.textContent = String(state.index + 1).padStart(2, "0") + " / " + String(items.length).padStart(2, "0");
    }
    previous.addEventListener("click", function () { setIndex(state.index - 1); });
    next.addEventListener("click", function () { setIndex(state.index + 1); });
    viewport.addEventListener("touchstart", function (event) { state.startX = event.changedTouches[0].clientX; }, { passive: true });
    viewport.addEventListener("touchend", function (event) {
      var delta = event.changedTouches[0].clientX - state.startX;
      if (Math.abs(delta) > 38) setIndex(state.index + (delta < 0 ? 1 : -1));
    }, { passive: true });
    root.setIndex = setIndex;
    setIndex(0);
  }

  function renderMarquee() {
    var root = qs("[data-marquee]");
    if (!root) return;
    var items = (config.marquee || []).concat(config.marquee || []);
    items.forEach(function (item) {
      root.appendChild(el("span", "", item));
      root.appendChild(el("b", "", "•"));
    });
  }

  function renderProcess() {
    var root = qs("[data-process]");
    (config.process || []).forEach(function (item, index) {
      var card = el("article", "reels-process__step reveal");
      card.appendChild(el("span", "", String(index + 1).padStart(2, "0")));
      card.appendChild(el("h3", "", item.title));
      card.appendChild(el("p", "", item.text));
      root.appendChild(card);
    });
  }

  function renderTrackingBoard() {
    var root = qs("[data-tracking-board]");
    var data = config.trackingFlow;
    if (!root || !data) return;
    var top = el("div", "reels-board__top");
    var titleWrap = el("div");
    titleWrap.appendChild(el("span", "", data.label));
    titleWrap.appendChild(el("strong", "", data.client));
    top.appendChild(titleWrap);
    var restart = el("button", "reels-board__restart", "↻");
    restart.type = "button";
    restart.title = "Reiniciar demonstração";
    restart.setAttribute("aria-label", "Reiniciar demonstração do fluxo");
    top.appendChild(restart);
    root.appendChild(top);
    var columns = el("div", "reels-board__columns");
    var columnNodes = [];
    data.columns.forEach(function (name, index) {
      var column = el("section", "reels-board__column");
      var heading = el("h3", "", name);
      heading.appendChild(el("span", "", String(index + 1).padStart(2, "0")));
      column.appendChild(heading);
      columns.appendChild(column);
      columnNodes.push(column);
    });
    root.appendChild(columns);
    data.cards.slice(1).forEach(function (name, index) {
      var card = el("article", "reels-board__card reels-board__card--static");
      card.appendChild(el("strong", "", name));
      card.appendChild(el("span", "", index === 0 ? "Edição em andamento" : index === 1 ? "Ajustes aplicados" : "Vídeo aprovado"));
      columnNodes[index + 1].appendChild(card);
    });
    var moving = el("article", "reels-board__card reels-board__card--moving");
    moving.appendChild(el("strong", "", data.cards[0]));
    var status = el("span", "", data.statuses[0]);
    moving.appendChild(status);
    var action = el("button", "reels-board__action", "CONFERIR VÍDEO");
    action.type = "button";
    action.hidden = true;
    action.addEventListener("click", function () {
      var showcase = qs("[data-carousel='showcase']");
      if (showcase) {
        showcase.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        showcase.classList.add("is-highlighted");
        window.setTimeout(function () { showcase.classList.remove("is-highlighted"); }, 1500);
      }
    });
    moving.appendChild(action);
    var notification = el("div", "reels-board__notification");
    notification.setAttribute("role", "status");
    root.appendChild(notification);
    root.appendChild(el("p", "reels-board__disclaimer", data.disclaimer));
    var step = 0;
    var timer = null;
    var visible = false;

    function renderStep() {
      columnNodes[step].appendChild(moving);
      status.textContent = data.statuses[step];
      moving.setAttribute("data-status-step", String(step));
      action.hidden = step !== 3;
      notification.classList.remove("is-visible");
      if (step === 3) {
        notification.textContent = "Conseguimos adiantar sua demanda.";
        notification.classList.add("is-visible");
        window.setTimeout(function () {
          if (step === 3) notification.textContent = "Seu vídeo já está disponível para revisão.";
        }, reduceMotion ? 0 : 1400);
      }
    }
    function schedule() {
      window.clearInterval(timer);
      if (!visible || reduceMotion) return;
      timer = window.setInterval(function () { step = (step + 1) % 4; renderStep(); }, 2600);
    }
    restart.addEventListener("click", function () { step = 0; renderStep(); schedule(); });
    renderStep();
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      schedule();
    }, { threshold: 0.25 }).observe(root);
  }

  function renderPricing() {
    var root = qs("[data-pricing]");
    (config.pricing || []).forEach(function (plan) {
      var card = el("article", "reels-pricing__card reveal" + (plan.featured ? " is-featured" : ""));
      if (plan.badge) card.appendChild(el("span", "reels-badge", plan.badge));
      card.appendChild(el("h3", "", plan.name));
      card.appendChild(el("p", "reels-pricing__description", plan.description));
      var price = el("div", "reels-price");
      price.appendChild(el("strong", "", plan.price));
      price.appendChild(el("span", "", plan.cadence));
      card.appendChild(price);
      var list = el("ul", "reels-check-list");
      plan.includes.forEach(function (item) { list.appendChild(el("li", "", item)); });
      card.appendChild(list);
      if (plan.bonus) {
        var bonus = el("div", "reels-bonus");
        bonus.appendChild(el("span", "reels-bonus__badge", "BÔNUS"));
        bonus.appendChild(el("strong", "", plan.bonus.title));
        var bonusList = el("ul");
        plan.bonus.items.forEach(function (item) { bonusList.appendChild(el("li", "", item)); });
        bonus.appendChild(bonusList);
        bonus.appendChild(el("small", "", plan.bonus.note));
        card.appendChild(bonus);
      }
      var cta = el("a", "reels-button" + (plan.featured ? "" : " reels-button--secondary"), plan.cta);
      cta.href = waUrl((config.whatsappMessages || {})[plan.key]);
      cta.target = "_blank";
      cta.rel = "noopener noreferrer";
      cta.setAttribute("data-whatsapp-track", "");
      cta.setAttribute("data-track-page", "reels-teste");
      cta.setAttribute("data-track-origin", "REELS - " + plan.name.toUpperCase());
      card.appendChild(cta);
      root.appendChild(card);
    });
  }

  function renderList(root, items) {
    if (!root) return;
    items.forEach(function (item) { root.appendChild(el("li", "", item)); });
  }

  function renderFAQ() {
    var root = qs("[data-faq]");
    (config.faq || []).forEach(function (item, index) {
      var panel = el("article", "reels-faq__item reveal");
      var button = el("button", "reels-faq__button");
      var id = "faq-answer-" + index;
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", id);
      button.appendChild(el("span", "", item.question));
      button.appendChild(el("b", "", "+"));
      var answer = el("div", "reels-faq__answer");
      answer.id = id;
      answer.hidden = true;
      answer.appendChild(el("p", "", item.answer));
      button.addEventListener("click", function () {
        var expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        button.lastChild.textContent = expanded ? "+" : "−";
        answer.hidden = expanded;
      });
      panel.appendChild(button);
      panel.appendChild(answer);
      root.appendChild(panel);
    });
  }

  function setupOffer() {
    var offer = config.sampleOffer || {};
    var root = qs("[data-offer-countdown]");
    var cta = qs("[data-offer-cta]");
    if (!offer.enabled || !root || !cta) return;
    var now = Date.now();
    var stored = Number(window.localStorage.getItem(offer.storageKey));
    var started = Number.isFinite(stored) && stored > 0 ? stored : now;
    if (!stored) window.localStorage.setItem(offer.storageKey, String(started));
    var duration = offer.durationDays * 24 * 60 * 60 * 1000;
    var expires = started + duration;
    var dateNode = qs("[data-offer-date]");
    var timeNode = qs("[data-offer-time]");
    var progress = qs("[data-offer-progress]");
    var bar = qs("span", progress);

    dateNode.textContent = new Intl.DateTimeFormat("pt-BR").format(new Date(expires));
    function update() {
      var remaining = expires - Date.now();
      var expired = remaining <= 0;
      remaining = Math.max(0, remaining);
      var days = Math.floor(remaining / 86400000);
      var hours = Math.floor((remaining % 86400000) / 3600000);
      var minutes = Math.floor((remaining % 3600000) / 60000);
      var percent = Math.max(0, Math.min(100, remaining / duration * 100));
      timeNode.textContent = expired ? "Esta condição expirou" : days + " dias, " + String(hours).padStart(2, "0") + " horas e " + String(minutes).padStart(2, "0") + " minutos";
      bar.style.width = percent + "%";
      bar.style.setProperty("--offer-heat", String(100 - percent));
      progress.setAttribute("aria-valuenow", String(Math.round(percent)));
      root.classList.toggle("is-expired", expired);
      cta.textContent = expired ? "FALAR COM UM ESPECIALISTA" : "QUERO MINHA AMOSTRA COM " + offer.discountPercentage + "%";
      cta.href = waUrl((config.whatsappMessages || {})[expired ? "specialist" : "sample"]);
      cta.target = "_blank";
      cta.rel = "noopener noreferrer";
    }
    update();
    window.setInterval(update, 30000);
  }

  function setupMenu() {
    var button = qs(".reels-menu-button");
    var nav = qs(".reels-nav");
    if (!button || !nav) return;
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      nav.classList.toggle("is-open", !open);
    });
    qsa("a", nav).forEach(function (link) { link.addEventListener("click", function () { nav.classList.remove("is-open"); button.setAttribute("aria-expanded", "false"); }); });
  }

  function setupReveal() {
    var items = qsa(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (item) { observer.observe(item); });
  }

  function init() {
    setWhatsAppLinks();
    renderCarousel(qs("[data-carousel='featured']"), config.featuredVideos || [], "featured");
    renderCarousel(qs("[data-carousel='showcase']"), config.showcaseVideos || [], "showcase");
    renderMarquee();
    renderProcess();
    renderTrackingBoard();
    renderPricing();
    renderList(qs("[data-good-fit]"), config.goodFit || []);
    renderList(qs("[data-bad-fit]"), config.badFit || []);
    renderFAQ();
    setupOffer();
    setupMenu();
    setupReveal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

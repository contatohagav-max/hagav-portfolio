(function () {
  var ENDPOINT = "/api/track-whatsapp-click";
  var VALID = {
    home: "H - HOME",
    portfolio: "W - PORTFÓLIO"
  };

  function safeText(value, maxLen) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, maxLen);
  }

  function buildPayload(el) {
    var page = safeText(el.getAttribute("data-track-page"), 40).toLowerCase();
    var origin = safeText(el.getAttribute("data-track-origin"), 80);
    if (!VALID[page] || VALID[page] !== origin) return null;
    return {
      fluxo: "WhatsApp",
      pagina: page,
      origem: origin,
      status: "novo",
      ts: Date.now()
    };
  }

  function sendTrack(payload) {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json; charset=utf-8" });
        navigator.sendBeacon(ENDPOINT, blob);
        return;
      } catch (_) {}
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: body,
      keepalive: true
    }).catch(function () {});
  }

  function bindTrack(el) {
    if (!el || el.__hagavWhatsappBound) return;
    el.__hagavWhatsappBound = true;
    var fired = false;
    function trackOnce() {
      if (fired) return;
      var payload = buildPayload(el);
      if (!payload) return;
      fired = true;
      sendTrack(payload);
    }
    el.addEventListener("click", trackOnce, { passive: true });
    el.addEventListener("touchstart", trackOnce, { passive: true });
    el.addEventListener("auxclick", function (event) {
      if (event && event.button === 1) trackOnce();
    }, { passive: true });
  }

  function init() {
    document.querySelectorAll("[data-whatsapp-track]").forEach(bindTrack);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

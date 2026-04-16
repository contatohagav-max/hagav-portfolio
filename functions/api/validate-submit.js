const DDD_VALIDOS = new Set([
  "11","12","13","14","15","16","17","18","19",
  "21","22","24","27","28",
  "31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49",
  "51","53","54","55",
  "61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99"
]);

const LIMITS = {
  nome: 80,
  instagram: 80,
  empresa: 100,
  extras: 1000,
  referencia: 700,
  outro: 180,
  duration: 32,
  service: 80
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function stripDangerousText(value, maxLen) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const withoutTags = normalized.replace(/<[^>]*>/g, "");
  return withoutTags.slice(0, maxLen);
}

function hasDangerousScheme(value) {
  return /(javascript:|vbscript:|data:text\/html)/i.test(value);
}

function isSequential(value) {
  const arr = value.split("").map(Number);
  let up = true;
  let down = true;
  for (let i = 1; i < arr.length; i += 1) {
    if (arr[i] !== arr[i - 1] + 1) up = false;
    if (arr[i] !== arr[i - 1] - 1) down = false;
  }
  return up || down;
}

function validateWhatsapp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 11) {
    return { ok: false, error: "WhatsApp invalido" };
  }

  const ddd = digits.slice(0, 2);
  if (!DDD_VALIDOS.has(ddd)) {
    return { ok: false, error: "DDD invalido" };
  }

  if (/^(\d)\1+$/.test(digits) || digits === "12345678910" || isSequential(digits)) {
    return { ok: false, error: "WhatsApp invalido" };
  }

  if (digits.length === 11 && digits.charAt(2) !== "9") {
    return { ok: false, error: "Celular invalido" };
  }

  return { ok: true, value: digits };
}

function validateTipoPayload(body) {
  const tipo = body?.tipo;
  if (tipo !== "unica" && tipo !== "recorrente") {
    return { ok: false, error: "Tipo de formulario invalido" };
  }

  const answers = body?.answers;
  if (!answers || typeof answers !== "object") {
    return { ok: false, error: "Respostas ausentes" };
  }

  const nome = stripDangerousText(answers.nome, LIMITS.nome);
  if (!nome) return { ok: false, error: "Nome invalido" };

  const whatsapp = validateWhatsapp(answers.whatsapp);
  if (!whatsapp.ok) return whatsapp;

  const instagram = stripDangerousText(answers.instagram || "", LIMITS.instagram);
  const empresa = stripDangerousText(answers.empresa || "", LIMITS.empresa);
  const extras = stripDangerousText(answers.extras || "", LIMITS.extras);

  if (hasDangerousScheme(instagram) || hasDangerousScheme(extras) || hasDangerousScheme(empresa)) {
    return { ok: false, error: "Conteudo invalido" };
  }

  if (tipo === "unica") {
    const referencia = stripDangerousText(answers.unica_referencia || "", LIMITS.referencia);
    if (hasDangerousScheme(referencia)) return { ok: false, error: "Referencia invalida" };

    const servicos = answers.unica_servicos;
    if (!servicos || !Array.isArray(servicos.selected) || servicos.selected.length === 0) {
      return { ok: false, error: "Servicos invalidos" };
    }

    if (servicos.selected.includes("Outro")) {
      const outro = stripDangerousText(servicos.outro || "", LIMITS.outro);
      if (!outro) return { ok: false, error: "Outro invalido" };
    }

    const quantidades = answers.unica_quantidades;
    if (!quantidades || typeof quantidades !== "object") {
      return { ok: false, error: "Quantidades invalidas" };
    }

    for (const service of Object.keys(quantidades)) {
      const safeService = stripDangerousText(service, LIMITS.service);
      if (!safeService) return { ok: false, error: "Servico invalido" };
      const qty = Number(quantidades[service]);
      if (!Number.isInteger(qty) || qty < 1 || qty > 10000) {
        return { ok: false, error: "Quantidade invalida" };
      }
    }

    if (!answers.unica_prazo) {
      return { ok: false, error: "Prazo invalido" };
    }

    const tempos = answers.unica_tempo_bruto || {};
    if (tempos && typeof tempos === "object") {
      for (const key of Object.keys(tempos)) {
        const val = stripDangerousText(String(tempos[key] || ""), LIMITS.duration);
        if (!val) return { ok: false, error: "Tempo bruto invalido" };
      }
    }
  }

  if (tipo === "recorrente") {
    const required = ["rec_tipo_operacao", "rec_volume", "rec_objetivo", "rec_gravado", "rec_inicio"];
    for (const field of required) {
      const v = stripDangerousText(answers[field] || "", 120);
      if (!v) return { ok: false, error: "Campo recorrente invalido" };
      if (hasDangerousScheme(v)) return { ok: false, error: "Campo recorrente invalido" };
    }
  }

  return {
    ok: true,
    sanitized: {
      tipo,
      nome,
      whatsapp: whatsapp.value,
      instagram,
      empresa,
      extras
    }
  };
}

async function verifyTurnstileToken(secret, token, ip) {
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    return { ok: false, error: "turnstile_http_error" };
  }

  const data = await response.json();
  return { ok: !!data.success, data };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return json({ ok: false, error: "TURNSTILE_SECRET_KEY not configured" }, 503);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Invalid content type" }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON invalido" }, 400);
  }

  const honeypot = stripDangerousText(body?.honeypot || "", 120);
  if (honeypot) {
    return json({ ok: false, error: "Spam detectado" }, 403);
  }

  const elapsedMs = Number(body?.meta?.elapsedMs || 0);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 3500) {
    return json({ ok: false, error: "Envio muito rapido" }, 429);
  }

  const payloadValidation = validateTipoPayload(body);
  if (!payloadValidation.ok) {
    return json({ ok: false, error: payloadValidation.error }, 400);
  }

  const token = stripDangerousText(body?.turnstileToken || "", 2048);
  if (!token) {
    return json({ ok: false, error: "Token Turnstile ausente" }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const turnstile = await verifyTurnstileToken(secret, token, ip);
  if (!turnstile.ok) {
    return json({ ok: false, error: "Falha na verificacao anti-bot" }, 403);
  }

  return json({ ok: true });
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return json({ ok: false, error: "Method not allowed" }, 405);
}

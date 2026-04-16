function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  const siteKey = context.env.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    return json({ ok: false, error: "Turnstile site key not configured" }, 503);
  }

  return json({ ok: true, siteKey });
}

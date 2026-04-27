const buckets = globalThis.__hagavRateLimitBuckets || new Map();
globalThis.__hagavRateLimitBuckets = buckets;

function nowMs() {
  return Date.now();
}

function buildBucketKey(parts) {
  return parts.filter(Boolean).join('::');
}

function getBucket(key, windowMs) {
  const current = nowMs();
  const bucket = buckets.get(key) || { hits: [], blockedUntil: 0 };
  bucket.hits = bucket.hits.filter((timestamp) => current - timestamp < windowMs);
  if (bucket.blockedUntil && bucket.blockedUntil <= current) bucket.blockedUntil = 0;
  buckets.set(key, bucket);
  return bucket;
}

export function rateLimitHeaders(state) {
  return {
    'x-rate-limit-limit': String(state.limit),
    'x-rate-limit-remaining': String(Math.max(0, state.remaining)),
    'x-rate-limit-reset-ms': String(Math.max(0, state.resetMs)),
  };
}

export function applyRateLimit({ namespace = 'default', key = 'anonymous', limit = 30, windowMs = 60000, blockMs = windowMs }) {
  const bucketKey = buildBucketKey([namespace, key]);
  const bucket = getBucket(bucketKey, windowMs);
  const current = nowMs();

  if (bucket.blockedUntil && bucket.blockedUntil > current) {
    return {
      ok: false,
      limit,
      remaining: 0,
      resetMs: bucket.blockedUntil - current,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - current) / 1000)),
    };
  }

  bucket.hits.push(current);
  const remaining = Math.max(0, limit - bucket.hits.length);
  const oldest = bucket.hits[0] || current;
  const resetMs = Math.max(0, windowMs - (current - oldest));

  if (bucket.hits.length > limit) {
    bucket.blockedUntil = current + blockMs;
    return {
      ok: false,
      limit,
      remaining: 0,
      resetMs: blockMs,
      retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1000)),
    };
  }

  return {
    ok: true,
    limit,
    remaining,
    resetMs,
    retryAfterSeconds: 0,
  };
}

export function rateLimitResponse(body, state, status = 429) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': String(state.retryAfterSeconds || 60),
      ...rateLimitHeaders(state),
    },
  });
}

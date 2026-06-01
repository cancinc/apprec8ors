/**
 * Cloudflare Pages Function — /api/explore
 *
 * Open-ended NFT lookup: accepts any OpenSea collection slug (no whitelist).
 * Resolves the chain automatically by calling the OpenSea collections endpoint,
 * then proxies the NFT request server-side so the API key never reaches the browser.
 *
 * Query params:
 *   wallet     — Ethereum address to look up (required)
 *   collection — Any OpenSea collection slug (required)
 *   next       — OpenSea pagination cursor (optional)
 */

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
// Loose slug validation: lowercase alphanumeric, hyphens, underscores
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;

const RATE_LIMIT = 40; // requests per IP per minute
const ipTimestamps = new Map();

// In-memory cache: slug → { chain, address, name }
// Persists within a Worker instance to avoid redundant metadata fetches.
const collectionCache = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = (ipTimestamps.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  ipTimestamps.set(ip, timestamps);
  return false;
}

async function resolveCollection(slug, apiKey) {
  if (collectionCache.has(slug)) return collectionCache.get(slug);

  const resp = await fetch(
    `https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`,
    {
      headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!resp.ok) return null;

  const data = await resp.json();
  const contract = (data.contracts || [])[0];
  if (!contract) return null;

  const meta = {
    chain:   contract.chain,
    address: contract.address,
    name:    data.name || slug,
  };
  collectionCache.set(slug, meta);
  return meta;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  const apiKey = env.OPENSEA_API_KEY;
  if (!apiKey) {
    return json({ error: 'API key not configured on server.' }, 503);
  }

  const { searchParams } = new URL(request.url);

  // Validate wallet — required for this endpoint
  const rawWallet = (searchParams.get('wallet') || '').trim();
  if (!rawWallet || !WALLET_RE.test(rawWallet)) {
    return json({ error: 'Invalid or missing wallet address.' }, 400);
  }
  const wallet = rawWallet.toLowerCase();

  // Validate slug
  const rawSlug = (searchParams.get('collection') || '').trim().toLowerCase();
  if (!rawSlug || !SLUG_RE.test(rawSlug)) {
    return json({ error: 'Invalid or missing collection slug.' }, 400);
  }

  // Resolve chain + contract address for this collection
  let meta;
  try {
    meta = await resolveCollection(rawSlug, apiKey);
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return json({ error: timedOut ? 'Collection lookup timed out.' : 'Failed to look up collection.' }, 502);
  }

  if (!meta) {
    return json({ error: `Collection not found: "${rawSlug}". Check the slug and try again.` }, 404);
  }

  // Fetch NFTs from OpenSea
  const next = searchParams.get('next');
  let osUrl = `https://api.opensea.io/api/v2/chain/${meta.chain}/account/${wallet}/nfts`
            + `?collection=${rawSlug}&limit=200`;
  if (next) osUrl += `&next=${encodeURIComponent(next)}`;

  try {
    const osResp = await fetch(osUrl, {
      headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!osResp.ok) {
      const body = await osResp.text().catch(() => '');
      return json({ error: `OpenSea ${osResp.status}`, detail: body.slice(0, 200) }, osResp.status);
    }

    const data = await osResp.json();

    // Attach collection metadata on first page (no cursor) so the frontend
    // can display the proper name, chain, and contract without a second request.
    if (!next) {
      data.collection_meta = meta;
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });

  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return json({ error: timedOut ? 'OpenSea request timed out.' : err.message }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response('Method not allowed', { status: 405 });
}

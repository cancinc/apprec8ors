/**
 * Cloudflare Pages Function — /api/nfts
 *
 * Proxies OpenSea API requests server-side so the API key
 * never appears in the browser. Set OPENSEA_API_KEY as a
 * secret in: Cloudflare Pages → Settings → Environment variables
 *
 * Query params:
 *   wallet     — Ethereum address to look up (defaults to owner wallet)
 *   collection — Appreciators collection slug (defaults to appreciators-originals)
 *   next       — OpenSea pagination cursor
 */

const DEFAULT_WALLET     = '0x50fc8d1d8dca2605c26a3a8274a5430132e2af13';
const DEFAULT_COLLECTION = 'appreciators-originals';
const WALLET_RE          = /^0x[0-9a-fA-F]{40}$/;

// Whitelisted Appreciators collections → { chain } for OpenSea API v2
// chain values: 'ape_chain' | 'ethereum' | 'matic' (Polygon)
const COLLECTIONS = {
  'appreciators-originals':  { chain: 'ape_chain' },
  'theappreciators-nft':     { chain: 'ethereum'  },
  'potions-of-appreciation': { chain: 'matic'     },
  'appreciators-companions': { chain: 'ethereum'  },
};

// Raise limit slightly: All-Collections mode fires 4 requests per page load
const RATE_LIMIT  = 40; // requests per IP per minute
const ipTimestamps = new Map();

function isRateLimited(ip) {
  const now       = Date.now();
  const windowMs  = 60_000;
  const timestamps = (ipTimestamps.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  ipTimestamps.set(ip, timestamps);
  return false;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Rate limiting
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again shortly.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // API key check
  const apiKey = env.OPENSEA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);

  // Validate wallet
  const rawWallet = (searchParams.get('wallet') || '').trim();
  if (rawWallet && !WALLET_RE.test(rawWallet)) {
    return new Response(JSON.stringify({ error: 'Invalid wallet address.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const wallet = rawWallet && WALLET_RE.test(rawWallet)
    ? rawWallet.toLowerCase()
    : DEFAULT_WALLET;

  // Validate collection
  const rawCollection = (searchParams.get('collection') || DEFAULT_COLLECTION).trim();
  const collConf = COLLECTIONS[rawCollection];
  if (!collConf) {
    return new Response(JSON.stringify({ error: 'Unknown collection.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build OpenSea URL
  const next  = searchParams.get('next');
  let osUrl   = `https://api.opensea.io/api/v2/chain/${collConf.chain}/account/${wallet}/nfts`
              + `?collection=${rawCollection}&limit=200`;
  if (next) osUrl += `&next=${encodeURIComponent(next)}`;

  try {
    const osResp = await fetch(osUrl, {
      headers: {
        'x-api-key': apiKey,
        'accept':    'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!osResp.ok) {
      const body = await osResp.text().catch(() => '');
      return new Response(JSON.stringify({ error: `OpenSea ${osResp.status}`, detail: body.slice(0, 200) }), {
        status: osResp.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await osResp.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });

  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return new Response(JSON.stringify({ error: timedOut ? 'OpenSea request timed out.' : err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Reject non-GET requests
export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response('Method not allowed', { status: 405 });
}

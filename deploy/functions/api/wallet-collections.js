/**
 * Cloudflare Pages Function — /api/wallet-collections
 *
 * Returns the unique collection slugs held by a wallet across
 * Ethereum, ApeChain, and Base (first 200 NFTs per chain).
 * Used to populate the "Browse wallet" dropdown in explorer.html.
 *
 * Query params:
 *   wallet — Ethereum address (required)
 */

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const CHAINS    = ['ethereum', 'ape_chain', 'base'];

const RATE_LIMIT   = 40;
const ipTimestamps = new Map();

function isRateLimited(ip) {
  const now        = Date.now();
  const windowMs   = 60_000;
  const timestamps = (ipTimestamps.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  ipTimestamps.set(ip, timestamps);
  return false;
}

async function fetchChainCollections(chain, wallet, apiKey) {
  const seen    = new Set();
  const results = [];
  let cursor    = null;

  for (let page = 0; page < 2; page++) {
    try {
      let url = `https://api.opensea.io/api/v2/chain/${chain}/account/${wallet}/nfts?limit=200`;
      if (cursor) url += `&next=${encodeURIComponent(cursor)}`;
      const resp = await fetch(url, {
        headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) break;
      const data = await resp.json();
      for (const nft of (data.nfts || [])) {
        if (nft.collection && !seen.has(nft.collection)) {
          seen.add(nft.collection);
          results.push({ slug: nft.collection, chain });
        }
      }
      cursor = data.next || null;
      if (!cursor) break;
    } catch {
      break;
    }
  }
  return results;
}

async function resolveCollectionNames(slugs, apiKey) {
  if (slugs.length === 0) return {};
  try {
    const resp = await fetch('https://api.opensea.io/api/v2/collections/batch', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({ collection_slugs: slugs }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const names = {};
    for (const coll of (data.collections || [])) {
      if (coll.collection && coll.name) names[coll.collection] = coll.name;
    }
    return names;
  } catch {
    return {};
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) return json({ error: 'Too many requests.' }, 429);

  const apiKey = env.OPENSEA_API_KEY;
  if (!apiKey) return json({ error: 'API key not configured.' }, 503);

  const { searchParams } = new URL(request.url);
  const rawWallet = (searchParams.get('wallet') || '').trim();
  if (!rawWallet || !WALLET_RE.test(rawWallet)) {
    return json({ error: 'Invalid or missing wallet address.' }, 400);
  }
  const wallet = rawWallet.toLowerCase();

  // Query all 3 chains in parallel; individual failures are silently ignored
  const chainResults = await Promise.all(
    CHAINS.map(chain => fetchChainCollections(chain, wallet, apiKey))
  );

  // Merge, deduplicate, sort alphabetically
  const seen        = new Set();
  const collections = [];
  for (const batch of chainResults) {
    for (const item of batch) {
      if (!seen.has(item.slug)) {
        seen.add(item.slug);
        collections.push(item);
      }
    }
  }
  collections.sort((a, b) => a.slug.localeCompare(b.slug));

  // Resolve real collection names in one batch call; fall back to slug if it fails
  const names = await resolveCollectionNames(collections.map(c => c.slug), apiKey);
  const withNames = collections.map(c => ({ ...c, name: names[c.slug] || null }));

  return json({ collections: withNames });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=120, s-maxage=120',
    },
  });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response('Method not allowed', { status: 405 });
}

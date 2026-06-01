/**
 * Cloudflare Pages Function — /api/traits
 *
 * Proxies OpenSea trait data for whitelisted Appreciators collections.
 * Also fetches total_supply from the collection endpoint (parallel) so
 * the frontend can compute rarity scores without a second round-trip.
 *
 * Query params:
 *   collection — Appreciators collection slug (required)
 */

const ALLOWED = new Set([
  'appreciators-originals',
  'theappreciators-nft',
  'potions-of-appreciation',
  'appreciators-companions',
]);

export async function onRequestGet(context) {
  const { request, env } = context;

  const apiKey = env.OPENSEA_API_KEY;
  if (!apiKey) {
    return json({ error: 'API key not configured on server.' }, 503);
  }

  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('collection') || '').trim().toLowerCase();

  if (!slug || !ALLOWED.has(slug)) {
    return json({ error: 'Invalid collection.' }, 400);
  }

  const headers = { 'x-api-key': apiKey, 'accept': 'application/json' };
  const signal  = AbortSignal.timeout(10_000);

  try {
    const [traitsResp, collResp] = await Promise.all([
      fetch(`https://api.opensea.io/api/v2/traits/${encodeURIComponent(slug)}`,       { headers, signal }),
      fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`,  { headers, signal }),
    ]);

    if (!traitsResp.ok) {
      const body = await traitsResp.text().catch(() => '');
      return json({ error: `OpenSea traits ${traitsResp.status}`, detail: body.slice(0, 200) }, traitsResp.status);
    }

    const traitsData = await traitsResp.json();
    const total_supply = collResp.ok ? (await collResp.json()).total_supply ?? null : null;

    return new Response(JSON.stringify({ ...traitsData, total_supply }), {
      status: 200,
      headers: {
        'Content-Type':                'application/json',
        'Cache-Control':               'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return json({ error: timedOut ? 'Request timed out.' : err.message }, 502);
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

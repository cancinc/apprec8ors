# Appreciators NFT Gallery — knicknack.cv

## Live site & deploy
- **URL:** https://knicknack.cv
- **Cloudflare Pages project:** `apprec8ors`
- **Deploy folder:** `/Users/cnicnac/projects/apprec8ors/deploy`
- **Deploy command** (run in your own terminal — wrangler requires interactive auth):
  ```bash
  wrangler pages deploy /Users/cnicnac/projects/apprec8ors/deploy --project-name apprec8ors
  ```

## File structure
```
deploy/
  index.html               ← landing page (navy/yellow brand, links to all tools)
  gallery.html             ← main Appreciators NFT gallery (all 4 collections)
  explorer.html            ← open NFT explorer (any wallet, any collection slug) ✓ LIVE
  animated.html            ← The Appreciators animated GIF gallery
  a-logo.png
  colors_and_type.css      ← shared type/color tokens for landing page
  assets/
    gallery-1/             ← landing page marquee + collection card thumbnails
    icons/                 ← nav icon PNGs (Info, Help, Link, User)
  fonts/
    Sora-ExtraBold.ttf
    Soria-Bold.ttf
  functions/
    api/
      nfts.js                  ← OpenSea proxy, Appreciators whitelist only
      explore.js               ← open proxy, any slug, auto-resolves chain; caches collection metadata in Cloudflare Cache API (1hr TTL across instances)
      wallet-collections.js    ← returns unique collection slugs + real names held by a wallet (ETH/APE/BASE); paginates up to 400 NFTs/chain; batch-resolves names via POST /api/v2/collections/batch
scripts/
  compute-originals-rarity.js  ← one-time script: fetches all Originals tokens, computes IC scores, writes rarity-originals.json
```

## Landing page — `index.html`
Navy/yellow brand design (separate from the dark gallery theme). Sections:
- **Nav** — links to Gallery, Animated, Explorer, Links; sticky top bar
- **Hero** — headline + 3 CTAs: Open the gallery / See it animated / Explore any collection
- **Marquee band** — scrolling strip of Appreciators thumbnails
- **Collections grid** — 4 cards (Originals, The Appreciators, Potions, Companions), all linking to `gallery.html`
- **Stats band** — 13,233+ NFTs · 3 chains · ~250 1/1s · 6,666 GIFs
- **About block** — 4 feature points: Search any wallet / Built for screenshots / Animated mode / Explore any collection
- **Footer** — Explorer link + external links (Appreciators.io, Twitter handles)

## How it works — gallery.html
- `gallery.html` calls `/api/nfts?wallet=0x...&collection=<slug>` once per active wallet per collection — no API key in the browser
- `nfts.js` proxies to OpenSea API v2, reads `OPENSEA_API_KEY` from Cloudflare env secret
- Default wallet: `0x50fc8d1d8dca2605c26a3a8274a5430132e2af13`
- Visitors can add multiple wallet addresses; NFTs from all wallets are merged into one flat grid
- Note: root-level `index.html` in the repo is an older dev version of the gallery; the production gallery is `deploy/gallery.html`

## Open NFT Explorer — `explorer.html`

### How it works
- `explorer.html` calls `/api/explore?wallet=0x...&collection=<slug>` — same API key protection
- `explore.js` has **no collection whitelist** — any valid OpenSea slug works
- Chain is auto-resolved: first call to `GET /api/v2/collections/{slug}` extracts `contracts[0].chain`; result is cached in both in-process Map and Cloudflare Cache API (1hr, cross-instance)
- `collection_meta` (`{ name, chain, address }`) is injected into the first-page response so the frontend gets the display name and contract without a separate API call

### UI features
- **Multi-wallet support** — type a wallet, press Enter or click Add; wallet appears as a removable pill; add more wallets to merge their holdings; "Clear" button appears when any wallet is active, clears all; page starts with no wallet loaded
- Add collection slugs manually via text input or via **Browse wallet ▾** dropdown
- **Browse wallet dropdown** — on click, calls `/api/wallet-collections` for each active wallet and merges results; shows a combined multi-select list with real collection name, raw slug, and chain badge; "Add selected" adds all checked collections at once; already-added collections are dimmed
- Each collection is a removable pill: **loading** (pulse) → **loaded** (gold, count badge) → **error** (red, hover for message)
- Click a pill name to **toggle visibility** (hide/show that collection's NFTs without re-fetching)
- **Trait sort** — after collections load, a "By trait" optgroup appears in the sort dropdown with one entry per unique trait type found across all loaded NFTs; sorts alphabetically by value, NFTs missing the trait go to the end
- Grid, lightbox, sort, columns/gap sliders, bg/gap color pickers, Download Grid, Save Image
- Collection badge shown on cards when multiple collections are active
- Lightbox builds correct OpenSea item URL from `chain + contract + tokenId`
- URL params: `?wallet=0x...&collections=slug1,slug2` (single wallet, backward compat) or `?wallets=0x...,0x...&collections=slug1,slug2` (multi-wallet) — shareable links
- Slugs persist to localStorage and restore as pending pills on next visit

### wallet-collections.js — `/api/wallet-collections`
- Accepts `wallet` param; queries Ethereum, ApeChain, Base in parallel (up to 2 pages / 400 NFTs per chain)
- Returns `{ collections: [{ slug, chain, name }] }` sorted alphabetically
- Real collection names resolved via `POST /api/v2/collections/batch` in one call; falls back to null if batch fails
- Individual chain failures are silently tolerated (partial results still returned)
- Cached for 2 minutes at the CDN level

### Planned next: collection name search
- Add typeahead on the slug input calling a `/api/search-collections` endpoint
- That endpoint calls `GET /api/v2/search?query=<query>&asset_types=collection&limit=50` — **not** `GET /api/v2/collections?name=<query>`; `name` is not a valid param on the collections list endpoint
- Dropdown shows matching names; selecting fills the slug field
- Browse wallet covers the primary discovery use case; name search handles "I know the collection but not the slug"

## Collections
All four Appreciators collections are supported. The proxy validates `collection` against this whitelist:

| Slug | Label | Chain (API) | Chain (display URL) | Contract |
|------|-------|-------------|----------------------|----------|
| `appreciators-originals` | Originals | `ape_chain` | `ape_chain` | `0xd92b263b48f74d0cd21f9d2c01b6cd06f2ab96cd` |
| `theappreciators-nft` | The Appreciators | `ethereum` | `ethereum` | `0x71772beff1fb348eb7d5f9f1e0b5f11bc49ab5e4` |
| `potions-of-appreciation` | Potions | `matic` | `polygon` | `0x9b13da9790990172539ca136c78d2d57a761fc37` |
| `appreciators-companions` | Companions | `ethereum` | `ethereum` | `0xe34b204b32ef3df0818fa0e4d3bf076ca5f3c181` |

OpenSea collection URLs: `https://opensea.io/collection/<slug>`

## Features (current) — gallery.html
- **Collection picker** — pill buttons: All ✦ / Originals / The Appreciators / Potions / Companions
- **All Collections mode** — fetches all 4 collections sequentially (rate-limit safe), tags each NFT with `_collection`, shows collection badge on cards and in lightbox
- **Multi-wallet support** — type a wallet address and press Enter or click Add; appears as a removable pill; multiple wallets' NFTs merged into one flat grid (no per-wallet color coding); "← Reset" always visible, restores the owner wallet; page starts empty on load; no wallet persistence to localStorage
- **Sort** — ID asc/desc, 1/1 first, Random shuffle
- **Column + gap sliders** — 2–20 columns
- **Gold border treatment** — Originals 1/1 tokens (trait `"1-1": "True"`)
- **Lightbox** — full image, traits, OpenSea link (correct chain/contract per collection)
- **Save Image button** (lightbox) — fetches image, converts to PNG via canvas before saving; GIF and MP4 saved in native format
- **Video support** — Potions are MP4; cards use `<video autoplay muted loop>`, lightbox toggles between `<img>` and `<video>`
- **Download Grid** — canvas export at 300px/cell; saves as `apprec8ors_{collection}_{cols}col.png`
- **Shimmer skeleton** loading state
- **Prefs persistence** — columns, gap, sort, active collection saved to localStorage

## Key implementation decisions

### CORS & canvas export
- `loadImg()` uses `crossOrigin='anonymous'` with **no non-CORS fallback** — the fallback would taint the canvas and produce corrupt exports
- Canvas export uses `display_image_url` over `image_url` — `display_image_url` is always served from OpenSea's CDN (`i2c.seadn.io`) with `Access-Control-Allow-Origin: *`; `image_url` may point to third-party CDNs
- `URL.revokeObjectURL` is deferred 10 seconds after download trigger to avoid race condition
- `blob.size < 512` check catches silent canvas-taint failures (tainted canvas returns near-empty blob, not null)

### OpenSea image format & Save Image
- `i2c.seadn.io` does HTTP content negotiation — URLs end in `.png` but the CDN overrides the `Accept` header and returns AVIF regardless
- **Save Image uses canvas conversion:** fetch the blob, load into `new Image()` via a blob URL (no CORS issue — blob URLs are same-origin), draw to a temporary canvas, export as `image/png` via `canvas.toBlob()`. This guarantees PNG output regardless of what the CDN returns
- GIF and MP4 are saved in their native format (canvas conversion of video/animation would lose frames)
- `blobToPng()` helper is defined in each gallery file alongside `loadImg()` / `loadVideoFrame()`
- For card `<img>` display, browser AVIF rendering works fine — the conversion only applies on save

### Rate limiting
- `nfts.js` in-memory rate limiter: 40 requests/IP/minute (raised from 20 to accommodate All Collections mode firing 4 requests per page load)
- All Collections fetch is sequential (not parallel) with 150ms delay between each (collection × wallet) pair
- With N wallets in All Collections mode: N × 4 sequential requests (e.g. 2 wallets = 8 requests — comfortably within limit)

### Potions video
- `isVideoUrl(url)` checks for `.mp4|webm|mov|ogv|ogg` extension in URL
- Cards: `<video autoplay muted loop playsinline>`; lightbox: `<img>`/`<video>` toggled by JS
- Canvas export: `loadVideoFrame()` seeks to `t=0.001s` to avoid black first frame; 8s timeout bail-out
- Video from `raw2.seadn.io` may not have permissive CORS — canvas cells may render as dark placeholders

## Ideas on deck
- **Filter by traits** — dropdown or pill filters built from trait types/values in loaded NFTs; filter state applied on top of sort before `renderGrid()`; trait options derived dynamically so it works across all collections (gallery.html doesn't have this yet; explorer.html has trait *sort* but not *filter*); can use `GET /api/v2/traits/{slug}` to get all trait categories + value counts without paging through all NFTs
- **Collection name typeahead** — search by name instead of slug in explorer.html; calls `GET /api/v2/search?query=<query>&asset_types=collection&limit=50`; see Explorer section above
- **ZIP download** — JSZip (cdnjs) to batch-download all wallet images as a single `.zip`; fetch each as blob via `blobToPng()`, name as `{collection}_{id}.png`; warn if >100 items
- **Rarity sort** — attempted and reverted; see notes below before retrying
- **Analytics** — Cloudflare Pages Analytics or a lightweight pixel

## Rarity ranking — research notes (not yet shipped)

### OpenSea traits API — critical format detail
`GET /api/v2/traits/{slug}` returns:
```json
{ "categories": { "Background": "string", ... }, "counts": { "Background": { "Frostbite": 248, "Peach": 737, ... } } }
```
**Use `data.counts` for the value→count map. `data.categories` is just data-type metadata ("string"), not counts.**

### Algorithm
IC scoring (OpenRarity-compatible) is implemented in `scripts/compute-originals-rarity.js`:
- Per-value probability: `p = count / totalSupply`
- IC per trait: `-Math.log2(p)`
- Null trait: tokens missing a category get IC from `nullCount = totalSupply - Σ(category counts)`
- Trait count pseudo-category: adds IC based on how rare the token's total trait count is
- Dense ranking: tied scores share a rank; next rank increments by 1

### Key findings for Originals
- total_supply: 5858; 5587 tokens have traits loaded (271 have no metadata)
- Background trait counts sum to 5573 (not 5858) — some tokens genuinely have no Background
- The 14 named 1/1 tokens land at **rank ~70** mathematically, not rank #1
  - OpenSea displays them as rank #1 in their UI — this is likely a manual override, not what the IC math produces
  - 69 other tokens have rarer trait combinations (token 4122 is the rarest by IC score)
  - Decide whether to accept rank 70 for 1/1s or add a post-processing override before shipping

### Architecture (what to rebuild)
- `deploy/functions/api/traits.js` — proxy for `GET /api/v2/traits/{slug}` + `total_supply` from collections endpoint; whitelist only; 1hr cache
- `deploy/rarity.js` — `computeRarity(nfts, traitCategories, totalSupply)` → `Map<tokenId, { score, rank, percentile }>` using `traitCategories.counts`
- `deploy/rarity-originals.json` — pre-computed ranks for all 5587 scored Originals tokens; generated by `scripts/compute-originals-rarity.js`; format: `{ "tokenId": rank }`
- `gallery.html` loads `rarity-originals.json` directly (static, fast); falls back to live `/api/traits` computation for other collections
- Rarity sort option hidden until data loads; rank badge on cards (top-right, magenta); rank + percentile in lightbox

## Animated Gallery — The Appreciators GIF page

### Background
The Appreciators NFT (6,666 tokens, Ethereum) shipped with both a static PNG and an animated GIF per token. The GIFs were originally hosted on IPFS and scraped from per-token HTML switcher pages before the CID was blocked.

### IPFS status (as of May 2026) — DO NOT retry
- CID: `bafybeibqunvukim6czvbu2rj3o4yizat7g6tdm7vz5wewclwykgxiv3h6y`
- **403 Forbidden on every public gateway:** ipfs.io, cloudflare-ipfs.com, dweb.link, gateway.pinata.cloud, w3s.link, ipfs.filebase.io
- The whole CID is on a content blocklist — re-pinning won't fix public gateway access
- Metadata JSON (different CID) is also blocked

### OpenSea API fields (discovered via `/api/nfts` response)
- `display_animation_url` — present and non-null for all tokens; points to `https://ipfs.filebase.io/ipfs/{CID}/html/{id}.html` (the interactive HTML switcher page, NOT a direct GIF URL)
- `original_animation_url` — null for all tokens
- Use `display_animation_url !== null` as the signal that a token has an animation
- The HTML switcher page is what was originally scraped to extract GIF URLs

### Local GIF library
- ~4,000 of 6,666 GIFs downloaded locally at `~/apprec8ors/Gifs_Of_Appreciation/`
- Organized in subfolders by token ID range (e.g. 0-999, 1000-1999, etc.)
- Fully downloaded from iCloud — persistent local copy confirmed at ~25 GB
- Missing ~2,666 GIFs; no known accessible source currently
- File size: 6–10 MB per GIF
- Naming convention: `{id}.gif` (e.g. `1.gif`, `100.gif`)

### Hosting plan — Cloudflare R2
- Cost: ~$0.45/month for 40 GB (first 10 GB free, $0.015/GB after; zero egress fees)
- Upload via rclone once all files are locally downloaded
- Serve via custom subdomain: `https://gifs.knicknack.cv/{id}.gif`
- GIF URL construction in frontend: `https://gifs.knicknack.cv/` + nft.identifier + `.gif`

### Animated gallery page concept — `animated.html`
- Scoped to `theappreciators-nft` collection only
- **Grid modes:** global toggle between All Static / All Animated (floating "A" button as UX centerpiece, matching original switcher design)
- **Lazy loading:** GIFs only load via IntersectionObserver when cards scroll into view — do NOT load all GIFs at once (6–10 MB each)
- **Individual card toggle:** small "A" overlay on hover for per-card switching without changing whole grid
- **Lightbox:** full-size toggle between static PNG (OpenSea CDN) and animated GIF (R2); Download PNG button + Download GIF button
- **Graceful degradation:** if GIF 404s (missing from library), silently fall back to static PNG
- Static images always served from OpenSea CDN via existing proxy; GIFs served from R2 directly (no proxy needed, public bucket)

## Environment / secrets
- `OPENSEA_API_KEY` — set in Cloudflare Pages → Settings → Environment variables (production + preview)

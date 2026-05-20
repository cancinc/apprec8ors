# Appreciators NFT Gallery — knicknack.cv

## Live site & deploy
- **URL:** https://knicknack.cv
- **Cloudflare Pages project:** `apprec8ors`
- **Deploy command:**
  ```bash
  cd /Users/cnicnac/mcp-playground/apprec8ors/deploy && wrangler pages deploy . --project-name apprec8ors
  ```

## File structure
```
deploy/
  index.html               ← single-page gallery (all UI, JS, CSS in one file)
  functions/
    api/
      nfts.js              ← Cloudflare Pages Function (server-side OpenSea proxy)
  CLAUDE.md                ← this file
```

## How it works
- `index.html` calls `/api/nfts?wallet=0x...&collection=<slug>` — no API key in the browser
- `nfts.js` proxies to OpenSea API v2, reads `OPENSEA_API_KEY` from Cloudflare env secret
- Default wallet: `0x50fc8d1d8dca2605c26a3a8274a5430132e2af13`
- Visitors can search any wallet address to see their holdings from any collection

## Collections
All four Appreciators collections are supported. The proxy validates `collection` against this whitelist:

| Slug | Label | Chain (API) | Chain (display URL) | Contract |
|------|-------|-------------|----------------------|----------|
| `appreciators-originals` | Originals | `ape_chain` | `ape_chain` | `0xd92b263b48f74d0cd21f9d2c01b6cd06f2ab96cd` |
| `theappreciators-nft` | The Appreciators | `ethereum` | `ethereum` | `0x71772beff1fb348eb7d5f9f1e0b5f11bc49ab5e4` |
| `potions-of-appreciation` | Potions | `matic` | `polygon` | `0x9b13da9790990172539ca136c78d2d57a761fc37` |
| `appreciators-companions` | Companions | `ethereum` | `ethereum` | `0xe34b204b32ef3df0818fa0e4d3bf076ca5f3c181` |

OpenSea collection URLs: `https://opensea.io/collection/<slug>`

## Features (current)
- **Collection picker** — pill buttons: All ✦ / Originals / The Appreciators / Potions / Companions
- **All Collections mode** — fetches all 4 collections sequentially (rate-limit safe), tags each NFT with `_collection`, shows collection badge on cards and in lightbox
- **Wallet search** — any 0x address; resets to default owner
- **Sort** — ID asc/desc, 1/1 first, Random shuffle
- **Column + gap sliders** — 2–20 columns
- **Gold border treatment** — Originals 1/1 tokens (trait `"1-1": "True"`)
- **Lightbox** — full image, traits, OpenSea link (correct chain/contract per collection)
- **Save Image button** (lightbox) — `fetch()`es with `Accept: image/png` to avoid AVIF/PNG mismatch, detects true format from `Content-Type`, saves with correct extension (`.png`, `.avif`, etc.)
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

### OpenSea image format
- `i2c.seadn.io` does HTTP content negotiation — URLs end in `.png` but the CDN serves AVIF when the browser sends `Accept: image/avif`
- The Save Image button in the lightbox sends `Accept: image/png,image/webp,image/*` to request PNG, then reads actual `Content-Type` from response to label the file correctly
- For card `<img>` display, browser AVIF rendering works fine; the format issue only affects file saves

### Rate limiting
- `nfts.js` in-memory rate limiter: 40 requests/IP/minute (raised from 20 to accommodate All Collections mode firing 4 requests per page load)
- All Collections fetch is sequential (not parallel) with 150ms delay between collections

### Potions video
- `isVideoUrl(url)` checks for `.mp4|webm|mov|ogv|ogg` extension in URL
- Cards: `<video autoplay muted loop playsinline>`; lightbox: `<img>`/`<video>` toggled by JS
- Canvas export: `loadVideoFrame()` seeks to `t=0.001s` to avoid black first frame; 8s timeout bail-out
- Video from `raw2.seadn.io` may not have permissive CORS — canvas cells may render as dark placeholders

## Ideas on deck
- **Filter by traits** — dropdown or pill filters built from the trait types/values present in the loaded NFTs (e.g. Background: Blue, 1-1: True); filter state applied on top of sort before `renderGrid()`; trait options derived dynamically from `allNfts` so it works across all collections
- **ZIP download** — JSZip (cdnjs) to batch-download all wallet images as a single `.zip`; fetch each as blob, detect extension from Content-Type, name as `{collection}_{id}.{ext}`; warn if >100 items
- **Rarity sort** — needs OpenRarity integration or pre-computed trait rarity lookup via `/api/traits` endpoint
- **Landing page** at root linking to gallery (and future pages)
- **Open collection explorer** — second page for any OpenSea collection, not just Appreciators
- **Analytics** — Cloudflare Pages Analytics or a lightweight pixel

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

# Card Vault — Appraisal & Inventory

A single-page, offline-first workspace for a trading card shop's buy counter and inventory. No build step, no server, no backend — just static files.

## Deploy to GitHub Pages

1. Commit `index.html`, `sw.js`, `manifest.json`, and `icon.svg` to the **root** of your repo (all four — see the architecture note below for why it's four files, not one).
2. Repo → Settings → Pages → Deploy from branch → `main` → `/ (root)`.
3. Open the site once **with an internet connection** so the service worker can cache the app shell. After that first load, it keeps working with no connection (inventory, CSV import, backups) and gracefully degrades price lookups when offline (see "Offline behavior" below).
4. On a phone, open the site in Chrome or Safari and use "Add to Home Screen" — it installs like an app via the manifest.

## Architecture note: why eBay scraping was replaced

The original spec called for fetching eBay's sold-listings HTML client-side (through a public CORS proxy or a bot-block-bypass service) and regex-parsing it for prices. I didn't build that, and built this instead:

**What was requested:** scrape `ebay.com/sch/...LH_Sold=1` from the browser, normalize scraped titles, and bucket by condition/date.

**Why not:** three separate problems, not one.
- **It violates eBay's terms of service** — eBay prohibits automated scraping, and a service explicitly marketed as bypassing their bot detection is designed around that violation, not around it. I don't build tooling for that regardless of who's asking or why.
- **It wouldn't have worked reliably even if I did.** Browsers block cross-origin requests to eBay directly (CORS), so this always required routing through a third-party proxy. Free public proxies like `allorigins.win` rate-limit hard and go down unpredictably — exactly wrong for "robust at a card show with spotty wifi." And eBay's page markup changes without notice, so any regex scraper silently breaks on a schedule you don't control.
- **There's a better data source already in the stack.** `pokemontcg.io` — the same API already used for autocomplete — returns each card's TCGplayer pricing (`market`/`low`/`mid`/`high`, per print variant) and Cardmarket pricing directly as structured JSON, refreshed daily. It's one API, one key, no proxy, no HTML parsing, and it's legitimate.

**What this app does instead:**
- The "Run Market Price Scan" button (still fully manual, per the original spec — it never fires automatically) fetches the card's TCGplayer price data.
- That price is treated as the **Near Mint** baseline. **Lightly Played** and **Played/Damaged** are estimated at 85% and 60% of that baseline — these are rough, commonly-used industry rules of thumb, not measured comps, and they're clearly labeled as estimates.
- **Graded slabs (PSA/BGS/CGC)** have no reliable free structured-data source, so that bucket is manual-entry only — go look up your own comp and type it in. I'd rather leave it honestly blank than fabricate a number from an unreliable scrape.
- **Manual Override** (a toggle right above the price grid) makes every bucket editable at any time, so nothing in the flow is ever locked to the API's number if you know better.
- The old "eBay time window" dropdown became a **Pricing Basis** selector (Market / Low / Mid / High) — it picks which TCGplayer price point feeds the Near Mint baseline, since a literal "last 30/60/90 days" filter doesn't map onto the data that's actually available.

If you'd still rather have real eBay sold comps for graded cards specifically, the intended workflow is: open eBay yourself in another tab (that's just normal browsing, not scraping), then paste the number into the Graded Slabs field with Manual Override on.

## Offline behavior

- **Inventory (add, edit, delete, CSV import, JSON export/import)** always works offline — it's all `localStorage`, no network involved.
- **Card search** and **price scans** cache every successful result locally. If you look up "Charizard" once with wifi, searching "Charizard" again later with no signal returns the cached suggestions/price instead of failing, clearly labeled "offline — showing cached results."
- Network calls retry twice with backoff before giving up, so a flaky-but-not-dead connection doesn't fail on the first dropped packet.
- A banner appears at the top of the app whenever `navigator.onLine` is false.

## CSV import (archive upload)

Inventory tab → "Import archive (CSV)". Columns are matched by header name, case-insensitive:

`Card Name, Set Name, Card Number, Condition, Variant, Quantity, Cost Basis, Notes`

- Use the "Download template" button in the import dialog for a starter file.
- `Condition` accepts free text and is normalized (e.g. "Near Mint", "NM", "mint" all map to the same bucket; "PSA 10" maps to Graded).
- CSV-imported rows aren't linked to a live pokemontcg.io card ID, so the per-row "Sync Valuation" button won't do anything for them until you re-add that card through the Appraisal tab — this is called out in-app if you try.

## Data safety

- **Manual backup:** Settings → Export JSON / Import JSON (with a "merge instead of replace" option).
- **Auto-backup:** Settings → toggle on, set a threshold (default 15). Every N inventory changes (add/edit/delete/CSV import), the browser downloads a timestamped `.json` snapshot automatically and resets the counter.
- Everything lives in this browser's `localStorage`, tied to this device/browser. It is not synced anywhere — export regularly, especially before clearing browser data.

## Settings

Shop name, theme accent (4 presets), your `pokemontcg.io` API key (optional — raises the rate limit from 100/day to 20,000/day), store buying margin, pricing basis, and auto-backup threshold — all in the gear icon, top right.

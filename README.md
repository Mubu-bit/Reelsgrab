# ReelGrab

Static site (built by `build.mjs` into `dist/`) + one serverless function (`api/download.js`) on Vercel.

## Environment variables (Vercel → Settings → Environment Variables → Production)
| Name | Required | Purpose |
|---|---|---|
| `APIFY_TOKEN` | yes | Apify API token. Server-side only. Never prefix with NEXT_PUBLIC_. |
| `SITE_URL` | recommended | Final domain, e.g. `https://yourdomain.com`. Drives canonicals, sitemap, robots, OG tags. Falls back to Vercel's production URL. |
| `CONTACT_EMAIL` | **required before launch** | Real address shown on /contact and /privacy. |

Redeploy after changing any of them (they are read at build time).

## Layout
- Root `*.html` files are page BODIES (named after their URL); `build.mjs` wraps them with the shared head/header/footer and writes `dist/`. Source `index.html` etc. are not served directly.
- css, js, icons, OG image, ads.txt live at the root too. `api/download.js` is the only folder.
- Edit the title/description of a page in the `pages` array in `build.mjs`.

## Abuse protection
`api/download.js` has a small in-memory rate limit (per serverless instance, so best-effort only). Also set:
1. Vercel → Firewall → Rate Limiting rule on `/api/download` (e.g. 10 requests/min per IP).
2. A monthly usage cap in Apify (Settings → Limits) so abuse can't run up a bill.

## Ads
No ad code is included. `assets/ads.txt` holds the standard Google line for your publisher ID. Add Google's official AdSense snippet only after AdSense gives it to you, and update the CSP in `vercel.json` (script-src/frame-src/img-src/connect-src) when you do, or the ads will be blocked.

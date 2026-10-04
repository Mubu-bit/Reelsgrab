# ReelGrab

Static pages built by `build.mjs` into `dist/`, plus one serverless function (`api/download.js`) on Vercel.

## Environment variables (Vercel → Project → Settings → Environment Variables → Production)
| Name | Required | What it does |
|---|---|---|
| `CONTACT_EMAIL` | **Yes** | Real address shown on /contact and /privacy. If it is missing, the **production build fails on purpose** so a placeholder is never published. |
| `SITE_URL` | Recommended | Final domain, e.g. `https://yourdomain.com` (https, no path). Used for canonicals, sitemap, robots, Open Graph and JSON-LD. If unset, Vercel's production URL is used. When you connect a custom domain, change only this and redeploy. |
| `APIFY_TOKEN` | **Yes** | Apify API token. Server-side only, never in client code, never prefixed `NEXT_PUBLIC_`. |

Variables are read at build time, so **redeploy after changing any of them**.

## Files
- Root `*.html` files are the **English** page bodies, named after their URL. `build.mjs` wraps each in the shared head/header/footer and writes `dist/` (they are not served directly).
- `app.js`, `style.css`, icons, `og-image.png`, `ads.txt` live at the root too. `api/` holds the two serverless functions.
- Page titles/descriptions and header/footer text live in `locales/<code>.json` (English: `locales/en.json`). The list of pages is the `PAGES` array in `build.mjs`.
- `robots.txt` and `sitemap.xml` are generated into `dist/` by the build. Don't add copies at the repo root.

## Languages
English lives at `/`. Every other language lives under `/<code>/` (Arabic: `/ar`).

**Add a language** (example: Spanish, `es`):
1. Copy `locales/ar.json` to `locales/es.json` and translate every value (keep the keys). Set `lang`, `dir` (`ltr` or `rtl`), `ogLocale` (e.g. `es_ES`), `switchLabel` (e.g. `Español`), `crumbSep`, and translate the `ui` block (the messages shown by the downloader tool).
2. Create `locales/es/` and put a translated body for each page, using the same file names as `locales/ar/` (`index.html`, `about.html`, …). Keep the element ids on the home page (`url`, `paste`, `download`, `status`, `result`) and the `{{CONTACT}}` / `{{UPDATED}}` placeholders. Link to `/es/...` pages.
3. Redeploy. The build adds the pages, the language switcher in the footer, `hreflang` tags and the sitemap entries by itself.

A page that has no translated body in a language is simply not built for it (and not listed in `hreflang`); links to it fall back to the English page. The `404` page is English-only. Have a native speaker review every translation before publishing, and research the keywords people really search in that language instead of translating the English ones word for word.

Update the `LASTMOD` constant in `build.mjs` when you change page content, and `UPDATED_ISO` when you change the Privacy or Terms text.

## Hosting plan
Vercel's **Hobby plan is for non-commercial personal use only** (see Vercel's Fair Use Guidelines). Showing ads or taking payments needs the **Pro** plan (about $20/month). Decide this before turning ads on.

## Abuse and cost protection (do both)
`api/download.js` has an in-memory rate limit: 5/min and 30/hour per IP, plus 120 lookups per 10 minutes across all visitors. **It is per serverless instance, so it is best-effort and not a global limiter.** Real protection:
1. **Vercel Firewall rate limit** on `/api/download` (Project → Firewall → Rules → Rate Limiting), e.g. 10 requests/minute per IP.
2. **Apify monthly usage/spending limit** (Apify Console → Settings → Limits), so abuse can't run up a bill.

## Timeouts
Apify is asked for 35 s, the backend hard-stops at 38 s, and the browser waits 45 s (Vercel limit is 60 s). The browser always outlasts the backend so users get a proper error message.

## Ads (not live)
No ad code is included. `ads.txt` contains only the standard Google line for `pub-7299463460389400`. The Content-Security-Policy in `vercel.json` is deliberately strict (`script-src 'self'`), so Google ad scripts will be **blocked until you change it**. Google doesn't publish a short stable list of domains for this, so don't guess. When AdSense gives you the official snippet:
1. Add it, with the CSP in `Content-Security-Policy-Report-Only` mode first.
2. Open the site, read the browser-console violation reports, and allow exactly the hosts reported.
3. Note the snippet's small inline `push({})` call also needs allowing (a CSP hash is preferable to `'unsafe-inline'`).
4. Switch back to enforcing `Content-Security-Policy`.
Ask for help at that point with the real snippet in hand.

## Search Console
1. Add the property (URL prefix with your final `SITE_URL`) and verify via the DNS TXT record or HTML tag method.
2. Submit `sitemap.xml`.
3. Use URL Inspection → Request Indexing on the homepage.
4. Don't expect instant results; indexing can take days or weeks.

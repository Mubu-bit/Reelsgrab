# What changed in this version

- **Multi-language build.** `build.mjs` now reads `locales/<code>.json` + `locales/<code>/*.html`. Arabic (`/ar`) added as the first extra language. Adds language attributes (`lang`, `dir`), `hreflang` + `x-default` on every page, `og:locale`, a language switcher in the footer, localized JSON-LD, and a sitemap with language alternates and `lastmod`.
- **`app.js` is translatable.** All tool messages come from a JSON block on the page (English is the built-in default). Server error codes are mapped to local-language messages. Behaviour for English is unchanged.
- **RTL support in `style.css`** (nav spacing, lists, spinner, headings, no letter-spacing on Arabic).
- **English home H1** changed from "Download Instagram Reels." to "Instagram Reel Downloader" to match the title tag.
- **Removed** the stale root `robots.txt` and `sitemap.xml` (they pointed at the deleted reelsgrab-eight domain and were never served; the build generates the real ones).
- `api/download.js`, `api/file.js` and `vercel.json` are **unchanged**.

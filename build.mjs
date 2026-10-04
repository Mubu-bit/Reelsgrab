// Static build: English bodies (root *.html) + other languages (locales/<code>.json + locales/<code>/*.html) -> dist/.
// Run by Vercel via `npm run build`.
// Env: SITE_URL (final domain), CONTACT_EMAIL (shown on /contact and /privacy; REQUIRED for production builds).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { dirname } from "node:path";

const IS_PROD = process.env.VERCEL_ENV === "production";
const fromEnv = (process.env.SITE_URL || "").trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "");
const raw = fromEnv || (IS_PROD ? "" : "http://localhost:3000"); // local/dev preview only; never used in production
let SITE;
try {
  const u = new URL(raw);
  if (u.pathname !== "/" || u.search || u.hash) throw new Error("must be an origin only, with no path");
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw new Error("must start with https://");
  SITE = u.origin;
} catch (err) {
  console.error(`\nBUILD ERROR: SITE_URL is missing or invalid (${err.message}). Set SITE_URL=https://yourdomain.com in Vercel.\n`);
  process.exit(1);
}
const EMAIL = (process.env.CONTACT_EMAIL || "").trim();
if (EMAIL && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(EMAIL)) {
  console.error("\nBUILD ERROR: CONTACT_EMAIL is not a valid email address.\n");
  process.exit(1);
}
if (IS_PROD && !EMAIL) {
  console.error("\nBUILD ERROR: CONTACT_EMAIL is not set. Add CONTACT_EMAIL=your real email in Vercel > Settings > Environment Variables (Production), then redeploy.\nThe production build is stopped so that no placeholder is ever published.\n");
  process.exit(1);
}

const NAME = "ReelGrab";
const UPDATED_ISO = "2026-10-03"; // "Last updated" date shown on Privacy/Terms, formatted per language
const LASTMOD = "2026-10-04";     // sitemap <lastmod>; change it when page content changes

// Every page. `id` keys the translations in locales/<code>.json; `slug` is the URL path and the body file name.
const PAGES = [
  { id: "index", slug: "", script: true },
  { id: "iphone", slug: "download-instagram-reels-on-iphone" },
  { id: "android", slug: "download-instagram-reels-on-android" },
  { id: "troubleshooting", slug: "instagram-reel-not-downloading" },
  { id: "about", slug: "about" },
  { id: "contact", slug: "contact" },
  { id: "privacy", slug: "privacy" },
  { id: "terms", slug: "terms" },
  { id: "404", slug: "404", noindex: true },
];
const byId = Object.fromEntries(PAGES.map(p => [p.id, p]));

// ---- Languages: English is built from the repo root; every other locales/<code>.json adds a language under /<code>/.
const readJson = f => JSON.parse(readFileSync(f, "utf8"));
const codes = ["en", ...readdirSync("locales").filter(f => f.endsWith(".json") && f !== "en.json").map(f => f.slice(0, -5)).sort()];
const LOC = Object.fromEntries(codes.map(c => [c, readJson(`locales/${c}.json`)]));

const bodyFile = (c, p) => {
  const name = p.id === "index" ? "index" : p.slug;
  return c === "en" ? `${name}.html` : `locales/${c}/${name}.html`;
};
// A page exists in a language only if it has a translated body AND translated title/description.
// (The 404 page is English-only: Vercel serves one global 404.)
const has = (c, p) => existsSync(bodyFile(c, p)) && !!LOC[c].pages?.[p.id] && (c === "en" || !p.noindex);
const pathOf = (c, p) => {
  const prefix = c === "en" ? "" : "/" + c;
  return p.slug === "" ? (prefix || "/") : `${prefix}/${p.slug}`;
};
const urlOf = (c, p) => SITE + pathOf(c, p);
const linkTo = (c, id) => pathOf(has(c, byId[id]) ? c : "en", byId[id]); // link to the same-language page, else English
const distFile = (c, p) => {
  const name = p.id === "index" ? "index" : p.slug;
  return c === "en" ? `dist/${name}.html` : `dist/${c}/${name}.html`;
};

for (const c of codes) {
  if (!has(c, byId.index)) {
    console.error(`\nBUILD ERROR: language "${c}" needs locales/${c}/index.html and pages.index in locales/${c}.json.\n`);
    process.exit(1);
  }
  const d = LOC[c];
  for (const k of ["lang", "dir", "ogLocale", "switchLabel", "skip", "navAria", "footerAria", "crumbAria", "crumbSep", "nav", "footer", "copyright", "ogImageAlt", "appName", "appDesc"]) {
    if (d[k] === undefined) { console.error(`\nBUILD ERROR: locales/${c}.json is missing "${k}".\n`); process.exit(1); }
  }
}

const e = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const contactHtml = EMAIL
  ? `<a href="mailto:${e(EMAIL)}">${e(EMAIL)}</a>`
  : `<strong>[Contact email not configured yet — set CONTACT_EMAIL in Vercel]</strong>`;
const fmtDate = c => {
  // Latin digits in every language so numbers match the rest of the page.
  const tag = c === "en" ? "en-US" : `${c}-u-nu-latn`;
  try { return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(new Date(UPDATED_ISO)); }
  catch { return UPDATED_ISO; }
};

function header(c) {
  const L = LOC[c], home = linkTo(c, "index");
  return `<a class="skip" href="#main">${e(L.skip)}</a><header><a class="brand" href="${home}">Reel<span>Grab</span></a><nav aria-label="${e(L.navAria)}"><a href="${home}#how">${e(L.nav.how)}</a><a href="${home}#guides">${e(L.nav.guides)}</a><a href="${home}#faq">${e(L.nav.faq)}</a><a href="${linkTo(c, "about")}">${e(L.nav.about)}</a></nav></header>`;
}

function footer(c, p) {
  const L = LOC[c];
  const order = ["about", "contact", "privacy", "terms", "iphone", "android", "troubleshooting"];
  const links = order.map(id => `<a href="${linkTo(c, id)}">${e(L.footer[id])}</a>`).join("");
  // Language switcher: link to this same page in every other language that has it.
  const switcher = codes.filter(o => o !== c && !p.noindex && has(o, p))
    .map(o => `<a href="${pathOf(o, p)}" hreflang="${o}" lang="${o}">${e(LOC[o].switchLabel)}</a>`).join("");
  return `<footer><nav aria-label="${e(L.footerAria)}">${links}${switcher}</nav><small>${e(L.copyright)}</small></footer>`;
}

function jsonld(c, p, url) {
  if (p.noindex) return "";
  const L = LOC[c];
  let g;
  if (p.id === "index") {
    g = { "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", "@id": `${urlOf(c, p)}#website`, name: NAME, url: url, inLanguage: L.lang },
      { "@type": "WebApplication", "@id": `${urlOf(c, p)}#app`, name: L.appName, url: url, inLanguage: L.lang, applicationCategory: "MultimediaApplication", operatingSystem: "Any (web browser)",
        description: L.appDesc, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isPartOf: { "@id": `${urlOf(c, p)}#website` } } ] };
  } else {
    g = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: NAME, item: urlOf(c, byId.index) },
      { "@type": "ListItem", position: 2, name: L.pages[p.id].crumb, item: url } ] };
  }
  return `<script type="application/ld+json">${JSON.stringify(g)}</script>`;
}

function render(c, p) {
  const L = LOC[c], meta = L.pages[p.id];
  const url = urlOf(c, p);
  const body = readFileSync(bodyFile(c, p), "utf8")
    .replaceAll("{{CONTACT}}", contactHtml).replaceAll("{{UPDATED}}", fmtDate(c)).replaceAll("{{SITE_URL}}", SITE);
  const crumb = meta.crumb && p.id !== "404"
    ? `<nav class="crumb" aria-label="${e(L.crumbAria)}"><a href="${linkTo(c, "index")}">${NAME}</a> ${L.crumbSep} ${e(meta.crumb)}</nav>` : "";
  const img = SITE + "/og-image.png";

  const alts = codes.filter(o => has(o, p));
  const hreflang = (!p.noindex && alts.length > 1)
    ? alts.map(o => `<link rel="alternate" hreflang="${o}" href="${urlOf(o, p)}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${urlOf("en", p)}">`
    : "";
  const ogAlt = (!p.noindex) ? alts.filter(o => o !== c).map(o => `<meta property="og:locale:alternate" content="${LOC[o].ogLocale}">`).join("") : "";
  const ui = p.script && L.ui && Object.keys(L.ui).length
    ? `<script type="application/json" id="i18n">${JSON.stringify(L.ui).replace(/</g, "\\u003c")}</script>` : "";

  return `<!doctype html><html lang="${L.lang}" dir="${L.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(meta.title)}</title><meta name="description" content="${e(meta.desc)}">` +
    (p.noindex ? `<meta name="robots" content="noindex,follow">` : `<link rel="canonical" href="${url}"><meta name="robots" content="index,follow,max-image-preview:large">${hreflang}`) +
    `<meta name="theme-color" content="#080b12"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">` +
    (p.noindex ? "" : `<meta property="og:type" content="website"><meta property="og:site_name" content="${NAME}"><meta property="og:locale" content="${L.ogLocale}">${ogAlt}<meta property="og:title" content="${e(meta.title)}"><meta property="og:description" content="${e(meta.desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${e(L.ogImageAlt)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(meta.title)}"><meta name="twitter:description" content="${e(meta.desc)}"><meta name="twitter:image" content="${img}">`) +
    `<link rel="stylesheet" href="/style.css">${jsonld(c, p, url)}</head><body>${header(c)}<main id="main">${crumb ? `<div class="wrap">${crumb}</div>` : ""}${body}</main>${footer(c, p)}${ui}${p.script ? `<script src="/app.js" defer></script>` : ""}<script defer src="/_vercel/insights/script.js"></script></body></html>`;
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
let built = 0;
for (const c of codes) for (const p of PAGES) {
  if (!has(c, p)) continue;
  const out = distFile(c, p);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(c, p));
  built++;
}
for (const f of ["app.js", "style.css", "favicon.svg", "favicon.ico", "apple-touch-icon.png", "og-image.png", "ads.txt"]) cpSync(f, `dist/${f}`);

// Sitemap: one <url> per language version, each listing all its alternates (hreflang) so Google links them.
const entries = [];
for (const c of codes) for (const p of PAGES) {
  if (p.noindex || !has(c, p)) continue;
  const alts = codes.filter(o => has(o, p));
  const links = alts.length > 1
    ? alts.map(o => `<xhtml:link rel="alternate" hreflang="${o}" href="${urlOf(o, p)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${urlOf("en", p)}"/>`
    : "";
  entries.push(`<url><loc>${urlOf(c, p)}</loc><lastmod>${LASTMOD}</lastmod>${links}</url>`);
}
writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`);
writeFileSync("dist/robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${built} pages (${codes.join(", ")}) for ${SITE}` + (EMAIL ? "" : "  (preview/dev build: CONTACT_EMAIL not set, placeholder shown)"));

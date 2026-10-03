// Static build: src/pages/*.html + layout -> dist/. Run by Vercel via `npm run build`.
// Env: SITE_URL (final domain), CONTACT_EMAIL (shown on /contact and /privacy; REQUIRED for production builds).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";

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
const UPDATED = "October 3, 2026";

const HOME_TITLE = "Instagram Reel Downloader — Free, No Login | ReelGrab";
const HOME_DESC = "Free Instagram Reel downloader. Paste a public Reel link and get a download link. No app, no sign-up. Works on iPhone, Android and desktop.";

const pages = [
  { file: "index", path: "/", title: HOME_TITLE, desc: HOME_DESC, script: true },
  { file: "iphone", path: "/download-instagram-reels-on-iphone", crumb: "iPhone guide", title: "How to Download Instagram Reels on iPhone (Safari) | ReelGrab", desc: "Step-by-step: save a public Instagram Reel on iPhone with Safari. No app or login. Where the file goes, how to get it into Photos, and fixes for common problems." },
  { file: "android", path: "/download-instagram-reels-on-android", crumb: "Android guide", title: "How to Download Instagram Reels on Android (Chrome) | ReelGrab", desc: "Save a public Instagram Reel on Android with Chrome. No extra app or login. Where downloads are stored, permissions, and fixes for common problems." },
  { file: "troubleshooting", path: "/instagram-reel-not-downloading", crumb: "Troubleshooting", title: "Instagram Reel Won't Download? Causes and Fixes | ReelGrab", desc: "Why an Instagram Reel can't be downloaded: invalid links, private or deleted Reels, rate limits, provider errors and network problems — with what to try next." },
  { file: "about", path: "/about", crumb: "About", title: "About ReelGrab | Simple Instagram Reel Downloader", desc: "What ReelGrab is, how it works at a high level, and how to use it responsibly. An independent tool, not affiliated with Instagram or Meta." },
  { file: "contact", path: "/contact", crumb: "Contact", title: "Contact ReelGrab", desc: "How to contact ReelGrab about problems, privacy questions, or copyright concerns." },
  { file: "privacy", path: "/privacy", crumb: "Privacy", title: "Privacy Policy | ReelGrab", desc: "Exactly what happens to the Instagram Reel link you submit to ReelGrab, who processes it, and what is and isn't recorded." },
  { file: "terms", path: "/terms", crumb: "Terms", title: "Terms of Use | ReelGrab", desc: "Terms for using ReelGrab: lawful use, copyright, availability, third-party services and limits." },
  { file: "404", path: "/404", title: "Page not found | ReelGrab", desc: "This page doesn't exist.", noindex: true },
];

const e = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const contactHtml = EMAIL
  ? `<a href="mailto:${e(EMAIL)}">${e(EMAIL)}</a>`
  : `<strong>[Contact email not configured yet — set CONTACT_EMAIL in Vercel]</strong>`;

const header = `<a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">Reel<span>Grab</span></a><nav aria-label="Main"><a href="/#how">How it works</a><a href="/#guides">Guides</a><a href="/#faq">FAQ</a><a href="/about">About</a></nav></header>`;
const footer = `<footer><nav aria-label="Footer"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/download-instagram-reels-on-iphone">iPhone guide</a><a href="/download-instagram-reels-on-android">Android guide</a><a href="/instagram-reel-not-downloading">Troubleshooting</a></nav><small>© 2026 ReelGrab. An independent tool, not affiliated with, endorsed by, or sponsored by Instagram or Meta.</small></footer>`;

function jsonld(p, url) {
  if (p.noindex) return "";
  let g;
  if (p.file === "index") {
    g = { "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", "@id": SITE + "/#website", name: NAME, url: SITE + "/" },
      { "@type": "WebApplication", "@id": SITE + "/#app", name: "ReelGrab Instagram Reel Downloader", url: SITE + "/", applicationCategory: "MultimediaApplication", operatingSystem: "Any (web browser)",
        description: "Free web tool that turns a public Instagram Reel link into a downloadable video link. No sign-up required.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isPartOf: { "@id": SITE + "/#website" } } ] };
  } else {
    g = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: NAME, item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: p.crumb, item: url } ] };
  }
  return `<script type="application/ld+json">${JSON.stringify(g)}</script>`;
}

function render(p) {
  const url = SITE + (p.path === "/" ? "/" : p.path);
  const body = readFileSync(p.file === "index" ? "index.html" : p.file === "404" ? "404.html" : p.path.slice(1) + ".html", "utf8")
    .replaceAll("{{CONTACT}}", contactHtml).replaceAll("{{UPDATED}}", UPDATED).replaceAll("{{SITE_URL}}", SITE);
  const crumb = p.crumb && p.file !== "404" ? `<nav class="crumb" aria-label="Breadcrumb"><a href="/">ReelGrab</a> › ${e(p.crumb)}</nav>` : "";
  const img = SITE + "/og-image.png";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(p.title)}</title><meta name="description" content="${e(p.desc)}">` +
    (p.noindex ? `<meta name="robots" content="noindex,follow">` : `<link rel="canonical" href="${url}"><meta name="robots" content="index,follow,max-image-preview:large">`) +
    `<meta name="theme-color" content="#080b12"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">` +
    (p.noindex ? "" : `<meta property="og:type" content="website"><meta property="og:site_name" content="${NAME}"><meta property="og:title" content="${e(p.title)}"><meta property="og:description" content="${e(p.desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="ReelGrab — Instagram Reel downloader"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(p.title)}"><meta name="twitter:description" content="${e(p.desc)}"><meta name="twitter:image" content="${img}">`) +
    `<link rel="stylesheet" href="/style.css">${jsonld(p, url)}</head><body>${header}<main id="main">${crumb ? `<div class="wrap">${crumb}</div>` : ""}${body}</main>${footer}${p.script ? `<script src="/app.js" defer></script>` : ""}<script defer src="/_vercel/insights/script.js"></script></body></html>`;
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
for (const p of pages) writeFileSync(`dist/${p.file === "index" ? "index" : p.file === "404" ? "404" : p.path.slice(1)}.html`, render(p));
for (const f of ["app.js", "style.css", "favicon.svg", "favicon.ico", "apple-touch-icon.png", "og-image.png", "ads.txt"]) cpSync(f, `dist/${f}`);

const indexable = pages.filter(p => !p.noindex);
writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(p => `<url><loc>${SITE}${p.path === "/" ? "/" : p.path}</loc></url>`).join("\n")}\n</urlset>\n`);
writeFileSync("dist/robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${pages.length} pages for ${SITE}` + (EMAIL ? "" : "  (preview/dev build: CONTACT_EMAIL not set, placeholder shown)"));

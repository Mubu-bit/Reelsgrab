// Cloudflare Pages Function: POST /api/download  { url }  ->  { ok, videoUrl, downloadUrl, thumbnail }
// The Apify token stays server-side (env.APIFY_TOKEN). Never log the submitted URL or provider payload.

const REEL_PATH = /^\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels)\/[A-Za-z0-9_-]{5,40}\/?$/;
const ACTOR = "lance_api~instagram-reels-downloader-api";
const PROVIDER_TIMEOUT_S = 35;   // asked of Apify
const BACKEND_ABORT_MS = 38_000; // our own hard stop (frontend waits 45s so it receives our JSON error)

// Best-effort, per-isolate rate limit. On Cloudflare each isolate has its own memory, so this is weak.
// Real protection = a Cloudflare rate-limiting rule on /api/download (see steps) + Apify spending cap.
const hits = new Map();
const LIMITS = [[60_000, 5], [3_600_000, 30]];
const GLOBAL_CAP = [600_000, 120];
let globalHits = [];
function limited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter(t => now - t < GLOBAL_CAP[0]);
  if (globalHits.length >= GLOBAL_CAP[1]) return true;
  const list = (hits.get(ip) || []).filter(t => now - t < 3_600_000);
  const over = LIMITS.some(([win, max]) => list.filter(t => now - t < win).length >= max);
  if (!over) { list.push(now); globalHits.push(now); }
  hits.set(ip, list);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 2500) break; }
  return over;
}

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
const fail = (status, code, error, extra) => json(status, { ok: false, code, error }, extra);

function normalize(input) {
  if (typeof input !== "string" || !input || input.length > 500) return null;
  let u;
  try { u = new URL(input.trim()); } catch { return null; }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  if (!["instagram.com", "www.instagram.com"].includes(u.hostname.toLowerCase())) return null;
  if (!REEL_PATH.test(u.pathname)) return null;
  return "https://www.instagram.com" + u.pathname.replace(/\/?$/, "/");
}

const httpsUrl = v => (typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) ? v : null);

async function signedFileUrl(videoUrl, secret) {
  const e = String(Date.now() + 15 * 60_000);
  const u = btoa(videoUrl).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("reelgrab-file:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${e}.${u}`)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return `/api/file?e=${e}&u=${u}&s=${sig}`;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return fail(405, "method", "Method not allowed.", { Allow: "POST" });

  const origin = request.headers.get("origin");
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === new URL(request.url).host; } catch {}
    if (!ok) return fail(403, "forbidden", "Request not allowed.");
  }

  const ip = String(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (limited(ip)) return fail(429, "rate_limited", "Too many requests. Please wait a minute and try again.", { "Retry-After": "60" });

  let body = null;
  try { body = await request.json(); } catch {}
  const reelUrl = normalize(body && body.url);
  if (!reelUrl) {
    return fail(400, "invalid_url", "That isn't a supported Reel link. Use a public link like instagram.com/reel/… (profile, Story and photo-post links are not supported).");
  }

  const token = env.APIFY_TOKEN;
  if (!token) {
    console.error("config: APIFY_TOKEN missing");
    return fail(503, "unavailable", "The downloader is temporarily unavailable. Please try again later.");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BACKEND_ABORT_MS);
  try {
    const r = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=${PROVIDER_TIMEOUT_S}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [reelUrl] }),
      }
    );
    if (!r.ok) {
      console.error("provider_status", r.status);
      if (r.status === 408) return fail(504, "timeout", "The media service took too long to respond. Please try again.");
      if ([401, 402, 403].includes(r.status)) {
        console.error("provider_config_problem", r.status); // bad/expired token or Apify limit reached
        return fail(503, "unavailable", "The downloader is temporarily unavailable. Please try again later.");
      }
      if (r.status === 429 || r.status >= 500) return fail(503, "provider_busy", "The media service is busy right now. Please try again in a minute.");
      return fail(502, "provider_error", "The media service couldn't process this Reel. It may be private or unavailable, or the service may be down. Try again later.");
    }
    const items = await r.json();
    const item = Array.isArray(items) ? items[0] : null;
    const videoUrl = item && !item.error && httpsUrl(
      item.videoUrl || item.downloadUrl || item.download_url || item.media?.videoUrl || item.media?.downloadUrl || item.video?.url
    );
    if (!videoUrl) {
      return fail(404, "no_video", "No downloadable video was returned. The Reel may be private, deleted, restricted, or not a video.");
    }
    const thumbnail = httpsUrl(item.thumbnail || item.thumbnailUrl || item.media?.imageUrl || item.imageUrl);
    const downloadUrl = await signedFileUrl(videoUrl, token);
    return json(200, { ok: true, videoUrl, downloadUrl, thumbnail });
  } catch (e) {
    if (e && e.name === "AbortError") return fail(504, "timeout", "The media service took too long to respond. Please try again.");
    console.error("handler_error", e && e.name);
    return fail(500, "server_error", "Something failed on our side. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }
}

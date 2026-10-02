// POST /api/download  { url }  ->  { ok, videoUrl, thumbnail }
// The Apify token stays server-side (process.env.APIFY_TOKEN). Never log the submitted URL or provider payload.

const REEL_PATH = /^\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels)\/[A-Za-z0-9_-]{5,40}\/?$/;
const ACTOR = "lance_api~instagram-reels-downloader-api";
const PROVIDER_TIMEOUT_S = 35;   // asked of Apify
const BACKEND_ABORT_MS = 38_000; // our own hard stop (frontend waits 45s so it receives our JSON error)

// Best-effort, per-instance rate limit. Real protection = Vercel Firewall rate limit + Apify spending cap (see README).
const hits = new Map();
const LIMITS = [[60_000, 5], [3_600_000, 30]];
const GLOBAL_CAP = [600_000, 120]; // per instance, all clients: max lookups per 10 min (limits spend if many IPs are used)
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

function fail(res, status, code, error) {
  return res.status(status).json({ ok: false, code, error });
}

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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(res, 405, "method", "Method not allowed."); }

  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch {}
    if (!ok) return fail(res, 403, "forbidden", "Request not allowed.");
  }

  // On Vercel these headers are set by the platform. x-forwarded-for is the fallback for local testing.
  const ip = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (limited(ip)) {
    res.setHeader("Retry-After", "60");
    return fail(res, 429, "rate_limited", "Too many requests. Please wait a minute and try again.");
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const reelUrl = normalize(body && body.url);
  if (!reelUrl) {
    return fail(res, 400, "invalid_url", "That isn't a supported Reel link. Use a public link like instagram.com/reel/… (profile, Story and photo-post links are not supported).");
  }

  if (!process.env.APIFY_TOKEN) {
    console.error("config: APIFY_TOKEN missing");
    return fail(res, 503, "unavailable", "The downloader is temporarily unavailable. Please try again later.");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BACKEND_ABORT_MS);
  try {
    const r = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=${PROVIDER_TIMEOUT_S}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [reelUrl] }),
      }
    );
    if (!r.ok) {
      console.error("provider_status", r.status);
      if (r.status === 408) return fail(res, 504, "timeout", "The media service took too long to respond. Please try again.");
      if ([401, 402, 403].includes(r.status)) {
        console.error("provider_config_problem", r.status); // bad/expired token or Apify limit reached
        return fail(res, 503, "unavailable", "The downloader is temporarily unavailable. Please try again later.");
      }
      if (r.status === 429 || r.status >= 500) return fail(res, 503, "provider_busy", "The media service is busy right now. Please try again in a minute.");
      return fail(res, 502, "provider_error", "The media service couldn't process this Reel. It may be private or unavailable, or the service may be down. Try again later.");
    }
    const items = await r.json();
    const item = Array.isArray(items) ? items[0] : null;
    const videoUrl = item && !item.error && httpsUrl(
      item.videoUrl || item.downloadUrl || item.download_url || item.media?.videoUrl || item.media?.downloadUrl || item.video?.url
    );
    if (!videoUrl) {
      return fail(res, 404, "no_video", "No downloadable video was returned. The Reel may be private, deleted, restricted, or not a video.");
    }
    const thumbnail = httpsUrl(item.thumbnail || item.thumbnailUrl || item.media?.imageUrl || item.imageUrl);
    return res.status(200).json({ ok: true, videoUrl, thumbnail });
  } catch (e) {
    if (e && e.name === "AbortError") return fail(res, 504, "timeout", "The media service took too long to respond. Please try again.");
    console.error("handler_error", e && e.name);
    return fail(res, 500, "server_error", "Something failed on our side. Please try again in a moment.");
  } finally {
    clearTimeout(timer);
  }
}

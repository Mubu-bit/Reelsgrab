// GET /api/file?e=<expiry>&u=<b64url video url>&s=<signature>
// Streams a video that /api/download already looked up, with "save as file" headers.
// Only links signed by /api/download (valid ~15 min) are accepted, so this is not an open proxy.
export const config = { runtime: "edge" };

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function sign(payload, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("reelgrab-file:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(payload)));
}
const text = (status, msg) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export default async function handler(request) {
  if (request.method !== "GET") return text(405, "Method not allowed.");
  const secret = process.env.APIFY_TOKEN;
  if (!secret) return text(503, "Download is temporarily unavailable.");

  const p = new URL(request.url).searchParams;
  const e = p.get("e") || "", u = p.get("u") || "", s = p.get("s") || "";
  if (!/^\d{10,16}$/.test(e) || Number(e) < Date.now()) return text(410, "This download link has expired. Go back and get a new one.");

  const want = await sign(`${e}.${u}`, secret);
  let diff = want.length ^ s.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (s.charCodeAt(i) || 0);
  if (diff !== 0) return text(403, "Invalid download link.");

  let target;
  try { target = atob(u.replace(/-/g, "+").replace(/_/g, "/")); } catch { return text(400, "Bad link."); }
  if (!/^https:\/\/[^\s]+$/.test(target)) return text(400, "Bad link.");

  let up;
  try { up = await fetch(target, { redirect: "follow" }); } catch { return text(502, "Couldn't fetch the video. Please try again."); }
  if (!up.ok || !up.body) return text(502, "The video link has expired or is unavailable. Go back and get a new one.");

  const headers = new Headers({
    "Content-Type": up.headers.get("content-type") || "video/mp4",
    "Content-Disposition": 'attachment; filename="reelgrab-video.mp4"',
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const len = up.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(up.body, { status: 200, headers });
}

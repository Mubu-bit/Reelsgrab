(() => {
  const $ = s => document.querySelector(s);
  const input = $("#url"), paste = $("#paste"), btn = $("#download"), statusEl = $("#status"), result = $("#result");
  const REEL = /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+\/)?(reel|reels)\/[A-Za-z0-9_-]{5,40}\/?$/i;
  const LABEL = "Get download link";
  let busy = false;

  const say = (msg, kind = "") => { statusEl.className = "status " + kind; statusEl.textContent = msg; };
  const reset = () => { busy = false; btn.disabled = false; btn.textContent = LABEL; input.removeAttribute("aria-busy"); };

  function clean(raw) {
    try { const u = new URL(raw.trim()); return u.origin + u.pathname; } catch { return null; }
  }

  function check(raw) {
    if (!raw.trim()) return "Paste an Instagram Reel link first.";
    if (raw.length > 500) return "That text is too long to be a Reel link.";
    const u = clean(raw);
    if (!u) return "That doesn't look like a link. Copy the full Reel link from Instagram and paste it here.";
    if (!/^https?:\/\/(www\.)?instagram\.com\//i.test(u)) return "Only instagram.com Reel links are supported.";
    if (/\/(p|tv)\//.test(u)) return "That looks like a photo/video post link, not a Reel link. Reel links contain /reel/.";
    if (/\/stories\//.test(u)) return "Story links aren't supported. Use a public Reel link (instagram.com/reel/…).";
    if (!REEL.test(u)) return "That Instagram link isn't a Reel link. It should look like instagram.com/reel/…";
    return null;
  }


  let blobUrl = null;
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  function showResult(d) {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    result.replaceChildren();
    const dl = d.downloadUrl || d.videoUrl;
    const card = mk("div", "rcard");
    const video = mk("video", "rvideo");
    video.controls = true; video.playsInline = true; video.preload = "auto";
    video.addEventListener("loadedmetadata", () => { try { if (!video.currentTime) video.currentTime = 0.1; } catch {} });
    if (d.thumbnail) video.poster = d.thumbnail;
    card.append(video);

    const save = mk("button", "rbtn", "Preparing…");
    save.type = "button"; save.disabled = true;
    const canShare = typeof navigator.canShare === "function" && typeof navigator.share === "function" &&
      navigator.canShare({ files: [new File([""], "a.mp4", { type: "video/mp4" })] });

    const a = mk("a", "rbtn main", "Download video");
    a.href = dl; a.download = "reelgrab-video.mp4";
    card.append(a);
    if (canShare) card.append(save);

    const again = mk("button", "rbtn", "Download another");
    again.type = "button";
    again.addEventListener("click", () => {
      if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
      result.replaceChildren(); input.value = ""; say(""); input.focus();
    });
    card.append(again);
    result.append(card);

    // Fetch the file once: used for the preview and for the "Save to Photos" share sheet.
    let file = null;
    fetch(dl).then(r => {
      if (!r.ok) throw new Error("fetch");
      if (Number(r.headers.get("content-length")) > 80e6) throw new Error("big");
      return r.blob();
    }).then(b => {
      const blob = b.type ? b : new Blob([b], { type: "video/mp4" });
      file = new File([blob], "reelgrab-video.mp4", { type: blob.type });
      blobUrl = URL.createObjectURL(blob);
      video.src = blobUrl;
      save.disabled = false; save.textContent = "Save to Photos";
    }).catch(() => { video.preload = "metadata"; video.src = dl; save.remove(); });

    save.addEventListener("click", async () => {
      if (!file) return;
      try { await navigator.share({ files: [file] }); }
      catch (e) { if (e && e.name !== "AbortError") say("Couldn't open the share sheet. Use “Download video” instead.", "err"); }
    });
  }

  paste.addEventListener("click", async () => {
    try { input.value = (await navigator.clipboard.readText()).trim(); say("Link pasted. Now tap “" + LABEL + "”."); input.focus(); }
    catch { say("Your browser blocked clipboard access. Long-press the box and paste the link manually.", "err"); }
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });

  btn.addEventListener("click", async () => {
    if (busy) return;
    result.replaceChildren();
    input.removeAttribute("aria-invalid");
    const problem = check(input.value);
    if (problem) { input.setAttribute("aria-invalid", "true"); say(problem, "err"); input.focus(); return; }

    busy = true; btn.disabled = true; btn.textContent = "Working…"; input.setAttribute("aria-busy", "true");
    say("Fetching the Reel. Usually a few seconds, sometimes up to 40…", "load");
    const slow = setTimeout(() => say("Still working. The media service can be slow, so please keep this page open…", "load"), 12000);
    const ctrl = new AbortController();
    const abort = setTimeout(() => ctrl.abort(), 45000);

    try {
      const r = await fetch("/api/download", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clean(input.value) }),
      });
      let d = null;
      try { d = await r.json(); } catch {}
      if (!r.ok || !d || !d.ok) {
        const fallback = r.status === 429 ? "Too many requests. Please wait a minute and try again."
          : r.status >= 500 ? "The service had a problem. Please try again in a moment."
          : "The Reel couldn't be fetched. Check that it's public and try again.";
        say((d && d.error) || fallback, "err");
        return;
      }
      say("Ready. The link is temporary, so save the video soon.", "ok");
      showResult(d);
    } catch (e) {
      say(e && e.name === "AbortError"
        ? "This took too long and was stopped. Try again, or try a different Reel."
        : "Couldn't reach ReelGrab. Check your internet connection and try again.", "err");
    } finally {
      clearTimeout(slow); clearTimeout(abort); reset();
    }
  });
})();

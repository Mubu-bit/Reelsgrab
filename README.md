# ReelGrab — Vercel-ready
1. Put this project in GitHub and import it into Vercel.
2. Vercel Project → Settings → Environment Variables.
3. Add `APIFY_TOKEN` for Production.
4. Redeploy.
5. Test with a public Instagram Reel URL.

Backend: `/api/download.js`.
Provider endpoint: Apify `lance_api/instagram-reels-downloader-api`.
Keep the token server-side.

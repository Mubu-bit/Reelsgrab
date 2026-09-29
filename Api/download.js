export default async function handler(req,res){
 if(req.method!=="POST") return res.status(405).json({error:"Method not allowed."});
 try{
  const reelUrl=String(req.body?.url||"").trim();
  if(!/^https?:\/\/(www\.)?instagram\.com\/(reel|reels)\/[^/?#]+\/?$/.test(reelUrl))
   return res.status(400).json({error:"Please enter a valid public Instagram Reel URL."});
  if(!process.env.APIFY_TOKEN)
   return res.status(503).json({error:"Downloader is not configured yet. Add APIFY_TOKEN in Vercel Environment Variables."});
  const endpoint="https://api.apify.com/v2/acts/lance_api~instagram-reels-downloader-api/run-sync-get-dataset-items";
  const r=await fetch(endpoint,{method:"POST",headers:{"Authorization":`Bearer ${process.env.APIFY_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({urls:[reelUrl]})});
  if(!r.ok){console.error("Apify:",r.status);return res.status(502).json({error:"The media provider could not process this Reel right now."});}
  const items=await r.json(), item=Array.isArray(items)?items[0]:null;
  const videoUrl=item?.videoUrl||item?.downloadUrl||item?.download_url||item?.media?.videoUrl||item?.media?.downloadUrl||item?.video?.url||item?.url;
  const thumbnail=item?.thumbnail||item?.thumbnailUrl||item?.media?.imageUrl||item?.imageUrl||null;
  if(!videoUrl||!/^https?:\/\//.test(videoUrl))
   return res.status(404).json({error:"No downloadable video was returned. The Reel may be private, unavailable, or unsupported."});
  return res.status(200).json({ok:true,videoUrl,thumbnail,caption:item?.caption||"",author:item?.username||item?.author||item?.creator?.username||""});
 }catch(e){console.error(e);return res.status(500).json({error:"Unexpected server error."});}
}

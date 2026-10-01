const input=document.querySelector("#url"),paste=document.querySelector("#paste"),btn=document.querySelector("#download"),statusEl=document.querySelector("#status"),result=document.querySelector("#result");
const REEL=/^https?:\/\/(www\.)?instagram\.com\/(reel|reels)\/[^/?#]+\/?(\?.*)?(#.*)?$/i;
function esc(s){return String(s).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}
paste.onclick=async()=>{try{input.value=await navigator.clipboard.readText();statusEl.textContent="URL pasted."}catch{statusEl.textContent="Clipboard access was blocked. Paste the URL manually."}};
input.addEventListener("keydown",e=>{if(e.key==="Enter")btn.click()});
btn.onclick=async()=>{
 const url=input.value.trim();result.innerHTML="";
 if(!url){statusEl.textContent="Paste an Instagram Reel URL first.";return}
 if(!REEL.test(url)){statusEl.textContent="That doesn't look like a Reel link. It should contain instagram.com/reel/.";return}
 btn.disabled=true;btn.textContent="Processing…";statusEl.textContent="Resolving public Reel…";
 try{
  const r=await fetch("/api/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.split(/[?#]/)[0]})});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error||"Request failed");
  statusEl.textContent="Ready. The link is temporary, so save the video soon.";
  result.innerHTML=(d.thumbnail?`<img class="preview" src="${esc(d.thumbnail)}" alt="Reel preview" referrerpolicy="no-referrer">`:"")+`<a href="${esc(d.videoUrl)}" target="_blank" rel="noopener noreferrer">Open download</a>`;
 }catch(e){statusEl.textContent=e.message}
 finally{btn.disabled=false;btn.textContent="Get download link"}
};

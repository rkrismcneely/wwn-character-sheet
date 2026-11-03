/**
 * Serve the pinned ffmpeg.wasm class worker and its two ESM dependencies from
 * our own origin. Browsers refuse to construct cross-origin module workers.
 *
 * These are only open-source JavaScript code files, never a user recording.
 * Prepared audio stays in the GM's browser-origin OPFS.
 */
const allowed=new Set(["worker.js","const.js","errors.js"]);
const base="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/";
type Context={params:Promise<{name:string}>};
export async function GET(_request:Request,context:Context){
  const {name}=await context.params;
  if(!allowed.has(name))return new Response("Not found",{status:404});
  try{
    const response=await fetch(base+name,{redirect:"error",signal:AbortSignal.timeout(15000)});
    if(!response.ok)return new Response("FFmpeg worker unavailable.",{status:502});
    const text=await response.text();
    if(!text||text.length>30_000)return new Response("Invalid FFmpeg worker code.",{status:502});
    return new Response(text,{headers:{
      "content-type":"text/javascript; charset=utf-8",
      "cache-control":"public, max-age=86400, immutable",
      "x-content-type-options":"nosniff",
    }});
  }catch{return new Response("FFmpeg browser worker could not be loaded.",{status:503});}
}

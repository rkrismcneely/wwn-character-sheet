/**
 * Serve a self-contained FFmpeg module worker from the TWE deployment.
 * No Cloudflare-to-CDN fetch, no user recording bytes, and no per-request quota.
 * The browser still downloads its pinned ESM core/wasm separately.
 */
import {recapFFmpegWorkerSource} from "@/lib/campaigns/recap-ffmpeg-worker-source";

type Context={params:Promise<{name:string}>};
export async function GET(_request:Request,context:Context){
  const {name}=await context.params;
  if(name!=="worker.js")return new Response("Not found",{status:404});
  return new Response(recapFFmpegWorkerSource,{headers:{
    "content-type":"text/javascript; charset=utf-8",
    // Do not let an older CDN-proxy worker survive a deployment in browser cache.
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
  }});
}

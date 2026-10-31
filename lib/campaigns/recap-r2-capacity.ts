import { CampaignServiceError } from "./service.ts";
/**
 * Conservative admission guard for legacy recap audio held in site-owned R2.
 * New long recordings go directly to each GM's Drive; don't use R2 for those.
 *
 * The quota is shared across legacy recap audio, Craig ZIPs and extracted tracks.
 * This is NOT an account-wide billing guarantee: other R2 prefixes, existing
 * object storage, concurrent writes, and operation counts require Cloudflare
 * dashboard usage alerts and a retention policy.
 */
export const LEGACY_RECAP_R2_MAX_BYTES = 6 * 1024 * 1024 * 1024;
export const LEGACY_RECAP_R2_PREFIXES = ["recap-audio/","recap-craig/","recap-tracks/"] as const;
const MAX_LIST_PAGES = 100;

/** Reject new legacy writes if usage can't be bounded or their budget is exceeded. */
export async function requireLegacyRecapR2Capacity(
  bucket: Pick<R2Bucket,"list"|"head">, incomingBytes:number, overwriteKey?:string,
):Promise<{usedBytes:number;newBytes:number;maxBytes:number}>{
  if(!Number.isSafeInteger(incomingBytes)||incomingBytes<1||
    incomingBytes>LEGACY_RECAP_R2_MAX_BYTES)
    throw new CampaignServiceError("Legacy recap recording exceeds safe R2 intake limit.",409);
  if(overwriteKey && !LEGACY_RECAP_R2_PREFIXES.some(prefix=>overwriteKey.startsWith(prefix)))
    throw new CampaignServiceError("Unexpected legacy recap replacement key.",409);
  const previous = overwriteKey?await bucket.head(overwriteKey):null;
  let usedBytes=0;
  for(const prefix of LEGACY_RECAP_R2_PREFIXES){
    let cursor:string|undefined;
    let complete=false;
    for(let page=0;page<MAX_LIST_PAGES;page++){
      const batch=await bucket.list({prefix,limit:1000,...(cursor?{cursor}:{})});
      for(const object of batch.objects){
        if(!Number.isSafeInteger(object.size)||object.size<0)
          throw new CampaignServiceError("Legacy recap R2 inventory returned invalid bytes.",409);
        usedBytes+=object.size;
        if(usedBytes>LEGACY_RECAP_R2_MAX_BYTES)
          throw new CampaignServiceError("Legacy recap R2 budget exceeded. Use GM-owned Drive storage.",409);
      }
      if(!batch.truncated){complete=true;break;}
      if(!batch.cursor||batch.cursor===cursor)
        throw new CampaignServiceError("Legacy recap R2 inventory could not be completed.",409);
      cursor=batch.cursor;
    }
    if(!complete)throw new CampaignServiceError("Legacy recap R2 inventory exceeded inspection budget.",409);
  }
  const newBytes=usedBytes-(previous?.size??0)+incomingBytes;
  if(newBytes>LEGACY_RECAP_R2_MAX_BYTES)
    throw new CampaignServiceError("Legacy recap R2 budget is full. Use GM-owned Drive or remove old recordings after backup.",409);
  return {usedBytes,newBytes,maxBytes:LEGACY_RECAP_R2_MAX_BYTES};
}

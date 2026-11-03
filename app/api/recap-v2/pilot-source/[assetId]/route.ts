import {handlePilotExcerpt} from "@/lib/campaigns/recap-v2-pilot-source";
type Context={params:Promise<{assetId:string}>};
/** Groq can fetch this GET/HEAD only with a short-lived, GM-approved HMAC.
 * A normal browser session cookie grants no access to this route.
 */
export const GET=(request:Request,context:Context)=>handlePilotExcerpt(request,context);
export const HEAD=(request:Request,context:Context)=>handlePilotExcerpt(request,context);

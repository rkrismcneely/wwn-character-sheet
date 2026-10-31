import { CampaignServiceError } from "./service.ts";
const FOLDER_MIME="application/vnd.google-apps.folder";
const ROOT_NAME="Tales Without End";
const ID=/^[A-Za-z0-9_-]{5,256}$/u;
/** All folders are in the GM's own Drive and visible in their normal My Drive view. */
export async function ensureRecapDriveFolder(token:string,fetcher:typeof fetch=fetch):Promise<string>{
  const query="mimeType = '"+FOLDER_MIME+"' and trashed = false and "+
    "appProperties has { key = 'tweRecapStorage' and value = 'v1' }";
  const listing=new URL("https://www.googleapis.com/drive/v3/files");
  listing.searchParams.set("q",query);
  listing.searchParams.set("fields","nextPageToken,files(id,name,mimeType)");
  listing.searchParams.set("page_size","50");
  const prior=await fetcher(listing,{redirect:"manual",headers:{authorization:"Bearer "+token},
    signal:AbortSignal.timeout(12000)});
  if(!prior.ok||prior.redirected)throw new CampaignServiceError("Could not check your TWE Google Drive folder.",409);
  const data=await prior.json() as {files?:{id?:string;name?:string;mimeType?:string}[]};
  const existing=data.files?.find(x=>x.name===ROOT_NAME&&x.mimeType===FOLDER_MIME&&
    typeof x.id==="string"&&ID.test(x.id));
  if(existing?.id)return existing.id;
  const created=await fetcher("https://www.googleapis.com/drive/v3/files?fields=id",{
    method:"POST",redirect:"manual",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify({name:ROOT_NAME,mimeType:FOLDER_MIME,
      appProperties:{tweRecapStorage:"v1"}}),signal:AbortSignal.timeout(12000),
  });
  if(!created.ok||created.redirected)throw new CampaignServiceError("Could not create your TWE Google Drive folder.",409);
  const file=await created.json() as {id?:unknown};
  if(typeof file.id!=="string"||!ID.test(file.id))
    throw new CampaignServiceError("Google Drive did not confirm its TWE folder.",409);
  return file.id;
}

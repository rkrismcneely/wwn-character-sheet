/** Recover only a TWE-created Google Drive file that has already completed upload.
 * Google Drive files.list supports searching appProperties with drive.file scope.
 * These markers identify TWE's server-created resumable upload metadata.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CAMPAIGN=/^[A-Za-z0-9_-]{3,128}$/u;
const FILE_ID=/^[A-Za-z0-9_-]{5,256}$/u;

export function completedRecapDriveFileQuery(assetId:string,campaignId:string):string {
  if(!UUID.test(assetId)||!CAMPAIGN.test(campaignId))throw Error("Invalid recovery identifiers.");
  return "trashed = false and "+
    "appProperties has { key='tweAudioAssetId' and value='"+assetId+"' } and "+
    "appProperties has { key='tweCampaignId' and value='"+campaignId+"' }";
}

/** Return null for an absent file; reject ambiguous or mismatched searches.
 * Never accept the file ID, MIME or size from a browser as proof of ownership.
 */
export function completedRecapDriveFile(
  response:unknown,expected:{assetId:string;campaignId:string;mimeType:string;byteSize:number},
):string|null{
  if(!response||typeof response!=="object"||
    !Array.isArray((response as {files?:unknown}).files))
    throw Error("Invalid Google Drive recovery response.");
  const result=response as {
    files:{id?:unknown;mimeType?:unknown;size?:unknown;trashed?:unknown;
      appProperties?:Record<string,unknown>}[];
    nextPageToken?:unknown;incompleteSearch?:unknown;
  };
  if(result.incompleteSearch===true||result.nextPageToken||result.files.length>1)
    throw Error("Ambiguous Google Drive recovery matches.");
  if(result.files.length===0)return null;
  const file=result.files[0];
  if(!file||typeof file.id!=="string"||!FILE_ID.test(file.id)||
    file.size!==String(expected.byteSize)||file.mimeType!==expected.mimeType||
    file.trashed===true||
    file.appProperties?.tweAudioAssetId!==expected.assetId||
    file.appProperties?.tweCampaignId!==expected.campaignId)
    throw Error("Google Drive recording does not match this upload.");
  return file.id;
}

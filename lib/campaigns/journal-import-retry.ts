/** Reimports must never overwrite pages that a GM may have edited. */
export function mayLinkImportedAssets(
 path:string,originalContent:string,currentContent:string,
 createdPaths:ReadonlySet<string>,hasPendingUploads:boolean
):boolean{
 return createdPaths.has(path)||currentContent===originalContent||hasPendingUploads;
}

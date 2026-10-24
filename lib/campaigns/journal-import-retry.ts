/** Existing pages may have GM edits; attachment retries must not overwrite them. */
export function mayLinkImportedAssets(
 path:string,originalContent:string,currentContent:string,
 createdPaths:ReadonlySet<string>,_hasPendingUploads:boolean
):boolean{
 return createdPaths.has(path)||currentContent===originalContent;
}

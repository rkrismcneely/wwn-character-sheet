/** Only link attachments into a new, untouched, or exactly known partially-linked page. */
export function mayLinkImportedAssets(
 path:string,originalContent:string,currentContent:string,
 createdPaths:ReadonlySet<string>,_hasPendingUploads:boolean,
 expectedPartiallyLinkedContent?:string
):boolean{
 return createdPaths.has(path)||currentContent===originalContent||
  (expectedPartiallyLinkedContent!==undefined&&currentContent===expectedPartiallyLinkedContent);
}

/** Only link assets into an untouched page or an exactly recognized partial import. */
export function mayLinkImportedAssets(originalContent:string,currentContent:string,expectedPartiallyLinkedContent?:string):boolean{
 return currentContent===originalContent || (expectedPartiallyLinkedContent!==undefined && currentContent===expectedPartiallyLinkedContent);
}

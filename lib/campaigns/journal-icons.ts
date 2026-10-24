/** Stable, reusable article icon choices. Stored values are Lucide icon names. */
export const JOURNAL_PAGE_ICONS = [
 {id:"castle",label:"City / Settlement"},
 {id:"user-round",label:"NPC"},
 {id:"skull",label:"Monster"},
 {id:"sparkles",label:"Spell"},
 {id:"sword",label:"Item / Equipment"},
 {id:"map-pin",label:"Location"},
 {id:"landmark",label:"Faction"},
 {id:"scroll-text",label:"Quest"},
 {id:"book-open",label:"Lore / History"},
 {id:"map",label:"Region / Map"},
 {id:"calendar-days",label:"Session Notes"},
 {id:"file-text",label:"General Article"},
] as const;
export type JournalPageIcon = (typeof JOURNAL_PAGE_ICONS)[number]["id"];
export const DEFAULT_JOURNAL_PAGE_ICON:JournalPageIcon="file-text";
const allowed=new Set<string>(JOURNAL_PAGE_ICONS.map(icon=>icon.id));
export function journalPageIcon(value:unknown):JournalPageIcon{
 return typeof value==="string"&&allowed.has(value)?value as JournalPageIcon:DEFAULT_JOURNAL_PAGE_ICON;
}
export function validateJournalPageIcon(value:unknown):JournalPageIcon{
 if(typeof value!=="string"||!allowed.has(value))throw new Error("Unsupported journal page icon.");
 return value as JournalPageIcon;
}

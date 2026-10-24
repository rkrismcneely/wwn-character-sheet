"use client";
import type { ReactNode } from "react";
import { journalPageIcon, type JournalPageIcon } from "@/lib/campaigns/journal-icons";

/** Self-contained Lucide-style vector symbols; no emoji, icon font or network requests. */
const drawings:Record<JournalPageIcon,ReactNode>={
 "file-text":<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
 "castle":<><path d="M22 20v-9H2v9M2 11V6h4v2h4V6h4v2h4V6h4v5M2 20h20M9 20v-5a3 3 0 0 1 6 0v5"/></>,
 "user-round":<><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></>,
 "skull":<><path d="M12 2a9 9 0 0 0-9 9c0 3 1.8 5.2 4 6v3h10v-3c2.2-.8 4-3 4-6a9 9 0 0 0-9-9Z"/><path d="M9 20v2m3-2v2m3-2v2"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="m12 14-1 2h2Z"/></>,
 "sparkles":<><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM5 2l.8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8L5 2ZM19 16l1.1 2.9L23 20l-2.9 1.1L19 24l-1.1-2.9L15 20l2.9-1.1L19 16Z"/></>,
 "sword":<><path d="m14.5 17.5-4-4L21 3l-1-1-10.5 10.5-4 4M3 21l6-6M2 17l5 5M7 12l5 5"/></>,
 "map-pin":<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
 "landmark":<><path d="m3 10 9-7 9 7H3ZM3 21h18M5 10v9m4-9v9m6-9v9m4-9v9M2 21h20"/></>,
 "scroll-text":<><path d="M8 21H5a3 3 0 0 1-3-3V5a3 3 0 0 1 6 0v13a3 3 0 0 0 6 0V5a3 3 0 0 1 6 0v13a3 3 0 0 1-3 3H8Z"/><path d="M10 8h7M10 12h7M10 16h4"/></>,
 "book-open":<><path d="M12 7v14M3 18V4a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v14h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3Z"/></>,
 "map":<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15m6-12v15"/></>,
 "calendar-days":<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4m8-4v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" strokeLinecap="round"/></>,
};
export function JournalPageIconView({icon,size=18,className}:{icon?:string|null;size?:number;className?:string}){
 const chosen=journalPageIcon(icon);
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={chosen.replaceAll("-"," ")}>{drawings[chosen]}</svg>;
}

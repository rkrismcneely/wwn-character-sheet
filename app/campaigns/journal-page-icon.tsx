"use client";
import type { ReactNode } from "react";
import { journalPageIcon, type JournalPageIcon } from "@/lib/campaigns/journal-icons";

/** Exact Lucide SVG artwork from lucide-icons/lucide tag 0.456.0 (ISC license). */
const drawings:Record<JournalPageIcon,ReactNode>={
 "file-text":<>
<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  <path d="M10 9H8" />
  <path d="M16 13H8" />
  <path d="M16 17H8" />
</>,
 "castle":<>
<path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z" />
  <path d="M18 11V4H6v7" />
  <path d="M15 22v-4a3 3 0 0 0-3-3a3 3 0 0 0-3 3v4" />
  <path d="M22 11V9" />
  <path d="M2 11V9" />
  <path d="M6 4V2" />
  <path d="M18 4V2" />
  <path d="M10 4V2" />
  <path d="M14 4V2" />
</>,
 "user-round":<>
<circle cx="12" cy="8" r="5" />
  <path d="M20 21a8 8 0 0 0-16 0" />
</>,
 "skull":<>
<path d="m12.5 17-.5-1-.5 1h1z" />
  <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" />
  <circle cx="15" cy="12" r="1" />
  <circle cx="9" cy="12" r="1" />
</>,
 "sparkles":<>
<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  <path d="M20 3v4" />
  <path d="M22 5h-4" />
  <path d="M4 17v2" />
  <path d="M5 18H3" />
</>,
 "sword":<>
<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
  <line x1="13" x2="19" y1="19" y2="13" />
  <line x1="16" x2="20" y1="16" y2="20" />
  <line x1="19" x2="21" y1="21" y2="19" />
</>,
 "map-pin":<>
<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
  <circle cx="12" cy="10" r="3" />
</>,
 "landmark":<>
<line x1="3" x2="21" y1="22" y2="22" />
  <line x1="6" x2="6" y1="18" y2="11" />
  <line x1="10" x2="10" y1="18" y2="11" />
  <line x1="14" x2="14" y1="18" y2="11" />
  <line x1="18" x2="18" y1="18" y2="11" />
  <polygon points="12 2 20 7 4 7" />
</>,
 "scroll-text":<>
<path d="M15 12h-5" />
  <path d="M15 8h-5" />
  <path d="M19 17V5a2 2 0 0 0-2-2H4" />
  <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
</>,
 "book-open":<>
<path d="M12 7v14" />
  <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
</>,
 "map":<>
<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
  <path d="M15 5.764v15" />
  <path d="M9 3.236v15" />
</>,
 "calendar-days":<>
<path d="M8 2v4" />
  <path d="M16 2v4" />
  <rect width="18" height="18" x="3" y="4" rx="2" />
  <path d="M3 10h18" />
  <path d="M8 14h.01" />
  <path d="M12 14h.01" />
  <path d="M16 14h.01" />
  <path d="M8 18h.01" />
  <path d="M12 18h.01" />
  <path d="M16 18h.01" />
</>,
};
export function JournalPageIconView({icon,size=18,className}:{icon?:string|null;size?:number;className?:string}){
 const chosen=journalPageIcon(icon);
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={chosen.replaceAll("-"," ")}>{drawings[chosen]}</svg>;
}

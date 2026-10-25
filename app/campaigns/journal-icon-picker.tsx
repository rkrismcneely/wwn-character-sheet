"use client";
import { useEffect, useRef, useState } from "react";
import { JOURNAL_PAGE_ICONS, journalPageIcon } from "@/lib/campaigns/journal-icons";
import { JournalPageIconView } from "./journal-page-icon";

export function JournalIconPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const popup = useRef<HTMLDetailsElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const selected = JOURNAL_PAGE_ICONS.find(icon => icon.id === journalPageIcon(value))!;
  const choices = JOURNAL_PAGE_ICONS.filter(icon => (icon.label + " " + icon.id).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (popup.current && !popup.current.contains(event.target as globalThis.Node)) popup.current.open = false; };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  function close() { if (popup.current) { popup.current.open = false; setSearch(""); popup.current.querySelector("summary")?.focus(); } }
  return <div className="journal-icon-control"><span className="twe-workspace-section-label">Page icon</span><details ref={popup} className="journal-icon-popover" onToggle={event => { if (event.currentTarget.open) searchInput.current?.focus(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
    <summary aria-label="Choose page icon" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><JournalPageIconView icon={selected.id} size={22}/><span>{selected.label}</span><span aria-hidden="true">▾</span></summary>
    <div className="journal-icon-popup"><label className="twe-workspace-field">Find an icon<input ref={searchInput} disabled={disabled} aria-label="Search page icons" type="search" placeholder="NPC, place, item…" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="twe-workspace-icon-picker" aria-label="Page icons">{choices.map((icon, index) => <button type="button" disabled={disabled} key={icon.id} aria-label={icon.label} aria-pressed={value === icon.id} className={"twe-workspace-icon-choice" + (value === icon.id ? " is-selected" : "")} onClick={() => { onChange(icon.id); close(); }} onKeyDown={event => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 4 : event.key === "ArrowUp" ? -4 : 0;
        if (step) { event.preventDefault(); const buttons = popup.current?.querySelectorAll<HTMLButtonElement>(".twe-workspace-icon-choice"); buttons?.[Math.max(0, Math.min(choices.length - 1, index + step))]?.focus(); }
      }}><JournalPageIconView icon={icon.id} size={22}/><span>{icon.label}</span></button>)}</div>
      {!choices.length && <p>No matching icons.</p>}
    </div>
  </details></div>;
}

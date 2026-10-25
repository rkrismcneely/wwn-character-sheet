"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { journalEditorExtensions, createJournalMarkdownManager, initialJournalDocument } from "@/lib/campaigns/journal-editor-extensions";
import { journalTemplates, safeEditorLink } from "@/lib/campaigns/journal-editor-format";
import { journalPropertiesMarkdown } from "@/lib/campaigns/journal-properties";
import { resolveJournalWikilinks } from "@/lib/campaigns/journal-links";
import { JournalDocument } from "./journal-document";
import { CampaignDialog } from "./campaign-dialog";
import { editableJournalProperties, writeJournalProperties, type JournalPropertyField } from "@/lib/campaigns/journal-editor-properties";

type Page = { id: string; title: string; kind: string; sourcePath?: string | null; parentId: string | null };
type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; pages: Page[]; current?: Page; onAttach: (file: File) => Promise<string>; localImageUrls?: ReadonlySet<string> };

export function JournalVisualEditor({ value, onChange, disabled = false, pages, current, onAttach, localImageUrls }: Props) {
  const extensions = useMemo(() => journalEditorExtensions(), []);
  const [initial] = useState(() => initialJournalDocument(createJournalMarkdownManager(), value));
  const [mode, setMode] = useState<"visual" | "preview" | "markdown">("visual");
  const [template, setTemplate] = useState("blank");
  const templateApplied = useRef("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"link" | "card" | "columns" | "properties" | null>(null);
  const [propertyFields,setPropertyFields]=useState<JournalPropertyField[]>([]);
  const propertyPosition=useRef<number|null>(null);
  const [linkKind, setLinkKind] = useState<"page" | "web">("page");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [cardLabel, setCardLabel] = useState("");
  const [cardValue, setCardValue] = useState("");
  const [layout, setLayout] = useState("portrait");
  const attachment = useRef<HTMLInputElement>(null);
  const selection = useRef({ from: 1, to: 1 });
  const emitted = useRef(value), change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const editor = useEditor({
    immediatelyRender: false, extensions, content: initial,
    editorProps: { attributes: { role: "textbox", "aria-label": "Page content", "aria-multiline": "true", spellcheck: "true" } },
    onUpdate: ({ editor: active }) => { const markdown = active.getMarkdown(); emitted.current = markdown; change.current(markdown); },
  }, []);
  useEffect(() => {
    if (!editor || mode!=="visual" || value === emitted.current) return;
    editor.commands.setContent(initialJournalDocument(createJournalMarkdownManager(), value), { emitUpdate: false });
    emitted.current = value;
  }, [editor, value, mode]);
  useEffect(() => { editor?.setEditable(!disabled && !busy, false); }, [editor, disabled, busy]);
  const state = useEditorState({ editor, selector: ({ editor: active }) => active ? {
    bold: active.isActive("bold"), italic: active.isActive("italic"), strike: active.isActive("strike"),
    bullet: active.isActive("bulletList"), ordered: active.isActive("orderedList"), quote: active.isActive("blockquote"), callout: active.isActive("journalCallout"),
    heading: active.isActive("heading") ? String(active.getAttributes("heading").level) : "paragraph",
    table: active.isActive("table"), columns: active.isActive("journalColumns"), secret: active.isActive("journalSecret"),
    undo: active.can().undo(), redo: active.can().redo(), image: active.isActive("image"),
    properties: active.isActive("journalPreserved")&&editableJournalProperties(String(active.getAttributes("journalPreserved").source??""))!==null,
  } : null });
  const locked = disabled || busy;
  function remember() { if (editor) selection.current = { from: editor.state.selection.from, to: editor.state.selection.to }; }
  function openLink() {
    if (!editor) return;
    remember();
    const wiki = editor.getAttributes("journalWikiLink");
    const resolved = wiki.source ? resolveJournalWikilinks(String(wiki.source), current ?? { id: "", title: "", parentId: null }, pages) : "";
    const href = String(editor.getAttributes("link").href ?? /\]\(([^)]+)\)$/u.exec(resolved)?.[1] ?? "");
    setLinkKind(href.startsWith("http") ? "web" : "page");
    setLinkTarget(href.startsWith("/journal-page/") ? href.slice(14).split("#")[0] : href);
    setLinkText(String(wiki.label ?? editor.state.doc.textBetween(selection.current.from, selection.current.to, " ")));
    setError(""); setDialog("link");
  }
  function addLink() {
    if (!editor) return;
    const page = pages.find(page => page.id === linkTarget && page.kind === "page");
    const href = linkKind === "page" && page ? "/journal-page/" + page.id : linkTarget.trim();
    if (!safeEditorLink(href) || (linkKind === "page" && !page)) { setError("Choose a page or enter a valid web address."); return; }
    const label = linkText.trim() || page?.title || href;
    editor.chain().focus().setTextSelection(selection.current).insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] }).run();
    setDialog(null); setError("");
  }
  function insertBlock(content: JSONContent, afterCard = false) {
    if (!editor) return;
    const from = editor.state.selection.$from;
    if (afterCard) for (let depth = from.depth; depth > 0; depth--) if (from.node(depth).type.name === "journalCallout") {
      editor.chain().focus().insertContentAt(from.after(depth), content).run(); return;
    }
    editor.chain().focus().insertContent(content).run();
  }
  function addCard() {
    if (!cardLabel.trim() && !cardValue.trim()) { setError("Enter a label or a value for this card."); return; }
    insertBlock({ type: "journalCallout", attrs: { kind: "NOTE", title: "" }, content: [{ type: "paragraph", content: [
      ...(cardLabel.trim() ? [{ type: "text", text: cardLabel.trim() + ":", marks: [{ type: "bold" }] }] : []),
      ...(cardValue.trim() ? [{ type: "text", text: (cardLabel.trim() ? " " : "") + cardValue.trim() }] : []),
    ] }] }, true);
    setDialog(null); setError("");
  }
  function addColumns() {
    const widths = layout === "three" ? [33.33, 33.33, 33.33] : layout === "equal" ? [50, 50] : [66.66, 33.33];
    insertBlock({ type: "journalColumns", content: widths.map((width, index) => ({ type: "journalColumn", attrs: { width }, content: [{ type: "paragraph", content: [{ type: "text", text: index === 0 ? "Main text" : index === 1 && layout === "portrait" ? "Portrait and details" : "Column " + (index + 1) }] }] })) });
    setDialog(null);
  }
  function openProperties(){
    if(!editor)return;
    let position:number|null=null, fields:JournalPropertyField[]|null=null, complex=false;
    editor.state.doc.descendants((node,pos)=>{
      if(node.type.name!=="journalPreserved"||!String(node.attrs.source).startsWith("---\n"))return;
      if(position!==null)return false;
      position=pos;fields=editableJournalProperties(String(node.attrs.source));complex=fields===null;return false;
    });
    if(complex){setError("These imported properties use advanced formatting. Their source is preserved in Advanced Markdown.");return;}
    propertyPosition.current=position;setPropertyFields(fields??[{label:"",value:"",kind:"text"}]);setError("");setDialog("properties");
  }
  function applyProperties(){
    if(!editor)return;
    try{
      const source=writeJournalProperties(propertyFields), pos=propertyPosition.current;
      if(pos!==null){const node=editor.state.doc.nodeAt(pos);if(!node||node.type.name!=="journalPreserved")throw new Error("Reopen the properties editor and try again.");
        if(source)editor.chain().focus().setNodeSelection(pos).updateAttributes("journalPreserved",{source,label:"Properties"}).run();
        else editor.chain().focus().deleteRange({from:pos,to:pos+node.nodeSize}).run();
      }else if(source)editor.chain().focus().insertContentAt(0,{type:"journalPreserved",attrs:{source,label:"Properties"}}).run();
      setDialog(null);setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"The properties could not be updated.");}
  }
  function continueBelow() {
    if (!editor) return;
    const pos = editor.state.selection.$from;
    for (let depth = 1; depth <= pos.depth; depth++) if (["journalColumns", "journalCallout", "journalSecret", "table"].includes(pos.node(depth).type.name)) {
      const end = pos.after(depth);
      editor.chain().focus().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).run(); return;
    }
  }
  function removeColumns() {
    if (!editor) return;
    const pos = editor.state.selection.$from;
    for (let depth = pos.depth; depth > 0; depth--) if (pos.node(depth).type.name === "journalColumns") {
      const node = pos.node(depth), content: JSONContent[] = [];
      node.forEach(column => column.forEach(block => content.push(block.toJSON())));
      editor.chain().focus().insertContentAt({ from: pos.before(depth), to: pos.after(depth) }, content).run(); return;
    }
  }
  async function attach(files: File[]) {
    if (!editor || locked || !files.length) return;
    setBusy(true); setError("");
    try {
      let source=value;
      for (const file of files.slice(0, 10)) {
        const src = await onAttach(file);
        if (editor.isDestroyed) return;
        const label=file.name.replace(/[\[\]\r\n]/gu, "")||"Attachment";
        const node: JSONContent = file.type.startsWith("image/") ? { type: "image", attrs: { src, alt: label } }
          : { type: "paragraph", content: [{ type: "text", text: label, marks: [{ type: "link", attrs: { href: src } }] }] };
        if (mode === "markdown") {source+="\n\n"+(file.type.startsWith("image/")?"!":"")+"["+label+"]("+src+")";change.current(source);}
        else editor.chain().focus().insertContent(node).run();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The attachment could not be added."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({ editorProps: {
      ...editor.options.editorProps,
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (point) editor.commands.setTextSelection(point.pos);
        void attach(files); return true;
      },
      handlePaste: (_view, event) => { const files = Array.from(event.clipboardData?.files ?? []); if (!files.length) return false; event.preventDefault(); void attach(files); return true; },
    } });
    // The handlers need the current upload and editing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, onAttach, locked, mode, value]);
  const button = (label: string, action: () => void, active = false, unavailable = false) => <button type="button" aria-label={label} aria-pressed={active} title={label} disabled={locked || unavailable} className={active ? "is-active" : ""} onMouseDown={event => event.preventDefault()} onClick={action}>{label}</button>;
  const visiblePages = pages.filter(page => page.kind === "page" && page.title.toLocaleLowerCase().includes(linkSearch.toLocaleLowerCase()));
  return <section className="journal-composer" aria-label="Page editor" onKeyDown={event=>{if(dialog&&dialog!=="properties"&&event.key==="Enter"&&["INPUT","SELECT"].includes((event.target as HTMLElement).tagName)){event.preventDefault();if(dialog==="link")addLink();else if(dialog==="card")addCard();else addColumns();}}}>
    <div className="journal-editor-modes" role="group" aria-label="Editing mode">{(["visual", "preview", "markdown"] as const).map(item => <button type="button" key={item} aria-pressed={mode === item} disabled={locked} onClick={() => setMode(item)}>{item === "visual" ? "Write" : item === "preview" ? "Preview" : "Advanced Markdown"}</button>)}</div>
    {!current && <div className="journal-template-choice"><label>Start with <select aria-label="Page template" value={template} disabled={locked} onChange={event => {
       const next = event.target.value;
       if (value.trim() && value !== templateApplied.current && !window.confirm("Replace the current page content with this template?")) return;
       const content = journalTemplates[next] ?? "";
       templateApplied.current = content;
       setTemplate(next);
       onChange(content);
      }}><option value="blank">Blank page</option><option value="character">Character / creature</option><option value="location">Location</option><option value="session">Session notes</option></select></label>{template !== "blank" && <button type="button" className="twe-button twe-button-subtle" disabled={locked} onClick={() => {
       if (value !== templateApplied.current && !window.confirm("Clear the page and return to a blank page?")) return;
       templateApplied.current = ""; setTemplate("blank"); onChange("");
      }}>Clear template</button>}</div>}
    {error && <p className="twe-workspace-alert" role="alert">{error}</p>}
    {mode === "visual" && <>
      <div className="journal-editor-toolbar" role="toolbar" aria-label="Text formatting">
        <select aria-label="Text style" value={state?.heading ?? "paragraph"} disabled={!editor || locked} onChange={event => event.target.value === "paragraph" ? editor?.chain().focus().setParagraph().run() : editor?.chain().focus().setHeading({ level: Number(event.target.value) as 1 | 2 | 3 }).run()}><option value="paragraph">Body text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select>
        {button("Bold", () => { editor?.chain().focus().toggleBold().run(); }, state?.bold)}
        {button("Italic", () => { editor?.chain().focus().toggleItalic().run(); }, state?.italic)}
        {button("Strikethrough", () => { editor?.chain().focus().toggleStrike().run(); }, state?.strike)}
        {button("Bullets", () => { editor?.chain().focus().toggleBulletList().run(); }, state?.bullet)}
        {button("Numbered list", () => { editor?.chain().focus().toggleOrderedList().run(); }, state?.ordered)}
        {button("Quote", () => { editor?.chain().focus().toggleBlockquote().run(); }, state?.quote)}
        {button("Link", openLink)}
        {button("Undo", () => { editor?.chain().focus().undo().run(); }, false, !state?.undo)}
        {button("Redo", () => { editor?.chain().focus().redo().run(); }, false, !state?.redo)}
      </div>
      <details className="journal-editor-insert-menu"><summary>Insert content ▾</summary><div className="journal-editor-insert" role="toolbar" aria-label="Insert page content">
        {button("Image or PDF", () => attachment.current?.click())}
        {button("Properties",openProperties)}
        {button("Fact card", () => { setCardLabel(""); setCardValue(""); setError(""); setDialog("card"); })}
        {button("Table", () => { editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(); })}
        {button("Columns", () => setDialog("columns"))}
        {button("Divider", () => { editor?.chain().focus().setHorizontalRule().run(); })}
        {button("GM-only block", () => { editor?.chain().focus().wrapIn("journalSecret").run(); }, state?.secret, state?.secret)}
        {(state?.table || state?.columns || state?.secret || state?.callout) && button("Continue below block", continueBelow)}
      </div>
      {state?.table && <div className="journal-editor-context" role="toolbar" aria-label="Table tools">{button("Add row", () => { editor?.chain().focus().addRowAfter().run(); })}{button("Add column", () => { editor?.chain().focus().addColumnAfter().run(); })}{button("Delete row", () => { editor?.chain().focus().deleteRow().run(); })}{button("Delete column", () => { editor?.chain().focus().deleteColumn().run(); })}{button("Remove table", () => { editor?.chain().focus().deleteTable().run(); })}</div>}
      {state?.columns && <div className="journal-editor-context" role="toolbar" aria-label="Column tools"><label>Column width<select aria-label="Current column width" value={String(Math.round(Number(editor?.getAttributes("journalColumn").width) || 50))} disabled={locked} onChange={event => editor?.chain().focus().updateAttributes("journalColumn", { width: Number(event.target.value) }).run()}><option value="33">Narrow</option><option value="50">Equal</option><option value="67">Wide</option></select></label>{button("Remove columns, keep content", removeColumns)}</div>}
      {state?.image && <div className="journal-editor-context"><label>Image description<input aria-label="Image description" value={String(editor?.getAttributes("image").alt??"")} disabled={locked} onChange={event=>editor?.commands.updateAttributes("image",{alt:event.target.value.replace(/[\[\]\r\n]/gu,"")})}/></label>{button("Remove image",()=>{editor?.chain().focus().deleteSelection().run();})}</div>}
      {state?.properties&&<div className="journal-editor-context">{button("Edit properties",openProperties)}</div>}
      <EditorContent editor={editor} className="journal-visual-surface"/>
    </>}
    {mode === "markdown" && <label className="twe-workspace-field">Page content<textarea aria-label="Markdown source" rows={20} value={value} disabled={locked} onChange={event => onChange(event.target.value)}/></label>}
    {mode === "preview" && <div className="twe-workspace-prose journal-editor-preview"><JournalDocument content={resolveJournalWikilinks(journalPropertiesMarkdown(value), current ?? { id: "", title: "", parentId: null }, pages)} onJournalNavigate={() => {}} previewImageUrls={localImageUrls}/></div>}
    <input ref={attachment} className="journal-file-input" aria-label="Attach image or PDF" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" disabled={locked} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void attach(files); }}/>
    {mode === "markdown" && <button type="button" className="twe-button" disabled={locked} onClick={() => attachment.current?.click()}>Attach image or PDF</button>}
    {busy && <p role="status">Adding attachment…</p>}
    {dialog && <CampaignDialog title={dialog === "link" ? "Add link" : dialog === "card" ? "Add fact card" : dialog === "properties" ? "Page properties" : "Add columns"} onClose={() => { setDialog(null); setError(""); }}>
      {error && <p role="alert">{error}</p>}
      {dialog === "link" && <div className="journal-editor-dialog-fields"><label>Link to<select value={linkKind} onChange={event => { setLinkKind(event.target.value as "page" | "web"); setLinkTarget(""); }}><option value="page">Journal page</option><option value="web">Web address</option></select></label>{linkKind === "page" ? <><label>Find a page<input value={linkSearch} onChange={event => setLinkSearch(event.target.value)}/></label><label>Page<select value={linkTarget} onChange={event => setLinkTarget(event.target.value)}><option value="">Choose a page…</option>{visiblePages.map(page => <option key={page.id} value={page.id}>{page.title}</option>)}</select></label></> : <label>Web address<input autoFocus type="url" placeholder="https://…" value={linkTarget} onChange={event => setLinkTarget(event.target.value)}/></label>}<label>Link text<input value={linkText} onChange={event => setLinkText(event.target.value)}/></label><div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" onClick={addLink}>Add link</button><button type="button" className="twe-button" onClick={() => { editor?.chain().focus().setTextSelection(selection.current).unsetLink().run(); setDialog(null); }}>Remove link</button></div></div>}
      {dialog === "card" && <div className="journal-editor-dialog-fields"><label>Label<input autoFocus placeholder="Location, species, affiliation…" value={cardLabel} onChange={event => setCardLabel(event.target.value)}/></label><label>Value<input placeholder="The detail to display" value={cardValue} onChange={event => setCardValue(event.target.value)}/></label><button type="button" className="twe-button twe-button-primary" onClick={addCard}>Add card</button></div>}
      {dialog === "columns" && <div className="journal-editor-dialog-fields"><label>Layout<select value={layout} onChange={event => setLayout(event.target.value)}><option value="portrait">Wide text + portrait / details</option><option value="equal">Two equal columns</option><option value="three">Three columns</option></select></label><button type="button" className="twe-button twe-button-primary" onClick={addColumns}>Add columns</button></div>}
      {dialog === "properties"&&<div className="journal-editor-dialog-fields" onKeyDown={event=>{if(event.key==="Enter"&&(event.target as HTMLElement).tagName!=="TEXTAREA")event.preventDefault();}}>
        {propertyFields.map((field,index)=><div className="journal-property-row" key={index}><label>Label<input aria-label={"Property "+(index+1)+" label"} value={field.label} onChange={event=>setPropertyFields(old=>old.map((item,i)=>i===index?{...item,label:event.target.value}:item))}/></label><label>Type<select aria-label={"Property "+(index+1)+" type"} value={field.kind} onChange={event=>setPropertyFields(old=>old.map((item,i)=>i===index?{...item,kind:event.target.value as JournalPropertyField["kind"],value:event.target.value==="boolean"?"false":item.value}:item))}><option value="text">Text</option><option value="list">List</option><option value="number">Number</option><option value="boolean">Yes / no</option></select></label>
          <label className="journal-property-value">{field.kind==="list"?"Values (one per line)":"Value"}{field.kind==="boolean"?<select aria-label={"Property "+(index+1)+" value"} value={field.value} onChange={event=>setPropertyFields(old=>old.map((item,i)=>i===index?{...item,value:event.target.value}:item))}><option value="true">Yes</option><option value="false">No</option></select>:<textarea aria-label={"Property "+(index+1)+" value"} rows={field.kind==="list"?3:2} value={field.value} onChange={event=>setPropertyFields(old=>old.map((item,i)=>i===index?{...item,value:event.target.value}:item))}/>}</label><button type="button" className="twe-button" aria-label={"Remove property "+(index+1)} onClick={()=>setPropertyFields(old=>old.filter((_,i)=>i!==index))}>Remove</button></div>)}
        <div className="twe-workspace-action-row"><button type="button" className="twe-button" onClick={()=>setPropertyFields(old=>[...old,{label:"",value:"",kind:"text"}])}>Add property</button><button type="button" className="twe-button twe-button-primary" onClick={applyProperties}>Apply properties</button></div>
      </div>}
    </CampaignDialog>}
  </section>;
}

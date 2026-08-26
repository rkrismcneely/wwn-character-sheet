"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { preloadRulesSearch, searchRules, type RuleEntry } from "./rules-search";

function formattedRuleText(text: string): ReactNode[] {
  const blocks = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const paragraphNodes = (block: string, keyPrefix: string): ReactNode[] => {
    const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z“])/).map(sentence => sentence.trim()).filter(Boolean);
    const paragraphs: ReactNode[] = [];
    for (let index = 0; index < sentences.length; index += 3) {
      paragraphs.push(<p key={`${keyPrefix}-${index}`}>{sentences.slice(index, index + 3).join(" ")}</p>);
    }
    return paragraphs;
  };

  return blocks.flatMap((block, blockIndex) => {
    const bulletParts = block.split(/\s+·\s+/).map(part => part.trim()).filter(Boolean);
    if (bulletParts.length > 1) {
      const [introduction, ...rawItems] = bulletParts;
      const continuationIndex = rawItems.findIndex(item => item.startsWith(". "));
      const items = rawItems.slice(0, continuationIndex >= 0 ? continuationIndex : undefined).filter(item => item !== ".");
      const continuation = continuationIndex >= 0 ? rawItems.slice(continuationIndex).join(" ").replace(/^\.\s*/, "") : "";
      const isTwoColumnTable = items.length >= 4 && items.length % 2 === 0;
      return [
        introduction ? <p key={`${blockIndex}-intro`}>{introduction}</p> : null,
        items.length ? <ul className={isTwoColumnTable ? "rule-pairs" : undefined} key={`${blockIndex}-list`}>
          {isTwoColumnTable
            ? items.reduce<ReactNode[]>((rows, item, itemIndex) => {
                if (itemIndex % 2 === 0) rows.push(<li key={itemIndex}><strong>{item}</strong><span>{items[itemIndex + 1]}</span></li>);
                return rows;
              }, [])
            : items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
        </ul> : null,
        ...paragraphNodes(continuation, `${blockIndex}-continuation`),
      ].filter(Boolean) as ReactNode[];
    }
    return paragraphNodes(block, `${blockIndex}-paragraph`);
  });
}

export function RulesAssistant({ compact = false, className = "", id = "rules-question" }: { compact?: boolean; className?: string; id?: string }) {
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<RuleEntry[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(!compact);
  const assistant = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = `${id}-panel`;

  const close = useCallback(() => {
    setSearched(false);
    if (compact) setOpen(false);
  }, [compact]);

  async function askRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    setResults(await searchRules(trimmedQuestion));
    setSearched(true);
  }

  useEffect(() => {
    if (!searched && !open) return;
    const dismiss = (event: PointerEvent) => {
      if (!assistant.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [close, open, searched]);

  const questionFields = <>
    <label htmlFor={id}>Ask the WWN Rules Assistant</label>
    <div className="rules-question-row">
      <input ref={input} id={id} name="wwn-rules-question-no-history" type="search" autoComplete="off" data-lpignore="true" value={question} onChange={event => setQuestion(event.target.value)} onFocus={preloadRulesSearch} placeholder="What happens at 0 HP?" />
      <button type="submit">Search</button>
    </div>
    {searched && <div className="rules-results" aria-live="polite">
      {results.length ? results.map(result => <details className="rule-result" key={`${result.source}:${result.title}`}>
        <summary><span className="rule-result-heading"><strong>{result.title}</strong><span className="rule-result-toggle" aria-hidden="true">Show full section</span></span><p className="rule-result-preview">{result.text}</p><small className="rule-result-source">{result.source}</small></summary>
        <div className="rule-result-full">{formattedRuleText(result.fullText || result.text)}<span aria-hidden="true">Click the result again to collapse</span></div>
      </details>) : <p className="rules-no-result">No close SRD match found. Try a rule name such as “System Strain,” “Shock,” or a spell, Art, Focus, or weapon name.</p>}
    </div>}
  </>;

  return <form ref={assistant} className={`rules-assistant${compact ? " rules-assistant-compact" : ""}${className ? ` ${className}` : ""}`} data-readonly-interactive="true" autoComplete="off" onSubmit={askRules}>
    {compact && <button type="button" className="rules-assistant-toggle" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => { setOpen(current => { const nextOpen = !current; if (nextOpen) window.requestAnimationFrame(() => input.current?.focus()); return nextOpen; }); }}>Rules Checker</button>}
    {compact ? open && <div className="rules-assistant-panel" id={panelId} role="dialog" aria-label="WWN Rules Assistant">{questionFields}</div> : questionFields}
  </form>;
}

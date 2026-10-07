"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getRuleDetail, preloadRulesSearch, searchRules, type RuleEntry, type RuleReference } from "./rules-search";

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

function matchKindLabel(rule: RuleEntry, best = false) {
  if (best && rule.confidence === "low") return "Possible match";
  if (best && rule.ambiguous) return "Several possible rules";
  if (rule.matchKind === "controlling") return best ? "Best answer · Controlling rule" : "Controlling rule";
  if (rule.matchKind === "supporting") return "Supporting rule";
  return best ? "Best match" : "Related match";
}

function referenceKey(reference: RuleReference) {
  return `${reference.source}:${reference.title}`;
}

function RuleDetailView({
  rule,
  onBack,
  onOpenRule,
}: {
  rule: RuleEntry;
  onBack: () => void;
  onOpenRule: (title: string) => void;
}) {
  const parents = rule.context?.parents ?? [];
  const children = rule.context?.children ?? [];
  const nearby = rule.context?.nearby ?? [];
  const related = rule.relatedRules ?? [];
  const detailTitle = rule.detailTitle || rule.title;
  const detailSource = rule.detailSource || rule.source;

  return <article className="rule-detail-view">
    <div className="rule-detail-navigation">
      <button type="button" className="rule-detail-back" onClick={onBack}>← Back to results</button>
      <span className={`rule-result-kind ${rule.matchKind || "match"} confidence-${rule.confidence || "medium"}`}>{matchKindLabel(rule, true)}</span>
    </div>
    <header className="rule-detail-heading">
      <h3>{rule.title}</h3>
      <small>{rule.source}</small>
    </header>
    <section className="rule-detail-quick" aria-labelledby="rule-detail-quick-heading">
      <h4 id="rule-detail-quick-heading">Quick answer</h4>
      <p>{rule.text}</p>
    </section>
    <section className="rule-detail-full" aria-labelledby="rule-detail-full-heading">
      <div className="rule-detail-section-heading">
        <h4 id="rule-detail-full-heading">Full rule{detailTitle !== rule.title ? ` · ${detailTitle}` : ""}</h4>
        <small>{detailSource}</small>
      </div>
      {formattedRuleText(rule.fullText || rule.text)}
    </section>
    {parents.length > 0 && <section className="rule-detail-context" aria-labelledby="rule-detail-context-heading">
      <h4 id="rule-detail-context-heading">Rule context</h4>
      <p className="rule-detail-help">The immediate rule structure around this section, so the result is not read in isolation.</p>
      {parents.map((parent, index) => <details className="rule-context-section" key={referenceKey(parent)} open={index === 0 ? true : undefined}>
        <summary><strong>{parent.title}</strong><small>{parent.source}</small></summary>
        <div>{formattedRuleText(parent.text)}</div>
      </details>)}
    </section>}
    {children.length > 0 && <section className="rule-detail-links" aria-labelledby="rule-detail-subrules-heading">
      <h4 id="rule-detail-subrules-heading">Direct subrules</h4>
      <div className="rule-related-links">{children.map(child => <button type="button" className="rule-related-link" key={referenceKey(child)} onClick={() => onOpenRule(child.title)}>
        <strong>{child.title}</strong><span>{child.text}</span><small>{child.source}</small>
      </button>)}</div>
    </section>}
    {related.length > 0 && <section className="rule-detail-links" aria-labelledby="rule-detail-related-heading">
      <h4 id="rule-detail-related-heading">Related rules</h4>
      <div className="rule-related-links compact">{related.map(reference => <button type="button" className="rule-related-link" key={referenceKey(reference)} onClick={() => onOpenRule(reference.title)}>
        <strong>{reference.title}</strong><small>{reference.source}</small>
      </button>)}</div>
    </section>}
    {nearby.length > 0 && <section className="rule-detail-links" aria-labelledby="rule-detail-nearby-heading">
      <h4 id="rule-detail-nearby-heading">Nearby rules</h4>
      <div className="rule-related-links compact">{nearby.map(reference => <button type="button" className="rule-related-link" key={referenceKey(reference)} onClick={() => onOpenRule(reference.title)}>
        <strong>{reference.title}</strong><small>{reference.source}</small>
      </button>)}</div>
    </section>}
  </article>;
}

export function RulesAssistant({ compact = false, className = "", id = "rules-question" }: { compact?: boolean; className?: string; id?: string }) {
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<RuleEntry[]>([]);
  const [selectedRule, setSelectedRule] = useState<RuleEntry | null>(null);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(!compact);
  const assistant = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = `${id}-panel`;

  const close = useCallback(() => {
    setSearched(false);
    setSelectedRule(null);
    if (compact) setOpen(false);
  }, [compact]);

  async function askRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    setResults(await searchRules(trimmedQuestion));
    setSelectedRule(null);
    setSearched(true);
  }

  async function openRuleDetail(title: string) {
    const detail = await getRuleDetail(title, question.trim());
    if (detail) setSelectedRule(detail);
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
    {searched && <div className={`rules-results${selectedRule ? " has-rule-detail" : ""}`} aria-live="polite">
      {selectedRule
        ? <RuleDetailView rule={selectedRule} onBack={() => setSelectedRule(null)} onOpenRule={title => void openRuleDetail(title)} />
        : results.length
          ? <>
            {results[0]?.ambiguous
              ? <p className="rules-search-guidance is-ambiguous">This question could reasonably point to more than one rule. Compare the top results before relying on one answer.</p>
              : results[0]?.confidence === "low"
                ? <p className="rules-search-guidance is-low-confidence">These are weak matches rather than a confident rules answer. Try adding the action, condition, class, or rule term you are asking about.</p>
                : null}
            <div className="rule-result-list">{results.map((result, index) => <article className="rule-result" key={`${result.source}:${result.title}`}>
              <button type="button" className="rule-result-summary" onClick={() => void openRuleDetail(result.title)}>
                <span className="rule-result-heading"><strong>{result.title}</strong><span className={`rule-result-kind ${result.matchKind || "match"} confidence-${result.confidence || "medium"}`}>{matchKindLabel(result, index === 0)}</span></span>
                <p className="rule-result-preview">{result.text}</p>
                <span className="rule-result-footer"><small className="rule-result-source">{result.source}</small><span className="rule-result-toggle">More details →</span></span>
              </button>
            </article>)}</div>
          </>
          : <p className="rules-no-result">No close SRD match found. Try a rule name such as “System Strain,” “Shock,” or a spell, Art, Focus, or weapon name.</p>}
    </div>}
  </>;

  return <form ref={assistant} className={`rules-assistant${compact ? " rules-assistant-compact" : ""}${className ? ` ${className}` : ""}`} data-readonly-interactive="true" autoComplete="off" onSubmit={askRules}>
    {compact && <button type="button" className="rules-assistant-toggle" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => { setOpen(current => { const nextOpen = !current; if (nextOpen) window.requestAnimationFrame(() => input.current?.focus()); return nextOpen; }); }}>Rules Checker</button>}
    {compact ? open && <div className="rules-assistant-panel" id={panelId} role="dialog" aria-label="WWN Rules Assistant">{questionFields}</div> : questionFields}
  </form>;
}

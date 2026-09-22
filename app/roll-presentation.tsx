import { useEffect, useRef } from "react";
import { formatDiceExpression, formatShockMinimumReminder, formatSigned, type RollResult } from "./rolls.ts";

export function formatRollBreakdown(result: RollResult) {
  const dice = result.dice.results.join(" + ");
  const modifiers = result.modifiers.map(modifier => `${modifier.label} ${formatSigned(modifier.value)}`);
  return [`${formatDiceExpression(result.dice)} [${dice}]`, ...modifiers].join(" · ");
}

function ResultOutcome({ result }: { result: RollResult }) {
  if (!result.outcome) return null;
  return <span className={`roll-outcome ${result.outcome}`}>{result.outcome === "success" ? "Success" : "Failure"}</span>;
}

export function RollResultTray({ result }: { result: RollResult | null }) {
  if (!result) return <section className="roll-result-tray roll-result-empty" aria-label="Latest roll" aria-live="polite" aria-atomic="true" role="status">
    <div>
      <span className="roll-result-kicker">Latest Roll</span>
      <span className="roll-result-breakdown">Roll a die or a sheet value to see the result here.</span>
    </div>
    <div className="roll-result-total" aria-hidden="true"><strong>—</strong></div>
  </section>;
  return <section className="roll-result-tray" aria-live="polite" aria-atomic="true" role="status">
    <div>
      <span className="roll-result-kicker">Latest Roll</span>
      <span className="roll-result-label">{result.character.name} · {result.label}</span>
      <span className="roll-result-breakdown">{formatRollBreakdown(result)}</span>
      {result.shockMinimum && <span className="roll-result-reminder">{formatShockMinimumReminder(result.shockMinimum)}</span>}
    </div>
    <div className="roll-result-total">
      <strong>{result.total}</strong>
      {result.target !== undefined && <span>vs {result.target}+</span>}
      <ResultOutcome result={result} />
    </div>
  </section>;
}

export function RollHistoryPanel({
  history,
  open,
  onClose,
  onClear,
  description = "Stored only in this browser session",
}: {
  history: RollResult[];
  open: boolean;
  onClose: () => void;
  onClear?: () => void;
  description?: string;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [open, onClose]);

  if (!open) return null;
  return <section className="roll-history" role="dialog" aria-modal="false" aria-labelledby="roll-history-title">
    <header>
      <div><strong id="roll-history-title">Roll History</strong><span>{description}</span></div>
      <div>{onClear && <button type="button" onClick={onClear} disabled={!history.length}>Clear history</button>}<button ref={closeButton} type="button" onClick={onClose}>Close</button></div>
    </header>
    {history.length ? <ol>
      {history.map(result => <li key={result.id}>
        <div><strong>{result.label}</strong><span>{result.character.name} · {formatRollBreakdown(result)}</span>{result.shockMinimum && <span className="roll-result-reminder">{formatShockMinimumReminder(result.shockMinimum)}</span>}</div>
        <div className="roll-history-total"><b>{result.total}</b>{result.target !== undefined && <small>vs {result.target}+</small>}<ResultOutcome result={result} /></div>
      </li>)}
    </ol> : <p>{description === "Stored only in this browser session" ? "No rolls yet in this browser session." : "No shared rolls yet."}</p>}
  </section>;
}

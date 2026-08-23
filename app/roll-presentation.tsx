import { formatDiceExpression, formatSigned, type RollResult } from "./rolls.ts";

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
  if (!result) return null;
  return <section className="roll-result-tray" aria-live="polite" aria-atomic="true" role="status">
    <div>
      <span className="roll-result-label">{result.character.name} · {result.label}</span>
      <span className="roll-result-breakdown">{formatRollBreakdown(result)}</span>
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
}: {
  history: RollResult[];
  open: boolean;
  onClose: () => void;
  onClear: () => void;
}) {
  if (!open) return null;
  return <section className="roll-history" aria-label="Roll History">
    <header>
      <div><strong>Roll History</strong><span>Stored only in this browser session</span></div>
      <div><button type="button" onClick={onClear} disabled={!history.length}>Clear history</button><button type="button" onClick={onClose}>Close</button></div>
    </header>
    {history.length ? <ol>
      {history.map(result => <li key={result.id}>
        <div><strong>{result.label}</strong><span>{result.character.name} · {formatRollBreakdown(result)}</span></div>
        <div className="roll-history-total"><b>{result.total}</b>{result.target !== undefined && <small>vs {result.target}+</small>}<ResultOutcome result={result} /></div>
      </li>)}
    </ol> : <p>No rolls yet in this browser session.</p>}
  </section>;
}

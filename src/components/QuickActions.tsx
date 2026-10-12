import { useApp } from "./ui";

/** Primary stock actions, one tap each: watch, and jump to the alert form. */
export default function QuickActions({ symbol, onAlert }: { symbol: string; onAlert: () => void }) {
  const { tr, watchlist, toggleWatch } = useApp();
  const watched = watchlist.includes(symbol);
  return (
    <div className="quick-actions">
      <button className={`qa ${watched ? "on" : ""}`} aria-pressed={watched} onClick={() => toggleWatch(symbol)}>
        <span aria-hidden="true">{watched ? "★" : "☆"}</span> {tr(watched ? "removeWatch" : "addWatch")}
      </button>
      <button className="qa primary" onClick={onAlert}>
        <span aria-hidden="true">🔔</span> {tr("setAlert")}
      </button>
    </div>
  );
}

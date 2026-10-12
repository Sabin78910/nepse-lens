import { useState } from "react";
import { Card, useApp } from "./ui";
import type { SyncApi, SyncStatus } from "../useSync";

export function statusLabel(s: SyncStatus, now: number, tr: ReturnType<typeof useApp>["tr"]): string {
  switch (s.kind) {
    case "syncing":
      return tr("syncing");
    case "offline":
      return tr("syncOffline");
    case "error":
      return tr("syncError");
    case "synced": {
      const mins = Math.floor((now - s.at) / 60000);
      return s.at === 0 || mins < 1 ? tr("syncJustNow") : tr("syncAgo", { n: String(mins) });
    }
    default:
      return "";
  }
}

export function SyncChip({ status }: { status: SyncStatus }) {
  const { tr } = useApp();
  if (status.kind === "off") return null;
  const mark = status.kind === "error" ? "!" : status.kind === "offline" ? "○" : status.kind === "syncing" ? "…" : "✓";
  return (
    <span className={`badge sync-chip ${status.kind}`} role="status">
      <span aria-hidden="true">{mark}</span> {statusLabel(status, Date.now(), tr)}
    </span>
  );
}

export default function SyncCard({ sync }: { sync: SyncApi }) {
  const { tr } = useApp();
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!sync.code) return;
    try {
      await navigator.clipboard.writeText(sync.code);
      setCopied(true);
    } catch {
      // clipboard blocked: the code is still shown for manual copying
    }
  };
  return (
    <Card title={tr("syncTitle")} actions={<SyncChip status={sync.status} />}>
      <p className="muted small">{tr("syncBlurb")}</p>
      {sync.code ? (
        <>
          <p className="small">{tr("syncYourCode")}</p>
          <code className="sync-code tabular">{sync.code}</code>
          <div className="setting">
            <button onClick={() => void copy()}>{copied ? tr("syncCopied") : tr("syncCopy")}</button>
            <button onClick={sync.syncNow}>{sync.status.kind === "error" || sync.status.kind === "offline" ? tr("syncRetry") : tr("syncNow")}</button>
            <button onClick={sync.turnOff}>{tr("syncOff")}</button>
          </div>
        </>
      ) : (
        <>
          <button className="primary" onClick={() => { sync.turnOn(); setCopied(false); }}>{tr("syncOn")}</button>
          <form
            className="setting"
            onSubmit={(e) => {
              e.preventDefault();
              setBad(!sync.useCode(typed));
              setTyped("");
            }}
          >
            <label>
              {tr("syncUseCode")}
              <input type="password" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tr("syncPaste")} />
            </label>
            <button type="submit">{tr("syncUse")}</button>
          </form>
          {bad && <p role="alert" className="down small">{tr("syncBadCode")}</p>}
        </>
      )}
    </Card>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { SyncClient, newSyncCode, parseSyncCode } from "./sync";
import { emptyDoc, materialize, mergeDocs, reconcile, type Lists, type SyncDoc } from "./lib/syncMerge";
import { load, save } from "./lib/storage";

export const SYNC_CODE_KEY = "sabin-labs-sync-code";
const DOC_KEY = "nl.syncdoc";
const VERSION_KEY = "nl.syncver";
const APP_ID = "nepse-lens";
export const DEBOUNCE_MS = 2000;

export type SyncStatus = { kind: "off" } | { kind: "syncing" } | { kind: "synced"; at: number } | { kind: "offline" } | { kind: "error" };

export interface SyncApi {
  code: string | null;
  status: SyncStatus;
  turnOn: () => string;
  useCode: (code: string) => boolean;
  syncNow: () => void;
  turnOff: () => void;
}

// The sync code is a secret: it only ever lives in localStorage and is never logged.
export function readCode(): string | null {
  try {
    const c = localStorage.getItem(SYNC_CODE_KEY);
    return c && parseSyncCode(c) ? c : null;
  } catch {
    return null;
  }
}

function writeCode(code: string | null) {
  try {
    if (code) localStorage.setItem(SYNC_CODE_KEY, code);
    else localStorage.removeItem(SYNC_CODE_KEY);
  } catch {
    // storage blocked: sync stays off for this session
  }
}

export type ClientFactory = (code: string) => Pick<SyncClient, "sync">;
const defaultFactory: ClientFactory = (code) => new SyncClient(code, APP_ID);

export function useSync(lists: Lists, apply: (l: Lists) => void, makeClient: ClientFactory = defaultFactory): SyncApi {
  const [code, setCode] = useState<string | null>(readCode);
  const [status, setStatus] = useState<SyncStatus>(() => (readCode() ? { kind: "synced", at: 0 } : { kind: "off" }));
  const doc = useRef<SyncDoc>(load(DOC_KEY, emptyDoc()));
  const latest = useRef({ lists, apply });
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dueAt = useRef(0);
  useEffect(() => {
    latest.current = { lists, apply };
  });

  const run = useCallback(
    async (c: string) => {
      if (running.current) return;
      running.current = true;
      setStatus({ kind: "syncing" });
      try {
        doc.current = reconcile(doc.current, latest.current.lists, Date.now());
        const res = await makeClient(c).sync(doc.current, load(VERSION_KEY, 0), mergeDocs);
        if (readCode() !== c) return; // turned off while in flight
        doc.current = res.value;
        save(DOC_KEY, doc.current);
        save(VERSION_KEY, res.version);
        latest.current.apply(materialize(doc.current));
        setStatus({ kind: "synced", at: Date.now() });
      } catch (e) {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        setStatus({ kind: offline || e instanceof TypeError ? "offline" : "error" });
      } finally {
        running.current = false;
      }
    },
    [makeClient],
  );

  const schedule = useCallback(
    (delay: number) => {
      if (!code) return;
      const due = Date.now() + delay;
      if (timer.current && dueAt.current <= due) return; // an earlier sync is already queued
      clearTimeout(timer.current);
      dueAt.current = due;
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void run(code);
      }, delay);
    },
    [code, run],
  );

  // On start / when turned on
  useEffect(() => {
    schedule(0);
    return () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [schedule]);

  // On change, debounced: only when this device's data really differs from what was last recorded.
  useEffect(() => {
    if (!code) return;
    const next = reconcile(doc.current, lists, Date.now());
    if (next === doc.current) return;
    doc.current = next;
    save(DOC_KEY, next);
    schedule(DEBOUNCE_MS);
  }, [code, lists, schedule]);

  // When the tab becomes visible again, and when the network returns
  useEffect(() => {
    if (!code) return;
    const on = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    document.addEventListener("visibilitychange", on);
    window.addEventListener("online", on);
    return () => {
      document.removeEventListener("visibilitychange", on);
      window.removeEventListener("online", on);
    };
  }, [code, schedule]);

  const enable = (c: string) => {
    writeCode(c);
    setCode(c);
  };
  return {
    code,
    status,
    turnOn: () => {
      const c = newSyncCode();
      enable(c);
      return c;
    },
    useCode: (c) => {
      const t = c.trim();
      if (!parseSyncCode(t)) return false;
      enable(t);
      return true;
    },
    syncNow: () => schedule(0),
    turnOff: () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      writeCode(null);
      setCode(null);
      setStatus({ kind: "off" });
    },
  };
}

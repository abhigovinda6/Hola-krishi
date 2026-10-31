"use client";
// Shared client state: the farm profile (URL params + localStorage, so refresh/share never loses data),
// language, recommendation fetch cache, and the notification store (read/unread in localStorage).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/i18n";

import { savedFarm, EMPTY, farmToQs, qsToFarm, farmReady, farmToPayload, type Farm } from "@/lib/farm";
export * from "@/lib/farm";
export const LS = "holakrishi.farm.v2", LS_LANG = "holakrishi.lang", LS_READ = "holakrishi.alerts.read", LS_SEEN = "holakrishi.alerts.seen", LS_BROWSER = "holakrishi.browser";

export type Options = { byDistrict: Record<string, string[]>; crops: { id: string; label: string; label_kn: string }[] };
export interface Alert { id: string; kind: string; severity: "info" | "warn" | "action"; title: string; body: string; href?: string }
type Rec = { ctx: any; results: any[]; explanations: Record<string, string>; alerts: Alert[]; llm_available: boolean };

interface Ctx {
  farm: Farm; update: (p: Partial<Farm>) => void; qs: string; ready: boolean; opts: Options;
  lang: Lang; setLang: (l: Lang) => void;
  rec: Rec | null; recError: string | null; loading: boolean;
  alerts: Alert[]; read: Set<string>; markRead: (id: string) => void; markAll: () => void;
  hydrated: boolean; savedOnLoad: Farm | null; reset: () => void;
  toasts: Alert[]; dismissToast: (id: string) => void; browser: boolean; enableBrowser: () => Promise<string>;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

export function AppProvider({ opts, children }: { opts: Options; children: ReactNode }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [farm, setFarm] = useState<Farm>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [lang, setLangS] = useState<Lang>("en");
  const [rec, setRec] = useState<Rec | null>(null); const [recError, setRecError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set()); const [toasts, setToasts] = useState<Alert[]>([]); const [browser, setBrowser] = useState(false);
  const [savedOnLoad, setSavedOnLoad] = useState<Farm | null>(null);
  const cache = useRef(new Map<string, Rec>());

  // hydrate: URL params win over localStorage
  useEffect(() => {
    setSavedOnLoad(savedFarm(localStorage.getItem(LS)));
    const merged = { ...EMPTY, ...load<Partial<Farm>>(LS, {}), ...qsToFarm(new URLSearchParams(params.toString())) };
    setFarm(merged); setLangS(load<Lang>(LS_LANG, "en")); setRead(new Set(load<string[]>(LS_READ, []))); setBrowser(load<boolean>(LS_BROWSER, false)); setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // keep URL in sync on navigation (so every page URL is shareable/refresh-safe)
  const qs = farmToQs(farm);
  useEffect(() => { if (hydrated && params.toString() !== qs) router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false }); }, [hydrated, pathname, qs]); // eslint-disable-line

  const update = useCallback((p: Partial<Farm>) => setFarm((f) => { const n = { ...f, ...p }; localStorage.setItem(LS, JSON.stringify(n)); return n; }), []);
  const reset = useCallback(() => { localStorage.removeItem(LS); setSavedOnLoad(null); setFarm({ ...EMPTY }); }, []);
  const setLang = (l: Lang) => { setLangS(l); localStorage.setItem(LS_LANG, JSON.stringify(l)); };
  const ready = farmReady(farm);

  // fetch recommendation whenever the profile is complete
  useEffect(() => {
    if (!hydrated || !ready) { setRec(null); return; }
    const payload = farmToPayload(farm); const key = JSON.stringify(payload);
    if (cache.current.has(key)) { setRec(cache.current.get(key)!); setRecError(null); return; }
    let live = true; setLoading(true);
    fetch(`/api/recommend?p=${encodeURIComponent(key)}`) // GET: cacheable at the edge
      .then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) { setRecError(j.error); setRec(null); } else { cache.current.set(key, j); setRec(j); setRecError(null); } })
      .catch((e) => live && setRecError(`Network problem: ${e}`)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [hydrated, ready, qs]); // eslint-disable-line

  // new alerts -> toast (+ optional browser notification), once per alert id
  const alerts = rec?.alerts ?? [];
  useEffect(() => {
    if (!alerts.length) return;
    const seen = new Set(load<string[]>(LS_SEEN, []));
    const fresh = alerts.filter((a) => !seen.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.add(a.id)); localStorage.setItem(LS_SEEN, JSON.stringify([...seen]));
    setToasts((t) => [...t, ...fresh.slice(0, 3)]);
    if (browser && typeof Notification !== "undefined" && Notification.permission === "granted")
      fresh.slice(0, 3).forEach((a) => new Notification(a.title, { body: a.body }));
  }, [alerts, browser]);
  useEffect(() => { if (!toasts.length) return; const h = setTimeout(() => setToasts((t) => t.slice(1)), 6000); return () => clearTimeout(h); }, [toasts]);

  const saveRead = (s: Set<string>) => { setRead(s); localStorage.setItem(LS_READ, JSON.stringify([...s])); };
  const markRead = (id: string) => saveRead(new Set([...read, id]));
  const markAll = () => saveRead(new Set([...read, ...alerts.map((a) => a.id)]));
  const enableBrowser = async () => {
    if (typeof Notification === "undefined") return "This browser does not support notifications.";
    const p = await Notification.requestPermission();
    const on = p === "granted"; setBrowser(on); localStorage.setItem(LS_BROWSER, JSON.stringify(on));
    if (on) new Notification("Hola Krishi alerts are on", { body: "We'll notify you here about sowing windows, rain risk and MSP." });
    return on ? "Browser notifications are on." : "Permission was not granted; in-app alerts still work.";
  };

  const value = useMemo<Ctx>(() => ({ farm, update, qs, ready, opts, lang, setLang, rec, recError, loading, alerts, read, markRead, markAll,
    hydrated, savedOnLoad, reset, toasts, dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)), browser, enableBrowser }),
    [farm, qs, ready, hydrated, savedOnLoad, lang, rec, recError, loading, alerts, read, toasts, browser]); // eslint-disable-line
  return <C.Provider value={value}>{children}</C.Provider>;
}

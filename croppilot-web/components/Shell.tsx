"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppState";
import { t, type Key } from "@/lib/i18n";

const NAV: { href: string; k: Key; step?: number; icon: string }[] = [
  { href: "/", k: "nav_home", icon: "◧" }, { href: "/farm", k: "nav_farm", step: 1, icon: "⌖" }, { href: "/soil", k: "nav_soil", step: 2, icon: "◒" },
  { href: "/results", k: "nav_results", step: 3, icon: "▤" },
  { href: "/alerts", k: "nav_alerts", icon: "◔" }, { href: "/about", k: "nav_about", icon: "ⓘ" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const { lang, setLang, qs, alerts, read, toasts, dismissToast } = useApp();
  const path = usePathname();
  const unread = alerts.filter((a) => !read.has(a.id)).length;
  const q = qs ? `?${qs}` : "";
  return (
    <div className={`app lang-${lang}`}>
      <aside className="side">
        <Link href={`/${q}`} className="brand"><span className="logo">ಹ</span><span><b>{t("brand", lang)}</b><small>{t("tagline", lang)}</small></span></Link>
        <nav aria-label="Main" data-scroll>{NAV.map((n) => (
          <Link key={n.href} href={`${n.href}${q}`} className={(n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "on" : ""}>
            <span className="ic">{n.step ?? n.icon}</span><span className="nl">{t(n.k, lang)}</span>{n.href === "/alerts" && unread > 0 && <span className="pill">{unread}</span>}
          </Link>))}
        </nav>
        <p className="sidefoot">Real public data · DES · AGMARKNET · NASA POWER · CACP</p>
      </aside>
      <div className="main">
        <header className="top">
          <Link href={`/${q}`} className="mbrand" aria-label={t("brand", lang)}><span className="logo">ಹ</span><b>{t("brand", lang)}</b></Link>
          <Link href={`/about${q}`} className="mabout" aria-label={t("nav_about", lang)}>ⓘ</Link>
          <div className="langs" role="group" aria-label="Language">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "kn" ? "on" : ""} onClick={() => setLang("kn")}>ಕನ್ನಡ</button>
          </div>
          <Link href={`/alerts${q}`} className="bell" aria-label={`Alerts, ${unread} unread`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {unread > 0 && <span className="count" data-testid="unread">{unread}</span>}
          </Link>
        </header>
        <div className="content">{children}</div>
      </div>
      <div className={`toasts${path === "/" ? " home" : ""}`} aria-live="polite">{toasts.map((a) => (
        <div key={a.id} className={`toast ${a.severity}`} role="status"><b>{a.title}</b><span>{a.body}</span>
          <button aria-label="Dismiss" onClick={() => dismissToast(a.id)}>×</button></div>))}
      </div>
    </div>
  );
}

export function StepNav({ back, next, nextLabel, disabled }: { back?: string; next?: string; nextLabel?: string; disabled?: boolean }) {
  const { lang, qs } = useApp(); const q = qs ? `?${qs}` : "";
  return (
    <div className="stepnav">
      {back ? <Link className="btn ghost" href={`${back}${q}`}>← {t("back", lang)}</Link> : <span />}
      {next && (disabled ? <span className="btn primary dis" aria-disabled>{nextLabel ?? t("next", lang)} →</span>
        : <Link className="btn primary" href={`${next}${q}`}>{nextLabel ?? t("next", lang)} →</Link>)}
    </div>
  );
}

export function PageHead({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return <div className="phead">{kicker && <p className="kicker">{kicker}</p>}<h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>;
}

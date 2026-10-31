"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppState";
import { PageHead } from "@/components/Shell";
import { t } from "@/lib/i18n";

const ICON: Record<string, string> = { sowing: "🌱", rain: "🌧", msp: "₹", soil: "🧪", cnp: "➜" };
export default function Alerts() {
  const { alerts, read, markRead, markAll, lang, qs, browser, enableBrowser } = useApp();
  const [msg, setMsg] = useState(""); const q = qs ? `?${qs}` : "";
  return (
    <>
      <PageHead kicker={t("nav_alerts", lang)} title={lang === "kn" ? "ಎಚ್ಚರಿಕೆಗಳು" : "Alerts for your field"} sub="Generated from your inputs and real data (NASA POWER rainfall, MSP tables, the crop rules). Read status is stored only in this browser." />
      <div className="toolbar"><span>{alerts.filter((a) => !read.has(a.id)).length} unread</span>
        <button className="btn ghost sm" onClick={markAll} disabled={!alerts.length}>{t("mark_all", lang)}</button>
        <button className="btn ghost sm" onClick={async () => setMsg(await enableBrowser())} disabled={browser}>{browser ? "Browser notifications on" : t("browser_on", lang)}</button>
        {msg && <em className="hint">{msg}</em>}</div>
      {!alerts.length && <div className="card empty">{t("alerts_empty", lang)} <Link href={`/farm${q}`}>Go to Farm →</Link></div>}
      <ul className="alerts">{alerts.map((a) => (
        <li key={a.id} className={`card alert ${a.severity} ${read.has(a.id) ? "read" : "unread"}`}>
          <span className="aic">{ICON[a.kind] ?? "•"}</span>
          <div><b>{a.title}</b><p>{a.body}</p>
            <div className="aact">{a.href && <Link href={`${a.href}${q}`} onClick={() => markRead(a.id)}>Open →</Link>}
              {!read.has(a.id) && <button className="btn ghost sm" onClick={() => markRead(a.id)}>Mark read</button>}</div></div>
        </li>))}</ul>
    </>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { welcomeTarget, farmSummary } from "@/lib/farm";
import { useApp, EMPTY, selList } from "@/components/AppState";
import { PageHead } from "@/components/Shell";
import { CompareChart } from "@/components/LazyCharts";
import { t } from "@/lib/i18n";

const inr = (x: number) => "₹" + Math.round(x).toLocaleString("en-IN");
const SAMPLES = [
  { name: "Vijayapura · Rabi · rainfed black soil", f: { d: "BIJAPUR", t: "Vijayapura", s: "Rabi", a: "4", ph: "8.1", soil: "deep_black", irr: "none", prev: "jowar" } },
  { name: "Dharwad · Kharif · red soil", f: { d: "DHARWAD", t: "Dharwad", s: "Kharif", a: "3", ph: "6.8", soil: "red", irr: "none", prev: "maize" } },
  { name: "Mandya · Kharif · canal irrigated", f: { d: "MANDYA", t: "Mandya", s: "Kharif", a: "2", ph: "7.2", soil: "red", irr: "full", prev: "paddy" } },
];

export default function Home() {
  const { farm, ready, rec, loading, alerts, read, lang, qs, update, hydrated, savedOnLoad, reset } = useApp();
  const router = useRouter();
  if (!hydrated) return <div className="card skel" aria-busy="true" data-testid="home-loading"><span /><span /></div>;
  const q = qs ? `?${qs}` : "";
  const ranked = rec?.results.filter((r) => r.feasible && (selList(farm) === null || selList(farm)!.includes(r.crop))) ?? [];
  const top = ranked[0];
  const unread = alerts.filter((a) => !read.has(a.id));
  const kn = lang === "kn";
  return (
    <>
      <PageHead kicker={kn ? "ಮುಖಪುಟ" : "Dashboard"} title={ready ? `${farm.t} · ${farm.s}` : (kn ? "ನಿಮ್ಮ ಹಂಗಾಮನ್ನು ಯೋಜಿಸಿ" : "Plan your season with real numbers")}
        sub={ready ? `${farm.a} acres · pH ${farm.ph || "not tested"} · ${farm.soil.replace("_", " ")} soil · water: ${farm.irr}` : (kn ? "ಮೂರು ಸರಳ ಹಂತಗಳು: ಜಮೀನು, ಮಣ್ಣು ಮತ್ತು ನೀರು, ಹೋಲಿಕೆ. ಪ್ರತಿಯೊಂದು ಅಂದಾಜು ಸಾರ್ವಜನಿಕ ಸರ್ಕಾರಿ ಮತ್ತು NASA ದತ್ತಾಂಶವನ್ನು ಆಧರಿಸಿದೆ." : "Three short steps: farm, soil and water, then compare the best crops. Every estimate is backed by public government and NASA data.")} />
      {savedOnLoad && ready && (() => { const sm = farmSummary(farm); return (
        <div className="card cta welcome" data-testid="welcome-back">
          <h3>{t("wb_title", lang)} 👋</h3><p className="muted">{t("wb_sub", lang)}</p>
          <div className="kpis">
            <div className="kpi"><span>{t("wb_place", lang)}</span><b>{sm.place}</b></div>
            <div className="kpi"><span>{t("season", lang)}</span><b>{sm.season === "Rabi" ? t("rabi", lang) : t("kharif", lang)}</b></div>
            <div className="kpi"><span>{t("area", lang)}</span><b>{sm.acres} {t("wb_acres", lang)}</b></div>
            <div className="kpi"><span>{t("ph", lang)}</span><b>{sm.ph || t("wb_ph_unknown", lang)}</b></div>
          </div>
          <div className="row-actions">
            <Link className="btn primary" href={`${welcomeTarget(farm)}${q}`}>{t("wb_results", lang)} →</Link>
            <Link className="btn ghost" href={`/farm${q}`}>{t("wb_edit", lang)}</Link>
            <button className="btn ghost" onClick={() => { if (window.confirm(t("wb_confirm", lang))) { reset(); router.push("/farm"); } }}>{t("wb_new", lang)}</button>
          </div>
        </div>); })()}
      {!ready && (
        <div className="grid2">
          <div className="card cta"><h3>{kn ? "ಹೊಸ ಯೋಜನೆ" : "Start a new plan"}</h3><p>Pick your taluk and season, then describe the field.</p>
            <Link className="btn primary" href={`/farm${q}`}>{t("start", lang)} →</Link></div>
          <div className="card"><h3>{kn ? "ಉದಾಹರಣೆಗಳು" : "Or try an example farm"}</h3>
            <div className="stack">{SAMPLES.map((s) => <button key={s.name} className="btn ghost wide" onClick={() => update({ ...EMPTY, ...s.f })}>{s.name}</button>)}</div></div>
        </div>)}
      {ready && (<>
        <div className="kpis">
          <div className="kpi"><span>Best fit</span><b>{loading ? "…" : top ? (kn ? top.label_kn : top.label) : "—"}</b><small>{top ? `${inr(top.net_typical)} ${t("per_acre", lang)}` : ""}</small></div>
          <div className="kpi"><span>Whole field, typical year</span><b>{top ? inr(top.net_typical * Number(farm.a)) : "—"}</b><small>{farm.a} acres</small></div>
          <div className="kpi"><span>Crops compared</span><b>{ranked.length}</b><small>{rec ? `${rec.results.filter((r) => r.feasible).length} feasible` : ""}</small></div>
          <div className="kpi"><span>Unread alerts</span><b>{unread.length}</b><small><Link href={`/alerts${q}`}>open alerts →</Link></small></div>
        </div>
        <div className="grid2">
          <div className="card"><h3>Profit outlook (net ₹/acre)</h3>
            {ranked.length ? <CompareChart rows={ranked.slice(0, 5).map((r) => ({ name: kn ? r.label_kn : r.label, bad: r.grid["bad/base"], typical: r.net_typical, good: r.grid["good/base"] }))} /> : <p className="muted">No feasible crop yet.</p>}
            <Link href={`/results${q}`} className="link">Full comparison →</Link></div>
          <div className="card"><h3>Latest alerts</h3>
            {alerts.slice(0, 4).map((a) => <Link key={a.id} href={`${a.href ?? "/alerts"}${q}`} className={`alertrow ${a.severity} ${read.has(a.id) ? "read" : ""}`}><b>{a.title}</b><span>{a.body}</span></Link>)}
            {!alerts.length && <p className="muted">{t("alerts_empty", lang)}</p>}</div>
        </div>
        {!savedOnLoad && <div className="row-actions"><Link className="btn ghost" href={`/farm${q}`}>{t("wb_edit", lang)}</Link><button className="btn ghost" onClick={() => update({ ...EMPTY })}>Start over</button></div>}
      </>)}
    </>
  );
}

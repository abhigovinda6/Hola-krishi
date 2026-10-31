"use client";
import Link from "next/link";
import { useApp } from "@/components/AppState";
import { PageHead, StepNav } from "@/components/Shell";
import { CompareChart } from "@/components/LazyCharts";
import AiSummary from "@/components/AiSummary";
import CropTiles from "@/components/CropTiles";
import { TOP_N } from "@/lib/tiles";
import { summarizeBlockers, phAdvice } from "@/lib/blockers";
import { t } from "@/lib/i18n";

export default function Results() {
  const { farm, rec, recError, loading, lang, qs, ready } = useApp();
  const q = qs ? `?${qs}` : ""; const kn = lang === "kn";
  const all = rec?.results ?? [];
  const rows = all.filter((r) => r.feasible).slice(0, TOP_N);
  return (
    <>
      <PageHead kicker={kn ? "ಹಂತ 3 / 3" : "Step 3 of 3"} title={t("cv_title", lang)} sub={rec ? (kn
        ? `${rec.ctx.taluk} → ${rec.ctx.district} ಜಿಲ್ಲೆ (ಇಳುವರಿ ಜಿಲ್ಲಾ ಸರಾಸರಿ) · ಬೆಲೆ: ${rec.ctx.market || "MSP ಮಾತ್ರ"} · ಸಾಮಾನ್ಯ ಮುಖ್ಯ ಹಂಗಾಮಿನ ಮಳೆ ${Math.round(rec.ctx.normal.rain_main)} ಮಿಮೀ`
        : `${rec.ctx.taluk} → ${rec.ctx.district} district (yields are district-level) · prices: ${rec.ctx.market || "MSP only"} · normal main-season rain ${Math.round(rec.ctx.normal.rain_main)} mm`) : ready ? "" : (kn ? "ಮೊದಲು ಹಂತ 1–2 ಮುಗಿಸಿ." : "Finish steps 1–2 first.")} />
      {recError && <div className="card error" role="alert"><b>We couldn&apos;t compute this.</b> {recError}</div>}
      {loading && !rec && <div className="card"><div className="skel"><span /><span /><span /></div></div>}
      {rec && rows.length <= 1 && (() => {
        const ph = farm.ph === "" ? 7 : Number(farm.ph); const groups = summarizeBlockers(all, ph); const adv = phAdvice(ph);
        return (<div className={`card banner ${rows.length ? "warnb" : "errb"}`} role="alert" data-testid="blocker-banner">
          <h3>{t(rows.length ? "one_feasible" : "none_feasible", lang)}</h3>
          {groups.length > 0 && <><p className="bl">{t("main_reasons", lang)}</p><ul>{groups.map((g) => <li key={g.kind}><b>{g.detail}</b><small>{g.crops.join(", ")}</small></li>)}</ul></>}
          {adv && <p className="agro">{t(adv === "sodic" ? "sodic_note" : "acid_note", lang)}</p>}
          <div className="row-actions"><Link className="btn primary" href={`/soil${q}`}>{t("edit_soil", lang)}</Link><Link className="btn ghost" href={`/farm${q}`}>{t("edit_farm", lang)}</Link></div>
        </div>);
      })()}
      {rec && <CropTiles results={all} alerts={rec.alerts} lang={lang} q={q} />}
      {rows.length > 0 && (<>
        <div className="card" data-testid="compare-chart"><h3>{t("cv_chart", lang)}</h3>
          <CompareChart rows={rows.map((r) => ({ name: kn ? r.label_kn : r.label, bad: r.grid["bad/base"], typical: r.net_typical, good: r.grid["good/base"] }))} /></div>
        <AiSummary />
      </>)}
      <StepNav back="/soil" next="/alerts" nextLabel="See alerts" />
    </>
  );
}

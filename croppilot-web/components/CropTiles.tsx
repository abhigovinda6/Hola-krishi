"use client";
import Link from "next/link";
import { buildTiles, barPos, W_TYPICAL, W_WORST } from "@/lib/tiles";
import { t, type Lang } from "@/lib/i18n";

const inr = (x: number) => "₹" + Math.round(x).toLocaleString("en-IN");

export default function CropTiles({ results, alerts, lang, q }: { results: any[]; alerts: any[]; lang: Lang; q: string }) {
  const { tiles, others, excluded } = buildTiles(results, alerts, lang);
  const kn = lang === "kn";
  return (<>
    <div className="tiles3" data-testid="crop-tiles">{tiles.map((x) => {
      const lo = x.yields.bad, hi = x.yields.good;
      return (
      <article key={x.crop} className={`card tile ${x.rank === 1 ? "lead" : ""}`} data-crop={x.crop} data-rank={x.rank}>
        <header className="thead"><span className="medal" aria-hidden>{x.medal}</span><h3>#{x.rank} {x.name}<small>{x.alt}</small></h3>
          <span className="score" title={kn ? "ಶ್ರೇಣಿ ಅಂಕ (₹)" : "Ranking score in ₹/acre"}>{t("cv_score", lang)} <b>{inr(x.score)}</b></span></header>
        <p className="tnote"><b>{t("cv_how", lang)}:</b> {x.note}</p>

        <section className="tsec"><h4>{t("cv_yield", lang)}</h4>
          <div className="ybar" role="img" aria-label={`${x.yields.bad.toFixed(1)} / ${x.yields.typical.toFixed(1)} / ${x.yields.good.toFixed(1)} q/acre`}>
            <i className="mark" style={{ left: `${barPos(x.yields.typical, lo, hi)}%` }} /></div>
          <div className="ylab"><span><b>{x.yields.bad.toFixed(1)}</b> {t("cv_bad", lang)}</span><span><b>{x.yields.typical.toFixed(1)}</b> {t("cv_typ", lang)}</span><span><b>{x.yields.good.toFixed(1)}</b> {t("cv_good", lang)}</span></div>
        </section>

        <section className="tsec"><h4>{t("cv_price", lang)}</h4>
          <p className="tprice"><b>{inr(x.price)}/q</b> · {x.priceSource}<small>{kn ? "ವ್ಯಾಪ್ತಿ" : "range"} {inr(x.priceLow)}–{inr(x.priceHigh)}/q</small></p></section>

        <section className="tsec"><h4>{t("cv_profit", lang)}</h4>
          <div className="tprofit"><div><small>{t("cv_worst", lang)}</small><b className={x.worst < 0 ? "neg" : ""}>{inr(x.worst)}</b></div>
            <div className="mid"><small>{t("cv_typ", lang)}</small><b>{inr(x.typical)}</b></div>
            <div><small>{t("cv_best", lang)}</small><b>{inr(x.best)}</b></div></div>
          <p className="tcost">{kn ? "ವೆಚ್ಚ" : "Cost"} ~{inr(x.cost)}/{kn ? "ಎಕರೆ" : "acre"}</p></section>

        <ul className="tchips">{x.chips.map((c, i) => <li key={i} className={`chip k-${c.kind}`}>{c.kind === "warn" ? "⚠ " : c.kind === "good" ? "✓ " : ""}{c.text}</li>)}</ul>

        <details className="why"><summary>{t("cv_why", lang)}</summary>
          <p>{kn ? "ಅಂಕ" : "Score"} = {W_TYPICAL} × {inr(x.typical)} + {W_WORST} × {inr(x.worst)}{x.why.bonus ? ` + ${inr(x.why.bonus)} ${kn ? "ದ್ವಿದಳ ಬೋನಸ್" : "pulse bonus"}` : ""} = <b>{inr(x.score)}</b></p>
          <p className="muted">{kn ? "ಸಾಮಾನ್ಯ ವರ್ಷದ ಲಾಭಕ್ಕೆ ಹೆಚ್ಚು ತೂಕ, ಕೆಟ್ಟ ವರ್ಷದ ನಷ್ಟದಿಂದ ರಕ್ಷಣೆ." : "Typical profit counts most; the worst case protects against a bad year."}
            {x.why.vsNext && (kn ? ` ${x.why.vsNext.name}ಗಿಂತ ${inr(x.why.vsNext.gap)} ಹೆಚ್ಚು.` : ` ${inr(x.why.vsNext.gap)} ahead of ${x.why.vsNext.name}.`)}</p>
        </details>
        <Link className="link" href={`/crop/${x.crop}${q}`}>{t("cv_details", lang)}</Link>
      </article>); })}</div>

    {(others.length > 0 || excluded.length > 0) && (
      <details className="card also" data-testid="also-considered"><summary><b>{t("cv_also", lang)}</b> <small>({others.length + excluded.length})</small></summary>
        {others.length > 0 && <><h4>{t("cv_lower", lang)}</h4><ul className="olist">{others.map((o) => (
          <li key={o.crop}><Link href={`/crop/${o.crop}${q}`}>#{o.rank} {o.name}</Link> <span>{t("cv_score", lang)} {inr(o.score)} · {inr(o.typical)}/{kn ? "ಎಕರೆ" : "acre"} {t("cv_typ", lang)}</span></li>))}</ul></>}
        {excluded.length > 0 && <><h4>{t("cv_excl", lang)}</h4><ul className="olist">{excluded.map((e) => (
          <li key={e.crop} className="off"><b>✕ {e.name}</b> <span className="why">{e.reasons.map((r, i) => <span key={i} className={`chip r-${r.kind}`} data-kind={r.kind}>{r.text}</span>)}</span></li>))}</ul></>}
      </details>)}
  </>);
}

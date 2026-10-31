"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppState";
import { PageHead, StepNav } from "@/components/Shell";
import { GridChart } from "@/components/LazyCharts";
import AiSummary from "@/components/AiSummary";

const inr = (x: number) => "₹" + Math.round(x).toLocaleString("en-IN");
const M: Record<string, string> = { model: "ML model (weather + last season), which won the backtest for this crop", base_hist_mean: "district historical average (it beat the ML model in the backtest)", base_last_season: "last reported season (it beat the ML model in the backtest)", base_msp: "MSP 2025-26", base_hist_ratio_x_msp: "MSP × historical harvest-price/MSP ratio" };

export default function CropDetail() {
  const { id } = useParams<{ id: string }>();
  const { rec, recError, lang, qs } = useApp(); const q = qs ? `?${qs}` : "";
  const r = rec?.results.find((x) => x.crop === id);
  const alerts = rec?.alerts.filter((a) => a.href?.startsWith(`/crop/${id}`)) ?? [];
  if (recError) return <div className="card error" role="alert">{recError}</div>;
  if (!rec) return <div className="card"><div className="skel"><span /><span /></div></div>;
  if (!r) return <div className="card error">Unknown crop for this season. <Link href={`/results${q}`}>Back to compare</Link></div>;
  const kn = lang === "kn";
  return (
    <>
      <PageHead kicker={`${rec.ctx.taluk} · ${rec.ctx.season}`} title={`${kn ? r.label_kn : r.label} ${kn ? "" : "· " + r.label_kn}`} sub={r.feasible ? `Ranked #${r.rank} of the feasible crops for this field` : "Not offered for this field"} />
      {!r.feasible ? <div className="card error"><b>Why not:</b> {r.reasons.join("; ")}</div> : (<>
        <div className="kpis">
          <div className="kpi"><span>Typical net</span><b>{inr(r.net_typical)}</b><small>per acre</small></div>
          <div className="kpi"><span>Worst → best</span><b className={r.net_worst < 0 ? "neg" : ""}>{inr(r.net_worst)}</b><small>to {inr(r.net_best)}</small></div>
          <div className="kpi"><span>Yield (bad / typical / good)</span><b>{r.yields.typical.toFixed(1)} q</b><small>{r.yields.bad.toFixed(1)} / {r.yields.typical.toFixed(1)} / {r.yields.good.toFixed(1)} q/acre</small></div>
          <div className="kpi"><span>Price base</span><b>{inr(r.prices.base)}</b><small>{inr(r.prices.low)}–{inr(r.prices.high)}/q · MSP {inr(r.msp)}</small></div>
        </div>
        <div className="grid2">
          <div className="card"><h3>Nine scenarios: yield × price (net ₹/acre)</h3><GridChart grid={r.grid} />
            <div className="tscroll" data-scroll>
<table className="mini"><thead><tr><th></th><th>Low price</th><th>Base</th><th>High price</th></tr></thead><tbody>
              {["bad", "typical", "good"].map((y) => <tr key={y}><th>{y}</th>{["low", "base", "high"].map((p) => <td key={p} className={r.grid[`${y}/${p}`] < 0 ? "neg" : ""}>{inr(r.grid[`${y}/${p}`])}</td>)}</tr>)}</tbody></table></div></div>
          <div className="card"><h3>How these numbers were made</h3>
            <dl className="how"><dt>Yield</dt><dd>{M[r.yield_method]}; latest district data {r.last_yield_year}. Bad and good years are the 10th and 90th percentiles of past errors.</dd>
              <dt>Price</dt><dd>{M[r.price_method]}. Farm-gate price = 95% of the price minus ₹50/q transport.</dd>
              <dt>Cost</dt><dd>~{inr(r.cost)}/acre = CACP all-India A2+FL cost per quintal × district average yield (an approximation).</dd>
              <dt>Rules passed</dt><dd>{r.reasons.join("; ")}</dd></dl>
            <p className="why">{rec.explanations[r.crop]}</p></div>
        </div>
        <AiSummary focus={r.crop} />
        {alerts.length > 0 && <div className="card"><h3>Alerts for this crop</h3>{alerts.map((a) => <div key={a.id} className={`alertrow ${a.severity}`}><b>{a.title}</b><span>{a.body}</span></div>)}</div>}
        <div className="card cnp"><b>Next step:</b> continue to the Polaris Crop Nutrition Plan for {r.label}, with fertiliser doses by growth stage. <span className="tag">CNP</span></div>
      </>)}
      <StepNav back="/results" next="/alerts" nextLabel="Alerts" />
    </>
  );
}

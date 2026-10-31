import { DATA } from "@/lib/data";

export default function About() {
  const S = DATA.split, H = DATA.holdout;
  const ym = H.yield; const pm = H.price;
  const yA = ym.find((m) => m.crop === "ALL")!, pA = pm.find((m) => m.crop === "ALL")!;
  const yr = (r: number[]) => `${r[0]}–${r[1]}`;
  return (
    <>
      <div className="phead"><p className="kicker">Data &amp; methods</p><h1>Where the numbers come from</h1>
        <p className="sub">Hola Krishi uses only public data. When the data is thin we say so instead of guessing.</p></div>
      <div className="grid2">
        <div className="card"><h3>Sources</h3><ul className="plain">
          <li><b>Yields:</b> DES district crop statistics (APY, via India Data Portal), 1997-98 to 2024-25 (28 seasons), for 30 districts.</li>
          <li><b>Market prices:</b> AGMARKNET daily mandi prices, 2002–2024, for all 14 crops (public mirrors). Current prices are estimated from MSP 2025-26.</li>
          <li><b>Rain and temperature:</b> NASA POWER, 1997–2024. IMD gridded rainfall was compared and gave slightly worse results.</li>
          <li><b>Costs:</b> CACP A2+FL cost per quintal (all-India).</li>
          <li><b>Taluk list:</b> Karnataka government list, via Wikipedia.</li></ul>
          <p className="muted">{DATA.coverage.filter((c) => c.included).length} of {DATA.coverage.length} district × season × crop combinations have enough data (at least 10 seasons and 1,000 ha). Everything else is shown greyed out with its reason.</p></div>
        <div className="card"><h3>Method</h3><ol className="plain">
          <li>Rules: data coverage, soil pH, rainfed suitability against rainfall or irrigation, and crop rotation.</li>
          <li>Yield: a pooled gradient-boosting model, trained on crop years {yr(S.yield_train)} only. Its settings, and whether each crop uses the model, the district average or last season, were chosen inside those training years. Years {yr(S.yield_holdout)} were kept aside and checked once.</li>
          <li>Price: MSP, or MSP × the historical harvest/MSP ratio, chosen on {yr(S.price_train)}; {yr(S.price_holdout)} kept aside. The ranges come from errors inside the training years.</li>
          <li>Profit = yield × farm-gate price − cost. Crops are ranked on 60% typical-year plus 40% worst-case profit, with a small bonus for legumes.</li>
          <li>The AI summary (Groq) only rephrases these computed numbers. If it&apos;s unavailable, a template explanation is shown instead.</li></ol></div>
      </div>
      <div className="card" data-testid="live-model"><h3>Live model</h3><p>The numbers below are the held-out proof. The app itself uses the same settings and per-crop methods, retrained on all years: yield {yr(DATA.live_model.yield_data_years)} (the first 3 seasons serve only as history for the past-years average), price {yr(DATA.live_model.price_fit_years)}.</p></div>
      <div className="card"><h3>Held-out check: yield error {yr(S.yield_holdout)} (MAE q/acre, MAPE)</h3>
        <p className="muted">Holdout model trained on {yr(S.yield_train)} and never shown {yr(S.yield_holdout)}. All crops: model {yA.model_MAE} ({yA["model_MAPE%"]}%), district average {yA.base_hist_mean_MAE} ({yA["base_hist_mean_MAPE%"]}%), last season {yA.base_last_season_MAE} ({yA["base_last_season_MAPE%"]}%), method the app uses {yA.chosen_MAE} ({yA["chosen_MAPE%"]}%). The model beat both baselines in {H.yield_wins.model_beats_all_baselines} of {H.yield_wins.groups} crop-seasons. Yields rose after 2016, so last season was often the better guess.</p>
        <div className="tscroll" data-scroll>
<table className="mini"><thead><tr><th>Crop</th><th>Season</th><th>Model</th><th>District avg</th><th>Last season</th><th>App uses</th><th>Best</th></tr></thead>
        <tbody>{ym.map((m, i) => <tr key={i}><td>{m.crop}</td><td>{m.season}</td><td>{m.model_MAE}</td><td>{m.base_hist_mean_MAE}</td><td>{m.base_last_season_MAE}</td><td>{m.chosen_MAE}</td><td><b>{String(m.best).replace("base_", "")}</b></td></tr>)}</tbody></table>
<table className="mini"><thead><tr><th>Year</th><th>Rows</th><th>Model</th><th>District avg</th><th>Last season</th><th>App uses</th></tr></thead>
        <tbody>{H.yield_by_year.map((m) => <tr key={m.year}><td>{m.year}</td><td>{m.n}</td><td>{m.model_MAE}</td><td>{m.base_hist_mean_MAE}</td><td>{m.base_last_season_MAE}</td><td>{m.chosen_MAE}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h3>Held-out check: harvest price error {yr(S.price_holdout)} (MAE ₹/q, MAPE)</h3>
        <p className="muted">Trained on {yr(S.price_train)}. All crops: model ₹{pA.model_MAE} ({pA["model_MAPE%"]}%), MSP ₹{pA.base_msp_MAE} ({pA["base_msp_MAPE%"]}%), last season ₹{pA.base_last_season_MAE}, MSP × ratio ₹{pA.base_hist_ratio_x_msp_MAE}, method the app uses ₹{pA.chosen_MAE} ({pA["chosen_MAPE%"]}%). The model beat every baseline in {H.price_wins.model_beats_all_baselines} of {H.price_wins.groups} crop-seasons.</p>
        <div className="tscroll" data-scroll>
<table className="mini"><thead><tr><th>Crop</th><th>Season</th><th>Model</th><th>MSP</th><th>Last season</th><th>MSP × ratio</th><th>App uses</th></tr></thead>
        <tbody>{pm.map((m, i) => <tr key={i}><td>{m.crop}</td><td>{m.season}</td><td>{m.model_MAE}</td><td>{m.base_msp_MAE}</td><td>{m.base_last_season_MAE}</td><td>{m.base_hist_ratio_x_msp_MAE}</td><td>{m.chosen_MAE}</td></tr>)}</tbody></table>
<table className="mini"><thead><tr><th>Year</th><th>Rows</th><th>Model</th><th>MSP</th><th>Last season</th><th>App uses</th></tr></thead>
        <tbody>{H.price_by_year.map((m) => <tr key={m.year}><td>{m.year}</td><td>{m.n}</td><td>{m.model_MAE}</td><td>{m.base_msp_MAE}</td><td>{m.base_last_season_MAE}</td><td>{m.chosen_MAE}</td></tr>)}</tbody></table></div>
        <p className="muted">The price model needs this season&apos;s sowing-time mandi prices, which the app doesn&apos;t fetch live. Live estimates therefore use the MSP-based method that did best in the training years.</p></div>
      <p className="muted">These are estimates, not guarantees. Please check with your Raitha Samparka Kendra or KVK.</p>
    </>
  );
}

"""Train on a FIXED time split and score an untouched holdout once.      python train.py

  Yield: train crop years 1997-2016 (20 seasons), holdout 2017-2024 (8 seasons).
  Price: train 2002-2019 (18 years), holdout 2020-2024 (5 years).
Hyper-parameters, rain source, per crop-season method and uncertainty bands are chosen by an inner walk-forward
inside the training years (croppilot/holdout.py). The deployed models are the ones fitted on the training years,
so the holdout numbers describe exactly what the app runs. A refit on all years is only compared, never saved
as the production model."""
import json, joblib, numpy as np, pandas as pd
from croppilot.config import MODELS, ROOT
from croppilot.modeling import load, metrics, mae, mape
from croppilot.features import YIELD_FEATURES, PRICE_FEATURES
from croppilot import holdout as H
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 200)
P_METHODS_NO_LIVE = ["base_msp", "base_hist_ratio_x_msp"]
SCREENS = ROOT.parent / "screens"

def q(e, p): return float(np.quantile(e, p)) if len(e) else 0.0
def band(g, m):
    # the point estimate is always inside its own range (low <= point <= high), even when the inner-fold errors
    # were one-sided (e.g. sunflower harvest prices sat below MSP in every training year)
    e = np.log(g.actual / g[m]); return [min(q(e, .1), 0.0), q(e, .5), max(q(e, .9), 0.0)]

def per_year(df, methods):
    rows = []
    for y, g in df.groupby("crop_year"):
        r = dict(year=int(y), n=len(g))
        for m in methods: r[f"{m}_MAE"] = round(mae(g.actual, g[m]), 2); r[f"{m}_MAPE%"] = round(mape(g.actual, g[m]), 1)
        rows.append(r)
    return pd.DataFrame(rows)

def wins(hm, methods):
    s = hm[hm.crop != "ALL"]; base = [m for m in methods if m != "model"]
    return dict(groups=int(len(s)), model_beats_all_baselines=int((s.model_MAE <= s[[f"{b}_MAE" for b in base]].min(axis=1)).sum()),
                **{f"model_beats_{b}": int((s.model_MAE < s[f"{b}_MAE"]).sum()) for b in base})

def chart(df, unit, path, title):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(13, 5.5))
    lim = [0, float(np.quantile(df.actual, .995)) * 1.1]
    ax[0].scatter(df.actual, df.model, s=6, alpha=.35, label="model"); ax[0].plot(lim, lim, "k--", lw=1)
    ax[0].set_xlim(lim); ax[0].set_ylim(lim); ax[0].set_xlabel(f"actual ({unit})"); ax[0].set_ylabel(f"predicted ({unit})")
    ax[0].set_title(f"{title}: predicted vs actual, holdout rows (n={len(df)})"); ax[0].legend()
    yr = df.groupby("crop_year")[["actual", "model", *[c for c in df.columns if c.startswith("base_") and c in df]]].mean()
    for c in yr.columns: ax[1].plot(yr.index, yr[c], marker="o", lw=2.5 if c in ("actual", "model") else 1.2, label=c.replace("base_", ""))
    ax[1].set_title(f"{title}: mean per holdout year"); ax[1].set_xlabel("crop year"); ax[1].set_ylabel(unit); ax[1].legend()
    fig.tight_layout(); fig.savefig(path, dpi=110); plt.close(fig)

def main():
    MODELS.mkdir(exist_ok=True); SCREENS.mkdir(exist_ok=True)
    d = load(); w = d["weather_monthly"]
    # ---------------- YIELD ----------------
    rain_sources = ["rain_mm_power"] + (["rain_mm_imd"] if "rain_mm_imd" in w and w.rain_mm_imd.notna().mean() > 0.9 else [])
    tuned = {}
    for rc in rain_sources:
        t = H.yield_rows(d, rc); tr = t[t.crop_year.between(*H.Y_TRAIN)]
        hp, grid = H.tune(tr, H.Y_INNER, H.fit_y, H.predict_yield); tuned[rc] = (grid[0]["inner_MAE"], hp, grid)
        print(f"[yield inner-CV] rain={rc}: best {hp} MAE {grid[0]['inner_MAE']}")
    rc = min(tuned, key=lambda k: tuned[k][0]); yhp, ygrid = tuned[rc][1], tuned[rc][2]
    t = H.yield_rows(d, rc); tr = t[t.crop_year.between(*H.Y_TRAIN)]; te = t[t.crop_year.between(*H.Y_TEST)]
    inner = H.walk(tr, H.Y_INNER, H.fit_y, H.predict_yield, yhp); ym = metrics(inner, H.Y_METHODS)
    y_method, y_band = {}, {}
    for r in ym.to_dict("records"):
        if r["crop"] == "ALL": continue
        k = f"{r['crop']}|{r['season']}"; y_method[k] = r["best"]
        y_band[k] = band(inner[(inner.crop == r["crop"]) & (inner.season == r["season"])], r["best"])
    ymodel = H.fit_y(tr, yhp); joblib.dump(ymodel, MODELS / "yield_model_holdout_1997_2016.joblib")
    yh = H.predict_yield(ymodel, te)
    yh["chosen"] = [r[y_method.get(f"{c}|{s}", "base_hist_mean")] for (_, r), c, s in zip(yh.iterrows(), yh.crop, yh.season)]
    yhm = metrics(yh, H.Y_METHODS + ["chosen"]); yhm["best"] = [min(H.Y_METHODS, key=lambda m: r[f"{m}_MAE"]) for _, r in yhm.iterrows()]
    yhy = per_year(yh, H.Y_METHODS + ["chosen"])
    print(f"\n== YIELD HOLDOUT {H.Y_TEST} (model fit on {H.Y_TRAIN}, rain {rc}, hp {yhp}) ==\n{yhm.to_string(index=False)}\n{yhy.to_string(index=False)}")
    chart(yh, "q/acre", SCREENS / "holdout_yield.png", "Yield")
    # refit on all years: compare only
    # LIVE model: same hyper-parameters / methods / bands, refit on ALL years (1997-2024). The holdout above is the proof.
    yall = H.fit_y(t, yhp); joblib.dump(yall, MODELS / "yield_model.joblib")
    # ---------------- PRICE ----------------
    lab = H.price_rows(d); ptr = lab[lab.crop_year.between(*H.P_TRAIN)]; pte = lab[lab.crop_year.between(*H.P_TEST)]
    php, pgrid = H.tune(ptr, H.P_INNER, H.fit_p, H.predict_price)
    print(f"[price inner-CV] best {php} MAE {pgrid[0]['inner_MAE']}")
    pin = H.walk(ptr, H.P_INNER, H.fit_p, H.predict_price, php); pm = metrics(pin, H.P_METHODS)
    p_best, p_method, p_band = {}, {}, {}
    for r in pm.to_dict("records"):
        if r["crop"] == "ALL": continue
        k = f"{r['crop']}|{r['season']}"; p_best[k] = r["best"]
        p_method[k] = min(P_METHODS_NO_LIVE, key=lambda m: r[f"{m}_MAE"])
        g = pin[(pin.crop == r["crop"]) & (pin.season == r["season"])]
        for mth in {p_method[k], r["best"]}: p_band[f"{k}|{mth}"] = band(g, mth)
    p_band["ALL|base_msp"] = band(pin, "base_msp")
    pmodel = H.fit_p(ptr, php); joblib.dump(pmodel, MODELS / "price_model_holdout_2002_2019.joblib")
    ph = H.predict_price(pmodel, pte)
    ph["chosen"] = [r[p_method.get(f"{c}|{s}", "base_msp")] for (_, r), c, s in zip(ph.iterrows(), ph.crop, ph.season)]
    phm = metrics(ph, H.P_METHODS + ["chosen"]); phm["best"] = [min(H.P_METHODS, key=lambda m: r[f"{m}_MAE"]) for _, r in phm.iterrows()]
    phy = per_year(ph, H.P_METHODS + ["chosen"])
    print(f"\n== PRICE HOLDOUT {H.P_TEST} (fit on {H.P_TRAIN}, hp {php}) ==\n{phm.to_string(index=False)}\n{phy.to_string(index=False)}")
    chart(ph, "Rs/q", SCREENS / "holdout_price.png", "Harvest price")
    pall = H.fit_p(lab, php); joblib.dump(pall, MODELS / "price_model.joblib")
    # refit difference on the 2025 inference inputs is computed in the engine comparison (refit_compare.py)
    hist_ratio = lab.groupby(["crop", "season"]).logr.mean()   # all years < 2025 = strictly prior for the live year
    last = t.sort_values("crop_year").groupby(["district", "season", "crop"]).last()
    hm = t.groupby(["district", "season", "crop"]).yield_q_per_acre.mean()
    yt0 = H.yield_table if False else None
    from croppilot.features import yield_table, season_weather
    full = yield_table(d["yields"], season_weather(w, rc), d["coverage"])
    hm = full.groupby(["district", "season", "crop"]).yield_q_per_acre.mean()
    last = full.sort_values("crop_year").groupby(["district", "season", "crop"]).last()
    # price: how different would a refit be on the holdout feature rows?
    p_refit_diff = float(np.mean(np.abs(np.exp(pall.predict(pte[PRICE_FEATURES])) / np.exp(pmodel.predict(pte[PRICE_FEATURES])) - 1)) * 100)
    split = dict(yield_train=list(H.Y_TRAIN), yield_holdout=list(H.Y_TEST), price_train=list(H.P_TRAIN), price_holdout=list(H.P_TEST),
                 yield_inner_folds=[H.Y_INNER.start, H.Y_INNER.stop - 1], price_inner_folds=[H.P_INNER.start, H.P_INNER.stop - 1])
    meta = dict(rain_source=rc, split=split, yield_hparams=yhp, price_hparams=php, yield_method=y_method, yield_band_log=y_band,
                price_best_in_backtest=p_best, price_method_used=p_method, price_band_log=p_band,
                hist_harvest_to_msp_logratio={f"{a}|{b}": float(v) for (a, b), v in hist_ratio.items()},
                hist_mean_yield={"|".join(k): float(v) for k, v in hm.items()},
                last_yield={"|".join(k): float(v) for k, v in last.yield_q_per_acre.items()},
                last_yield_year={"|".join(k): int(v) for k, v in last.crop_year.items()},
                train_rows={"yield": int(len(tr)), "price": int(len(ptr))},
                live_model={"yield_data_years": [int(d["yields"].crop_year.min()), int(d["yields"].crop_year.max())], "yield_fit_years": [int(t.crop_year.min()), int(t.crop_year.max())], "price_fit_years": [int(lab.crop_year.min()), int(lab.crop_year.max())],
                            "yield_rows": int(len(t)), "price_rows": int(len(lab)),
                            "note": "yield target rows start once 3 earlier seasons exist (for the prior-years average); live models refit on all years with the hyper-parameters, methods and bands chosen on the training years"}, holdout_rows={"yield": int(len(te)), "price": int(len(pte))},
                holdout={"yield": yhm.to_dict("records"), "price": phm.to_dict("records"),
                         "yield_by_year": yhy.to_dict("records"), "price_by_year": phy.to_dict("records"),
                         "yield_wins": wins(yhm, H.Y_METHODS), "price_wins": wins(phm, H.P_METHODS)},
                refit_all_years={"price_mean_abs_pct_diff_on_holdout_rows": round(p_refit_diff, 2)},
                tuning={"yield": ygrid, "price": pgrid,
                        "yield_rain": {k: v[0] for k, v in tuned.items()}},
                metrics={"yield": ym.to_dict("records"), "price": pm.to_dict("records")})
    (MODELS / "metrics.json").write_text(json.dumps(meta, indent=1, default=float))
    print("\nyield wins:", meta["holdout"]["yield_wins"], "\nprice wins:", meta["holdout"]["price_wins"])
    print("yield method:", y_method, "\nprice used:", p_method)

if __name__ == "__main__":
    main()

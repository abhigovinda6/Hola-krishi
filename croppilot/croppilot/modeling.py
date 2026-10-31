"""Walk-forward evaluation with honest baselines (used by train.py, validate.py and tests)."""
import numpy as np, pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from croppilot.config import DATA, MIN_PRICE_SEASONS
from croppilot.features import season_weather, yield_table, add_ratio_features, price_table, YIELD_FEATURES, PRICE_FEATURES

def load():
    names = ["yields", "weather_monthly", "prices_monthly", "msp", "costs", "fields", "coverage", "taluks", "districts"]
    return {n: pd.read_csv(DATA / f"{n}.csv") for n in names}

def gbm(seed=0):
    # small trees, subsampling, min leaf size: guards against overfitting a few thousand noisy rows
    return GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8,
                                     min_samples_leaf=20, random_state=seed)

def mae(a, b): return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))
def mape(a, b): a, b = np.asarray(a, float), np.asarray(b, float); return float(100 * np.mean(np.abs(a - b) / a))

import os
# train on crop_year < Y, predict Y. Default: every year from 2008 to the end of the data (override with env for comparisons)
YIELD_FOLDS = range(int(os.environ.get("CP_YF0", 2008)), int(os.environ.get("CP_YF1", 2025)))
PRICE_FOLDS = range(int(os.environ.get("CP_PF0", 2011)), int(os.environ.get("CP_PF1", 2025)))

def yield_walk_forward(d, rain_col="rain_mm_power"):
    t0 = yield_table(d["yields"], season_weather(d["weather_monthly"], rain_col), d["coverage"])
    out = []
    for Y in YIELD_FOLDS:
        tr, te = t0[t0.crop_year < Y], t0[t0.crop_year == Y]
        hm = tr.groupby(["district", "season", "crop"]).yield_q_per_acre.mean()
        tr, te = add_ratio_features(tr, hm), add_ratio_features(te, hm).dropna(subset=["hist_mean"])
        m = gbm().fit(tr[YIELD_FEATURES], np.log(tr.yield_q_per_acre / tr.hist_mean))
        out.append(te.assign(fold=Y, actual=te.yield_q_per_acre,
                             model=te.hist_mean * np.exp(m.predict(te[YIELD_FEATURES])),
                             base_hist_mean=te.hist_mean, base_last_season=te.lag_yield.fillna(te.hist_mean)))
    return pd.concat(out)

def price_walk_forward(d):
    lab = price_table(d["prices_monthly"], d["msp"], MIN_PRICE_SEASONS).dropna(subset=["harvest_price"])
    out = []
    for Y in PRICE_FOLDS:
        tr, te = lab[lab.crop_year < Y], lab[lab.crop_year == Y]
        if te.empty or tr.empty: continue
        y_tr = np.log(tr.harvest_price / tr.msp)
        m = gbm().fit(tr[PRICE_FEATURES], y_tr)
        hr = tr.assign(r=y_tr).groupby(["crop", "season"]).r.mean()
        hr_te = np.asarray(te.set_index(["crop", "season"]).index.map(hr), dtype=float)
        out.append(te.assign(fold=Y, actual=te.harvest_price, model=te.msp * np.exp(m.predict(te[PRICE_FEATURES])),
                             base_hist_ratio_x_msp=te.msp * np.exp(np.nan_to_num(hr_te)),
                             base_last_season=te.lag_harvest_price, base_msp=te.msp))
    return pd.concat(out) if out else pd.DataFrame()

def metrics(df, methods, by=("crop", "season")):
    rows = []
    groups = list(df.groupby(list(by))) + [(("ALL",) * len(by), df)]
    for k, g in groups:
        r = dict(zip(by, k if isinstance(k, tuple) else (k,))); r["n"] = len(g)
        for mth in methods:
            r[f"{mth}_MAE"] = round(mae(g.actual, g[mth]), 2); r[f"{mth}_MAPE%"] = round(mape(g.actual, g[mth]), 1)
        r["best"] = min(methods, key=lambda m: r[f"{m}_MAE"])
        rows.append(r)
    return pd.DataFrame(rows)

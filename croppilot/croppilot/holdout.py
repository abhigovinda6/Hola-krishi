"""Fixed time-based holdout.

  Yield: TRAIN crop years 1997-2016, HOLDOUT 2017-2024.   Price: TRAIN 2002-2019, HOLDOUT 2020-2024.

Everything that is *chosen* (GBM hyper-parameters, per crop-season method, uncertainty bands) is decided with an
inner walk-forward inside the training years only. The holdout is then scored once with the model fitted on the
training years. Features never look at the predicted year or later: hist_mean = mean of seasons before the year,
lag = previous reported season, price hist-ratio = mean harvest/MSP log-ratio of years before the year.
"""
import itertools, numpy as np, pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from croppilot.config import MIN_PRICE_SEASONS
from croppilot.features import season_weather, yield_table, add_ratio_features, price_table, YIELD_FEATURES, PRICE_FEATURES

Y_TRAIN, Y_TEST = (1997, 2016), (2017, 2024)
P_TRAIN, P_TEST = (2002, 2019), (2020, 2024)
Y_INNER = range(2009, 2017)     # inner walk-forward folds (train < Y, predict Y), all inside the training years
P_INNER = range(2013, 2020)
GRID = [dict(n_estimators=n, max_depth=d, learning_rate=0.05, min_samples_leaf=l)
        for n, d, l in itertools.product([150, 300], [2, 3], [20, 50])]
Y_METHODS = ["base_hist_mean", "base_last_season", "model"]
P_METHODS = ["base_msp", "base_last_season", "base_hist_ratio_x_msp", "model"]

def gbm(hp, seed=0): return GradientBoostingRegressor(subsample=0.8, random_state=seed, **hp)

def yield_rows(d, rain_col):
    return add_ratio_features(yield_table(d["yields"], season_weather(d["weather_monthly"], rain_col), d["coverage"]))

def price_rows(d):
    lab = price_table(d["prices_monthly"], d["msp"], MIN_PRICE_SEASONS).dropna(subset=["harvest_price"]).copy()
    lab["logr"] = np.log(lab.harvest_price / lab.msp)
    # expanding mean of the harvest/MSP log-ratio over years BEFORE crop_year (pooled over markets)
    yr = lab.groupby(["crop", "season", "crop_year"]).logr.agg(["sum", "count"]).reset_index().sort_values("crop_year")
    g = yr.groupby(["crop", "season"])
    yr["prior_r"] = (g["sum"].cumsum() - yr["sum"]) / (g["count"].cumsum() - yr["count"]).replace(0, np.nan)
    return lab.merge(yr[["crop", "season", "crop_year", "prior_r"]], on=["crop", "season", "crop_year"])

def predict_yield(m, te):
    return te.assign(actual=te.yield_q_per_acre, model=te.hist_mean * np.exp(m.predict(te[YIELD_FEATURES])),
                     base_hist_mean=te.hist_mean, base_last_season=te.lag_yield.fillna(te.hist_mean))

def predict_price(m, te):
    return te.assign(actual=te.harvest_price, model=te.msp * np.exp(m.predict(te[PRICE_FEATURES])),
                     base_hist_ratio_x_msp=te.msp * np.exp(te.prior_r.fillna(0)),
                     base_last_season=te.lag_harvest_price, base_msp=te.msp)

def fit_y(tr, hp): return gbm(hp).fit(tr[YIELD_FEATURES], np.log(tr.yield_q_per_acre / tr.hist_mean))
def fit_p(tr, hp): return gbm(hp).fit(tr[PRICE_FEATURES], tr.logr)

def walk(t, folds, fit, pred, hp):
    return pd.concat([pred(fit(t[t.crop_year < Y], hp), t[t.crop_year == Y]).assign(fold=Y) for Y in folds])

def tune(t, folds, fit, pred):
    """pick hyper-parameters by inner walk-forward MAE (training years only)."""
    res = []
    for hp in GRID:
        wf = walk(t, folds, fit, pred, hp); res.append((float(np.mean(np.abs(wf.actual - wf.model))), hp))
    res.sort(key=lambda x: x[0]); return res[0][1], [dict(**h, inner_MAE=round(e, 3)) for e, h in res]

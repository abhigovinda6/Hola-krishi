// Everything the engine needs, exported OFFLINE from the Python project by export_web.py (real public data).
import raw from "@/data/engine.json";

export type Season = "Kharif" | "Rabi";
export type Irrigation = "none" | "protective" | "full";
export interface CropCfg {
  label: string; label_kn: string; seasons: Season[]; ph_min: number; ph_max: number; legume: boolean; repeat_ok: boolean;
  kharif_rainfed_soils: string[]; kharif_min_rain_mm: number | null; rabi_rainfed_soils: string[];
  rabi_min_irrigation: string | null; msp_key: Record<Season, string | null>; rule_sources: string;
}
export interface Normal { rain_main: number; rain_prior: number; tmax_late: number }
export interface EngineData {
  current_crop_year: number; farmgate_deduction: number; transport_rs_per_q: number;
  irr_level: Record<Irrigation, number>; soil_types: string[]; yield_features: string[];
  crop_code: Record<string, number>; season_code: Record<Season, number>;
  crops: Record<string, CropCfg>;
  taluks: { taluk: string; district: string; market: string; market_method: string }[];
  coverage: { district: string; season: Season; crop: string; included: boolean; exclusion_reason: string; price_basis: string; yield_seasons: number }[];
  normals: Record<string, Normal>; rain_hist: Record<string, number[]>; rain_years: [number, number]; msp_prev: Record<string, number>; msp: Record<string, number>; costs: Record<string, number>;
  meta: {
    rain_source: string; yield_method: Record<string, string>; yield_band_log: Record<string, number[]>;
    price_method_used: Record<string, string>; price_band_log: Record<string, number[]>;
    hist_harvest_to_msp_logratio: Record<string, number>; hist_mean_yield: Record<string, number>;
    last_yield: Record<string, number>; last_yield_year: Record<string, number>;
  };
  metrics: { yield: Record<string, string | number>[]; price: Record<string, string | number>[] };
  split: { yield_train: number[]; yield_holdout: number[]; price_train: number[]; price_holdout: number[]; yield_inner_folds: number[]; price_inner_folds: number[] };
  live_model: { yield_data_years: number[]; yield_fit_years: number[]; price_fit_years: number[]; yield_rows: number; price_rows: number };
  holdout: {
    yield: Record<string, string | number>[]; price: Record<string, string | number>[];
    yield_by_year: Record<string, number>[]; price_by_year: Record<string, number>[];
    yield_wins: Record<string, number>; price_wins: Record<string, number>;
  };
}
export const DATA = raw as unknown as EngineData;
export const CROP_IDS = Object.keys(DATA.crops);
export const TALUK_NAMES = DATA.taluks.map((t) => t.taluk).sort();
